import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import { reservations, type Reservation } from '../schema/reservations';
import { variants } from '../schema/variants';
import { pieces } from '../schema/pieces';
import { customers } from '../schema/customers';
import { generateId } from '../../utils/id';
import { getStockLevel } from './stock';

export interface NewReservationInput {
  variantId: string;
  customerId: string;
  qty: number;
  expiresAt?: string | null;
}

/** Short WhatsApp holds — distinct from layaway (section 5.2). */
export async function createReservation(input: NewReservationInput): Promise<Reservation> {
  if (input.qty <= 0) throw new Error('Quantity must be greater than zero');
  const level = await getStockLevel(input.variantId);
  if (input.qty > level.available) {
    throw new Error(`Only ${level.available} available for this variant`);
  }

  const now = new Date().toISOString();
  const id = generateId();
  await db.insert(reservations).values({
    id,
    variantId: input.variantId,
    customerId: input.customerId,
    qty: input.qty,
    status: 'held',
    expiresAt: input.expiresAt ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const [created] = await db.select().from(reservations).where(eq(reservations.id, id));
  return created;
}

export interface ActiveReservation extends Reservation {
  pieceId: string;
  pieceName: string;
  variantLabel: string;
  customerName: string;
  customerPhoneE164: string | null;
}

export async function listActiveReservations(): Promise<ActiveReservation[]> {
  const rows = await db
    .select({
      reservation: reservations,
      pieceId: pieces.id,
      pieceName: pieces.name,
      variantLabel: variants.label,
      customerName: customers.displayName,
      customerPhoneE164: customers.phoneE164,
    })
    .from(reservations)
    .innerJoin(variants, eq(reservations.variantId, variants.id))
    .innerJoin(pieces, eq(variants.pieceId, pieces.id))
    .innerJoin(customers, eq(reservations.customerId, customers.id))
    .where(eq(reservations.status, 'held'));

  return rows.map((r) => ({
    ...r.reservation,
    pieceId: r.pieceId,
    pieceName: r.pieceName,
    variantLabel: r.variantLabel,
    customerName: r.customerName,
    customerPhoneE164: r.customerPhoneE164,
  }));
}

async function setStatus(id: string, status: 'cancelled' | 'expired' | 'converted'): Promise<void> {
  await db
    .update(reservations)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(and(eq(reservations.id, id), eq(reservations.status, 'held')));
}

export const cancelReservation = (id: string) => setStatus(id, 'cancelled');
export const expireReservation = (id: string) => setStatus(id, 'expired');
