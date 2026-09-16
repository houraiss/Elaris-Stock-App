import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';

// Seed: argent_925, argent_rhodie_925, argent_800, argent_800_chrome, argent_800_dore
export type MaterialPlating = 'none' | 'rhodium' | 'chrome' | 'gold';

export const materials = sqliteTable('materials', {
  ...baseColumns(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  purity: text('purity').notNull(),
  plating: text('plating').$type<MaterialPlating>().notNull().default('none'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export type Material = typeof materials.$inferSelect;
export type NewMaterial = typeof materials.$inferInsert;
