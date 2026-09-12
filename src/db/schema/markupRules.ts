import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { materials } from './materials';

// Section 2 pricing model. material_id null = applies to all materials.
// markup_bps is basis points (1/100 of a percent): 5000 = 50.00%.
export const markupRules = sqliteTable('markup_rules', {
  ...baseColumns(),
  materialId: text('material_id').references(() => materials.id),
  minWeightMg: integer('min_weight_mg').notNull(),
  maxWeightMg: integer('max_weight_mg').notNull(),
  markupBps: integer('markup_bps').notNull(),
  effectiveFrom: text('effective_from').notNull(),
});

export type MarkupRuleRow = typeof markupRules.$inferSelect;
export type NewMarkupRuleRow = typeof markupRules.$inferInsert;
