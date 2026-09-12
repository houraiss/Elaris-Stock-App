import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { customers } from './customers';

export type SaleChannel = 'shop' | 'market' | 'whatsapp' | 'instagram' | 'tiktok';
export type PaymentTerms = 'immediate' | 'instalment';
export type SaleStatus = 'completed' | 'layaway_open' | 'cancelled';

export const sales = sqliteTable('sales', {
  ...baseColumns(),
  channel: text('channel').notNull().$type<SaleChannel>(),
  locationLabel: text('location_label'),
  customerId: text('customer_id').references(() => customers.id),
  subtotalCentimes: integer('subtotal_centimes').notNull(),
  discountCentimes: integer('discount_centimes').notNull().default(0),
  totalCentimes: integer('total_centimes').notNull(),
  paymentTerms: text('payment_terms').notNull().$type<PaymentTerms>(),
  status: text('status').notNull().$type<SaleStatus>(),
  occurredAt: text('occurred_at').notNull(), // when the sale was agreed
  handedOverAt: text('handed_over_at'), // when the piece physically left
  dueOn: text('due_on'),
  note: text('note'),
});

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
