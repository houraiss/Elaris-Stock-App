import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';

export type SupplierKind = 'wholesaler' | 'craftsman';

export const suppliers = sqliteTable('suppliers', {
  ...baseColumns(),
  name: text('name').notNull(),
  kind: text('kind').notNull().$type<SupplierKind>(),
  phoneE164: text('phone_e164'),
  city: text('city'),
  notes: text('notes'),
});

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
