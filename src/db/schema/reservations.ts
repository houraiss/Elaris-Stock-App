import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { variants } from './variants';
import { customers } from './customers';

export type ReservationStatus = 'held' | 'converted' | 'expired' | 'cancelled';

// Short WhatsApp holds, distinct from layaway.
export const reservations = sqliteTable('reservations', {
  ...baseColumns(),
  variantId: text('variant_id')
    .notNull()
    .references(() => variants.id),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id),
  qty: integer('qty').notNull(),
  status: text('status').notNull().$type<ReservationStatus>(),
  expiresAt: text('expires_at'),
});

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
