import { eq, like } from 'drizzle-orm';
import { db } from '../client';
import { customers, type Customer } from '../schema/customers';
import { generateId } from '../../utils/id';

const WALK_IN_NAME = 'Walk-in customer';

export async function searchCustomers(query: string): Promise<Customer[]> {
  const term = query.trim();
  if (!term) return [];
  return db.select().from(customers).where(like(customers.displayName, `%${term}%`)).limit(15);
}

export interface NewCustomerInput {
  displayName: string;
  phoneE164?: string | null;
  instagramHandle?: string | null;
  notes?: string | null;
}

export async function createCustomer(input: NewCustomerInput): Promise<Customer> {
  const now = new Date().toISOString();
  const id = generateId();
  await db.insert(customers).values({
    id,
    displayName: input.displayName,
    phoneE164: input.phoneE164 ?? null,
    instagramHandle: input.instagramHandle ?? null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const [created] = await db.select().from(customers).where(eq(customers.id, id));
  return created;
}

/**
 * customer_payments.customer_id is required by schema even for a quick,
 * anonymous immediate sale — this gives those sales somewhere to point
 * without forcing a customer picker into the fast walk-in path.
 */
export async function getOrCreateWalkInCustomer(): Promise<Customer> {
  const [existing] = await db.select().from(customers).where(eq(customers.displayName, WALK_IN_NAME));
  if (existing) return existing;
  return createCustomer({ displayName: WALK_IN_NAME });
}
