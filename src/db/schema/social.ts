import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './_shared';
import { pieces } from './pieces';

export type SocialPlatform = 'instagram' | 'tiktok';
export type DataSource = 'manual' | 'api';

export const socialSnapshots = sqliteTable('social_snapshots', {
  ...baseColumns(),
  platform: text('platform').notNull().$type<SocialPlatform>(),
  capturedOn: text('captured_on').notNull(),
  followers: integer('followers').notNull(),
  postsCount: integer('posts_count').notNull(),
  reach: integer('reach'),
  profileViews: integer('profile_views'),
  source: text('source').notNull().$type<DataSource>(),
});

export type SocialSnapshot = typeof socialSnapshots.$inferSelect;
export type NewSocialSnapshot = typeof socialSnapshots.$inferInsert;

export const socialPosts = sqliteTable('social_posts', {
  ...baseColumns(),
  platform: text('platform').notNull().$type<SocialPlatform>(),
  externalId: text('external_id'),
  permalink: text('permalink'),
  postedAt: text('posted_at').notNull(),
  caption: text('caption'),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  shares: integer('shares').notNull().default(0),
  saves: integer('saves').notNull().default(0),
  views: integer('views').notNull().default(0),
  source: text('source').notNull().$type<DataSource>(),
});

export type SocialPost = typeof socialPosts.$inferSelect;
export type NewSocialPost = typeof socialPosts.$inferInsert;

// Small join table: lets you ask whether a post featuring a piece moved it.
export const postPieces = sqliteTable(
  'post_pieces',
  {
    postId: text('post_id')
      .notNull()
      .references(() => socialPosts.id),
    pieceId: text('piece_id')
      .notNull()
      .references(() => pieces.id),
  },
  (t) => [primaryKey({ columns: [t.postId, t.pieceId] })],
);

export type PostPiece = typeof postPieces.$inferSelect;
export type NewPostPiece = typeof postPieces.$inferInsert;
