import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { purchases } from './purchases';
import { variants } from './variants';

export const purchaseItems = sqliteTable('purchase_items', {
  ...baseColumns(),
  purchaseId: text('purchase_id')
    .notNull()
    .references(() => purchases.id),
  variantId: text('variant_id')
    .notNull()
    .references(() => variants.id),
  qty: integer('qty').notNull(),
  weightMg: integer('weight_mg').notNull(),
  unitCostCentimes: integer('unit_cost_centimes').notNull(),
});

export type PurchaseItem = typeof purchaseItems.$inferSelect;
export type NewPurchaseItem = typeof purchaseItems.$inferInsert;
