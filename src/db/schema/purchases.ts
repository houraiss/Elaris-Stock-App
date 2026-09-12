import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { suppliers } from './suppliers';

export const purchases = sqliteTable('purchases', {
  ...baseColumns(),
  supplierId: text('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  reference: text('reference'),
  occurredAt: text('occurred_at').notNull(),
  totalCentimes: integer('total_centimes').notNull(),
  dueOn: text('due_on'),
  note: text('note'),
});

export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;
