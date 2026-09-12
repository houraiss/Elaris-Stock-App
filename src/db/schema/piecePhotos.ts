import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { pieces } from './pieces';

export const piecePhotos = sqliteTable('piece_photos', {
  ...baseColumns(),
  pieceId: text('piece_id')
    .notNull()
    .references(() => pieces.id),
  uri: text('uri').notNull(),
  remoteUrl: text('remote_url'),
  embedding: text('embedding'), // JSON-encoded float array, tier 2 visual match
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
});

export type PiecePhoto = typeof piecePhotos.$inferSelect;
export type NewPiecePhoto = typeof piecePhotos.$inferInsert;
