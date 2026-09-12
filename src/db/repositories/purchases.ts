import { eq } from 'drizzle-orm';
import { db } from '../client';
import { purchases, type Purchase } from '../schema/purchases';
import { purchaseItems } from '../schema/purchaseItems';
import { supplierPayments } from '../schema/supplierPayments';
import { stockMovements } from '../schema/stockMovements';
import { variants } from '../schema/variants';
import { generateId } from '../../utils/id';

export interface NewPurchaseItemInput {
  variantId: string;
  qty: number;
  weightMg: number; // total weight for this line
  unitCostCentimes: number;
}

export interface NewPurchaseInput {
  supplierId: string;
  reference?: string | null;
  dueOn?: string | null;
  note?: string | null;
  items: NewPurchaseItemInput[];
}

/**
 * Confirming a purchase writes stock movements and the debt in one
 * transaction (section 5.4) — stock and liability are created by the same
 * action, because that's how it happens in reality.
 */
export async function createPurchase(input: NewPurchaseInput): Promise<Purchase> {
  if (input.items.length === 0) {
    throw new Error('A purchase must have at least one item');
  }

  const now = new Date().toISOString();
  const purchaseId = generateId();
  const total = input.items.reduce((sum, item) => sum + item.unitCostCentimes * item.qty, 0);

  return db.transaction(async (tx) => {
    await tx.insert(purchases).values({
      id: purchaseId,
      supplierId: input.supplierId,
      reference: input.reference ?? null,
      occurredAt: now,
      totalCentimes: total,
      dueOn: input.dueOn ?? null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of input.items) {
      await tx.insert(purchaseItems).values({
        id: generateId(),
        purchaseId,
        variantId: item.variantId,
        qty: item.qty,
        weightMg: item.weightMg,
        unitCostCentimes: item.unitCostCentimes,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(stockMovements).values({
        id: generateId(),
        variantId: item.variantId,
        type: 'purchase',
        qtyDelta: item.qty,
        weightMg: item.weightMg,
        unitCostCentimes: item.unitCostCentimes,
        reason: 'purchase',
        occurredAt: now,
        purchaseId,
        createdAt: now,
        updatedAt: now,
      });

      // The variant's cost basis moves with the latest wholesale price paid.
      await tx
        .update(variants)
        .set({ costCentimes: item.unitCostCentimes, updatedAt: now })
        .where(eq(variants.id, item.variantId));
    }

    const [created] = await tx.select().from(purchases).where(eq(purchases.id, purchaseId));
    return created;
  });
}

export interface PurchaseWithProgress extends Purchase {
  paidCentimes: number;
  outstandingCentimes: number;
}

export async function listPurchasesForSupplier(supplierId: string): Promise<PurchaseWithProgress[]> {
  const rows = await db.select().from(purchases).where(eq(purchases.supplierId, supplierId));
  const result: PurchaseWithProgress[] = [];
  for (const purchase of rows) {
    const paymentRows = await db
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.purchaseId, purchase.id));
    const paidCentimes = paymentRows.reduce((sum, p) => sum + p.amountCentimes, 0);
    result.push({ ...purchase, paidCentimes, outstandingCentimes: purchase.totalCentimes - paidCentimes });
  }
  return result.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
}
