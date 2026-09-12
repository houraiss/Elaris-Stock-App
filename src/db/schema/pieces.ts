import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { materials } from './materials';

export type ItemType = 'model' | 'unique';
export type VariantType = 'none' | 'ring_size' | 'length';

export const pieces = sqliteTable('pieces', {
  ...baseColumns(),
  name: text('name').notNull(),
  sku: text('sku').unique(),
  category: text('category').notNull(),
  materialId: text('material_id')
    .notNull()
    .references(() => materials.id),
  itemType: text('item_type').notNull().$type<ItemType>(),
  variantType: text('variant_type').notNull().$type<VariantType>(),
  defaultCostCentimes: integer('default_cost_centimes'),
  notes: text('notes'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export type Piece = typeof pieces.$inferSelect;
export type NewPiece = typeof pieces.$inferInsert;
