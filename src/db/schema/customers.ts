import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';

export const customers = sqliteTable('customers', {
  ...baseColumns(),
  displayName: text('display_name').notNull(),
  phoneE164: text('phone_e164'),
  instagramHandle: text('instagram_handle'),
  notes: text('notes'),
});

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
