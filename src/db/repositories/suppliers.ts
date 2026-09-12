import { eq, like } from 'drizzle-orm';
import { db } from '../client';
import { suppliers, type Supplier, type SupplierKind } from '../schema/suppliers';
import { purchases } from '../schema/purchases';
import { supplierPayments } from '../schema/supplierPayments';
import { generateId } from '../../utils/id';

export async function listSuppliers(): Promise<Supplier[]> {
  return db.select().from(suppliers);
}

export async function searchSuppliers(query: string): Promise<Supplier[]> {
  const term = query.trim();
  if (!term) return [];
  return db.select().from(suppliers).where(like(suppliers.name, `%${term}%`)).limit(15);
}

export interface NewSupplierInput {
  name: string;
  kind: SupplierKind;
  phoneE164?: string | null;
  city?: string | null;
  notes?: string | null;
}

export async function createSupplier(input: NewSupplierInput): Promise<Supplier> {
  const now = new Date().toISOString();
  const id = generateId();
  await db.insert(suppliers).values({
    id,
    name: input.name,
    kind: input.kind,
    phoneE164: input.phoneE164 ?? null,
    city: input.city ?? null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const [created] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  return created;
}

export interface SupplierBalance extends Supplier {
  totalPurchasedCentimes: number;
  totalPaidCentimes: number;
  outstandingCentimes: number;
}

/** Owed to a supplier = their purchases − their payments (section 5.4), never stored. */
export async function listSuppliersWithBalances(): Promise<SupplierBalance[]> {
  const allSuppliers = await listSuppliers();
  const result: SupplierBalance[] = [];
  for (const supplier of allSuppliers) {
    const purchaseRows = await db.select().from(purchases).where(eq(purchases.supplierId, supplier.id));
    const paymentRows = await db
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.supplierId, supplier.id));
    const totalPurchasedCentimes = purchaseRows.reduce((sum, p) => sum + p.totalCentimes, 0);
    const totalPaidCentimes = paymentRows.reduce((sum, p) => sum + p.amountCentimes, 0);
    result.push({
      ...supplier,
      totalPurchasedCentimes,
      totalPaidCentimes,
      outstandingCentimes: totalPurchasedCentimes - totalPaidCentimes,
    });
  }
  return result;
}

export async function recordSupplierPayment(
  supplierId: string,
  amountCentimes: number,
  method: 'cash' | 'card' | 'transfer',
  purchaseId?: string | null,
  note?: string | null,
): Promise<void> {
  if (amountCentimes <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }
  const now = new Date().toISOString();
  await db.insert(supplierPayments).values({
    id: generateId(),
    supplierId,
    purchaseId: purchaseId ?? null,
    amountCentimes,
    method,
    paidOn: now,
    note: note ?? null,
    createdAt: now,
    updatedAt: now,
  });
}
