import { eq } from 'drizzle-orm';
import { db } from '../client';
import { sales, type Sale, type SaleChannel } from '../schema/sales';
import { saleItems } from '../schema/saleItems';
import { customerPayments } from '../schema/customerPayments';
import type { PaymentMethod } from '../schema/supplierPayments';
import { stockMovements } from '../schema/stockMovements';
import { customers } from '../schema/customers';
import { generateId } from '../../utils/id';
import { getStockLevels } from './stock';
import { getOrCreateWalkInCustomer } from './customers';

export interface CartLine {
  variantId: string;
  qty: number;
  weightMgActual: number;
  unitCostCentimes: number; // snapshot from the variant at time of sale
  unitPriceCentimes: number; // what was actually charged, editable at the till
}

interface BaseSaleInput {
  channel: SaleChannel;
  locationLabel?: string | null;
  discountCentimes?: number;
  note?: string | null;
  method: PaymentMethod;
  items: CartLine[];
}

export interface ImmediateSaleInput extends BaseSaleInput {
  paymentTerms: 'immediate';
  customerId?: string | null; // defaults to the walk-in customer
}

export interface LayawaySaleInput extends BaseSaleInput {
  paymentTerms: 'instalment';
  customerId: string; // a real customer is required — you need to chase this balance
  depositCentimes: number;
  dueOn?: string | null;
}

export type NewSaleInput = ImmediateSaleInput | LayawaySaleInput;

function subtotalOf(items: CartLine[]): number {
  return items.reduce((sum, item) => sum + item.unitPriceCentimes * item.qty, 0);
}

/** Realised markup in basis points, from what was actually charged vs. cost — may
 *  differ from the rule table if the price was overridden at the till. */
function markupBpsOf(item: CartLine): number {
  if (item.unitCostCentimes <= 0) return 0;
  return Math.round(((item.unitPriceCentimes - item.unitCostCentimes) / item.unitCostCentimes) * 10_000);
}

async function assertAvailable(items: CartLine[]): Promise<void> {
  const levels = await getStockLevels(items.map((i) => i.variantId));
  for (const item of items) {
    const level = levels.get(item.variantId);
    const available = level?.available ?? 0;
    if (item.qty > available) {
      throw new Error(`Only ${available} available for this variant`);
    }
  }
}

/**
 * Layaway flow (section 5.3): the sale is booked and a deposit recorded, but
 * no stock movement is written — the piece hasn't left. It becomes
 * "committed" purely because open layaway sale_items are counted that way
 * by the stock repository. The negative movement is written only at
 * handover, on final payment (see recordPayment below).
 */
export async function createSale(input: NewSaleInput): Promise<Sale> {
  if (input.items.length === 0) {
    throw new Error('A sale must have at least one item');
  }
  await assertAvailable(input.items);

  const now = new Date().toISOString();
  const saleId = generateId();
  const subtotal = subtotalOf(input.items);
  const discount = input.discountCentimes ?? 0;
  const total = subtotal - discount;

  const customerId =
    input.paymentTerms === 'instalment' ? input.customerId : input.customerId ?? (await getOrCreateWalkInCustomer()).id;

  return db.transaction(async (tx) => {
    await tx.insert(sales).values({
      id: saleId,
      channel: input.channel,
      locationLabel: input.locationLabel ?? null,
      customerId,
      subtotalCentimes: subtotal,
      discountCentimes: discount,
      totalCentimes: total,
      paymentTerms: input.paymentTerms,
      status: input.paymentTerms === 'instalment' ? 'layaway_open' : 'completed',
      occurredAt: now,
      handedOverAt: input.paymentTerms === 'instalment' ? null : now,
      dueOn: input.paymentTerms === 'instalment' ? input.dueOn ?? null : null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of input.items) {
      await tx.insert(saleItems).values({
        id: generateId(),
        saleId,
        variantId: item.variantId,
        qty: item.qty,
        weightMgActual: item.weightMgActual,
        unitCostCentimes: item.unitCostCentimes,
        markupPctApplied: markupBpsOf(item),
        unitPriceCentimes: item.unitPriceCentimes,
        discountCentimes: 0,
        createdAt: now,
        updatedAt: now,
      });

      if (input.paymentTerms === 'immediate') {
        await tx.insert(stockMovements).values({
          id: generateId(),
          variantId: item.variantId,
          type: 'sale',
          qtyDelta: -item.qty,
          weightMg: -item.weightMgActual,
          unitCostCentimes: item.unitCostCentimes,
          reason: 'sale',
          occurredAt: now,
          saleId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const paidNow = input.paymentTerms === 'instalment' ? input.depositCentimes : total;
    if (paidNow > 0) {
      await tx.insert(customerPayments).values({
        id: generateId(),
        saleId,
        customerId,
        amountCentimes: paidNow,
        method: input.method,
        paidOn: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const [created] = await tx.select().from(sales).where(eq(sales.id, saleId));
    return created;
  });
}

export async function getSaleOutstanding(saleId: string): Promise<number> {
  const [sale] = await db.select().from(sales).where(eq(sales.id, saleId));
  if (!sale) throw new Error('Sale not found');
  const payments = await db.select().from(customerPayments).where(eq(customerPayments.saleId, saleId));
  const paid = payments.reduce((sum, p) => sum + p.amountCentimes, 0);
  return sale.totalCentimes - paid;
}

export interface OpenLayaway extends Sale {
  outstandingCentimes: number;
  customerName: string;
}

export async function listOpenLayaways(): Promise<OpenLayaway[]> {
  const rows = await db
    .select({ sale: sales, customerName: customers.displayName })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(eq(sales.status, 'layaway_open'));

  const result: OpenLayaway[] = [];
  for (const row of rows) {
    const outstandingCentimes = await getSaleOutstanding(row.sale.id);
    result.push({ ...row.sale, outstandingCentimes, customerName: row.customerName });
  }
  return result;
}

/**
 * Records a payment against an open layaway. Once payments cover the total,
 * this is the handover moment: status flips to completed, handed_over_at is
 * set, and — only now — the negative stock movement is written for every
 * item on the sale.
 */
export async function recordLayawayPayment(
  saleId: string,
  amountCentimes: number,
  method: PaymentMethod,
  note?: string | null,
): Promise<{ handedOver: boolean }> {
  if (amountCentimes <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }

  const [sale] = await db.select().from(sales).where(eq(sales.id, saleId));
  if (!sale) throw new Error('Sale not found');
  if (sale.status !== 'layaway_open') throw new Error('This sale is not an open layaway');
  if (!sale.customerId) throw new Error('Layaway sale is missing its customer');

  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    await tx.insert(customerPayments).values({
      id: generateId(),
      saleId,
      customerId: sale.customerId!,
      amountCentimes,
      method,
      paidOn: now,
      note: note ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const payments = await tx.select().from(customerPayments).where(eq(customerPayments.saleId, saleId));
    const paid = payments.reduce((sum, p) => sum + p.amountCentimes, 0);
    const outstanding = sale.totalCentimes - paid;

    if (outstanding > 0) {
      return { handedOver: false };
    }

    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId));
    for (const item of items) {
      await tx.insert(stockMovements).values({
        id: generateId(),
        variantId: item.variantId,
        type: 'sale',
        qtyDelta: -item.qty,
        weightMg: -item.weightMgActual,
        unitCostCentimes: item.unitCostCentimes,
        reason: 'layaway_handover',
        occurredAt: now,
        saleId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await tx
      .update(sales)
      .set({ status: 'completed', handedOverAt: now, updatedAt: now })
      .where(eq(sales.id, saleId));

    return { handedOver: true };
  });
}
