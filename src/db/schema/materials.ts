import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';

// Seed: argent_rhodie_925, argent_925, argent_800
export const materials = sqliteTable('materials', {
  ...baseColumns(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  purity: text('purity').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export type Material = typeof materials.$inferSelect;
export type NewMaterial = typeof materials.$inferInsert;
