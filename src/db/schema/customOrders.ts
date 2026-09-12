import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { customers } from './customers';
import { suppliers } from './suppliers';
import { materials } from './materials';

export type CustomOrderStatus =
  | 'quoted'
  | 'ordered'
  | 'in_production'
  | 'ready'
  | 'delivered'
  | 'cancelled';

// 800 silver custom-order service line.
export const customOrders = sqliteTable('custom_orders', {
  ...baseColumns(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id),
  craftsmanSupplierId: text('craftsman_supplier_id').references(() => suppliers.id),
  description: text('description').notNull(),
  referencePhotoUri: text('reference_photo_uri'),
  materialId: text('material_id')
    .notNull()
    .references(() => materials.id),
  targetSize: text('target_size'),
  targetWeightMg: integer('target_weight_mg'),
  quotedPriceCentimes: integer('quoted_price_centimes').notNull(),
  agreedCostCentimes: integer('agreed_cost_centimes'),
  status: text('status').notNull().$type<CustomOrderStatus>(),
  orderedOn: text('ordered_on'),
  promisedOn: text('promised_on'),
  deliveredOn: text('delivered_on'),
  note: text('note'),
});

export type CustomOrder = typeof customOrders.$inferSelect;
export type NewCustomOrder = typeof customOrders.$inferInsert;
