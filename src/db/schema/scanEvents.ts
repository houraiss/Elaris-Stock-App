import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { variants } from './variants';

export type ScanMethod = 'barcode' | 'visual' | 'vision';

// Also the training log for tier 2 (visual match).
export const scanEvents = sqliteTable('scan_events', {
  ...baseColumns(),
  capturedUri: text('captured_uri').notNull(),
  method: text('method').notNull().$type<ScanMethod>(),
  matchedVariantId: text('matched_variant_id').references(() => variants.id),
  confidence: real('confidence'),
  confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(false),
  occurredAt: text('occurred_at').notNull(),
});

export type ScanEvent = typeof scanEvents.$inferSelect;
export type NewScanEvent = typeof scanEvents.$inferInsert;
