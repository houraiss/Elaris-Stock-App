import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { pieces } from './pieces';

// Stock is ALWAYS tracked here, never on pieces. Every piece has at least one
// variant; a piece with no size gets a single 'default' variant.
export const variants = sqliteTable('variants', {
  ...baseColumns(),
  pieceId: text('piece_id')
    .notNull()
    .references(() => pieces.id),
  label: text('label').notNull(), // '52', '54', '45cm', or 'default'
  sku: text('sku').unique(),
  barcode: text('barcode').unique(),
  nominalWeightMg: integer('nominal_weight_mg').notNull(),
  costCentimes: integer('cost_centimes').notNull(),
  priceCentimes: integer('price_centimes').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export type Variant = typeof variants.$inferSelect;
export type NewVariant = typeof variants.$inferInsert;
