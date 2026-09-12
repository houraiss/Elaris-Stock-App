import { text } from 'drizzle-orm/sqlite-core';

/**
 * Every table gets id/created_at/updated_at/synced_at. Returns a fresh set of
 * column builders on each call — drizzle column builders are single-use and
 * must not be shared across table definitions.
 */
export function baseColumns() {
  return {
    id: text('id').primaryKey(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    syncedAt: text('synced_at'),
  };
}
