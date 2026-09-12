import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { sales } from './sales';
import { variants } from './variants';

export const saleItems = sqliteTable('sale_items', {
  ...baseColumns(),
  saleId: text('sale_id')
    .notNull()
    .references(() => sales.id),
  variantId: text('variant_id')
    .notNull()
    .references(() => variants.id),
  qty: integer('qty').notNull(),
  weightMgActual: integer('weight_mg_actual').notNull(),
  unitCostCentimes: integer('unit_cost_centimes').notNull(), // snapshot
  markupPctApplied: integer('markup_pct_applied').notNull(), // snapshot, basis points
  unitPriceCentimes: integer('unit_price_centimes').notNull(),
  discountCentimes: integer('discount_centimes').notNull().default(0),
});

export type SaleItem = typeof saleItems.$inferSelect;
export type NewSaleItem = typeof saleItems.$inferInsert;
