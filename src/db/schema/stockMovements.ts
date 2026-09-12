import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { variants } from './variants';
import { sales } from './sales';
import { purchases } from './purchases';
import { customOrders } from './customOrders';

export type StockMovementType =
  | 'purchase'
  | 'sale'
  | 'return_in'
  | 'return_out'
  | 'loss'
  | 'repair_out'
  | 'repair_in'
  | 'adjustment';

// Append-only. On hand = sum(qty_delta). Committed and available are derived
// elsewhere from open layaway sales / active reservations, never stored here.
export const stockMovements = sqliteTable('stock_movements', {
  ...baseColumns(),
  variantId: text('variant_id')
    .notNull()
    .references(() => variants.id),
  type: text('type').notNull().$type<StockMovementType>(),
  qtyDelta: integer('qty_delta').notNull(),
  weightMg: integer('weight_mg'),
  unitCostCentimes: integer('unit_cost_centimes').notNull(),
  reason: text('reason'),
  occurredAt: text('occurred_at').notNull(),
  saleId: text('sale_id').references(() => sales.id),
  purchaseId: text('purchase_id').references(() => purchases.id),
  customOrderId: text('custom_order_id').references(() => customOrders.id),
});

export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
