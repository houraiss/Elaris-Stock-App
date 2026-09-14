import { eq, ne } from 'drizzle-orm';
import { db } from '../client';
import { customOrders, type CustomOrder, type CustomOrderStatus } from '../schema/customOrders';
import { customers } from '../schema/customers';
import { suppliers } from '../schema/suppliers';
import { pieces } from '../schema/pieces';
import { variants } from '../schema/variants';
import { stockMovements } from '../schema/stockMovements';
import { sales } from '../schema/sales';
import { saleItems } from '../schema/saleItems';
import { customerPayments } from '../schema/customerPayments';
import { purchases } from '../schema/purchases';
import { purchaseItems } from '../schema/purchaseItems';
import { generateId } from '../../utils/id';
import type { PaymentMethod } from '../schema/supplierPayments';

export interface NewCustomOrderInput {
  customerId: string;
  craftsmanSupplierId?: string | null;
  description: string;
  materialId: string;
  targetSize?: string | null;
  targetWeightMg?: number | null;
  quotedPriceCentimes: number;
  agreedCostCentimes?: number | null;
  promisedOn?: string | null;
  note?: string | null;
}

export async function createCustomOrder(input: NewCustomOrderInput): Promise<CustomOrder> {
  const now = new Date().toISOString();
  const id = generateId();
  await db.insert(customOrders).values({
    id,
    customerId: input.customerId,
    craftsmanSupplierId: input.craftsmanSupplierId ?? null,
    description: input.description,
    materialId: input.materialId,
    targetSize: input.targetSize ?? null,
    targetWeightMg: input.targetWeightMg ?? null,
    quotedPriceCentimes: input.quotedPriceCentimes,
    agreedCostCentimes: input.agreedCostCentimes ?? null,
    status: 'quoted',
    promisedOn: input.promisedOn ?? null,
    note: input.note ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const [created] = await db.select().from(customOrders).where(eq(customOrders.id, id));
  return created;
}

export interface CustomOrderWithDetail extends CustomOrder {
  customerName: string;
  craftsmanName: string | null;
  depositsCentimes: number;
  overdue: boolean;
}

export async function listCustomOrders(): Promise<CustomOrderWithDetail[]> {
  const rows = await db
    .select({ order: customOrders, customerName: customers.displayName })
    .from(customOrders)
    .innerJoin(customers, eq(customOrders.customerId, customers.id))
    .where(ne(customOrders.status, 'cancelled'));

  const supplierRows = await db.select().from(suppliers);
  const supplierNameById = new Map(supplierRows.map((s) => [s.id, s.name]));

  const today = new Date().toISOString().slice(0, 10);
  const result: CustomOrderWithDetail[] = [];
  for (const row of rows) {
    const paymentRows = await db
      .select()
      .from(customerPayments)
      .where(eq(customerPayments.customOrderId, row.order.id));
    const depositsCentimes = paymentRows.reduce((sum, p) => sum + p.amountCentimes, 0);
    const overdue =
      row.order.status !== 'delivered' &&
      row.order.status !== 'ready' &&
      Boolean(row.order.promisedOn) &&
      row.order.promisedOn! < today;

    result.push({
      ...row.order,
      customerName: row.customerName,
      craftsmanName: row.order.craftsmanSupplierId ? (supplierNameById.get(row.order.craftsmanSupplierId) ?? null) : null,
      depositsCentimes,
      overdue,
    });
  }

  const statusOrder: CustomOrderStatus[] = ['ready', 'in_production', 'ordered', 'quoted', 'delivered'];
  return result.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
}

export async function advanceCustomOrderStatus(orderId: string, status: CustomOrderStatus): Promise<void> {
  const now = new Date().toISOString();
  const patch: { status: CustomOrderStatus; updatedAt: string; orderedOn?: string } = { status, updatedAt: now };
  if (status === 'ordered') patch.orderedOn = now;
  await db.update(customOrders).set(patch).where(eq(customOrders.id, orderId));
}

export async function cancelCustomOrder(orderId: string): Promise<void> {
  await db
    .update(customOrders)
    .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
    .where(eq(customOrders.id, orderId));
}

export async function recordCustomOrderDeposit(
  orderId: string,
  customerId: string,
  amountCentimes: number,
  method: PaymentMethod,
  note?: string | null,
): Promise<void> {
  if (amountCentimes <= 0) throw new Error('Deposit must be greater than zero');
  const now = new Date().toISOString();
  await db.insert(customerPayments).values({
    id: generateId(),
    customOrderId: orderId,
    customerId,
    amountCentimes,
    method,
    paidOn: now,
    note: note ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

export interface DeliverCustomOrderResult {
  pieceId: string;
  saleId: string;
}

/**
 * Delivery converts the order into a sale and, if the craftsman is billed
 * separately, a purchase — so custom work lands in the same revenue, cost
 * and margin figures as everything else (section 5.5). Since the piece
 * never existed in the catalogue, a one-off 'unique' piece/variant is
 * created for it, given an opening stock movement (it arrived from the
 * craftsman) immediately followed by a sale movement (it left with the
 * customer) — net zero on hand, same as any other unique piece once sold.
 * Deposits already collected during production are re-parented onto the
 * new sale so its outstanding balance comes out correct.
 */
export async function deliverCustomOrder(
  orderId: string,
  finalPaymentCentimes: number,
  finalPaymentMethod: PaymentMethod,
  actualWeightMg?: number,
): Promise<DeliverCustomOrderResult> {
  const [order] = await db.select().from(customOrders).where(eq(customOrders.id, orderId));
  if (!order) throw new Error('Custom order not found');
  if (order.status === 'delivered') throw new Error('This order was already delivered');

  const now = new Date().toISOString();
  const pieceId = generateId();
  const variantId = generateId();
  const saleId = generateId();
  const weightMg = actualWeightMg ?? order.targetWeightMg ?? 0;
  const costCentimes = order.agreedCostCentimes ?? 0;
  const priceCentimes = order.quotedPriceCentimes;

  return db.transaction(async (tx) => {
    await tx.insert(pieces).values({
      id: pieceId,
      name: `${order.description.slice(0, 60)}`,
      category: 'Custom order',
      materialId: order.materialId,
      itemType: 'unique',
      variantType: 'none',
      defaultCostCentimes: costCentimes || null,
      notes: order.description,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(variants).values({
      id: variantId,
      pieceId,
      label: 'default',
      nominalWeightMg: weightMg,
      costCentimes,
      priceCentimes,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(stockMovements).values({
      id: generateId(),
      variantId,
      type: 'purchase',
      qtyDelta: 1,
      weightMg,
      unitCostCentimes: costCentimes,
      reason: 'custom_order_delivery',
      occurredAt: now,
      customOrderId: orderId,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(sales).values({
      id: saleId,
      channel: 'shop',
      customerId: order.customerId,
      subtotalCentimes: priceCentimes,
      discountCentimes: 0,
      totalCentimes: priceCentimes,
      paymentTerms: 'immediate',
      status: 'completed',
      occurredAt: now,
      handedOverAt: now,
      note: 'Custom order delivery',
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(saleItems).values({
      id: generateId(),
      saleId,
      variantId,
      qty: 1,
      weightMgActual: weightMg,
      unitCostCentimes: costCentimes,
      markupPctApplied: costCentimes > 0 ? Math.round(((priceCentimes - costCentimes) / costCentimes) * 10_000) : 0,
      unitPriceCentimes: priceCentimes,
      discountCentimes: 0,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(stockMovements).values({
      id: generateId(),
      variantId,
      type: 'sale',
      qtyDelta: -1,
      weightMg: -weightMg,
      unitCostCentimes: costCentimes,
      reason: 'sale',
      occurredAt: now,
      saleId,
      createdAt: now,
      updatedAt: now,
    });

    // Deposits collected during production now count toward this sale too.
    await tx
      .update(customerPayments)
      .set({ saleId, updatedAt: now })
      .where(eq(customerPayments.customOrderId, orderId));

    if (finalPaymentCentimes > 0) {
      await tx.insert(customerPayments).values({
        id: generateId(),
        saleId,
        customOrderId: orderId,
        customerId: order.customerId,
        amountCentimes: finalPaymentCentimes,
        method: finalPaymentMethod,
        paidOn: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (order.craftsmanSupplierId && costCentimes > 0) {
      const purchaseId = generateId();
      await tx.insert(purchases).values({
        id: purchaseId,
        supplierId: order.craftsmanSupplierId,
        reference: 'Custom order',
        occurredAt: now,
        totalCentimes: costCentimes,
        note: order.description,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(purchaseItems).values({
        id: generateId(),
        purchaseId,
        variantId,
        qty: 1,
        weightMg,
        unitCostCentimes: costCentimes,
        createdAt: now,
        updatedAt: now,
      });
    }

    await tx
      .update(customOrders)
      .set({ status: 'delivered', deliveredOn: now, updatedAt: now })
      .where(eq(customOrders.id, orderId));

    return { pieceId, saleId };
  });
}
