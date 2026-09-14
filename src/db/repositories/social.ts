import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../client';
import {
  socialSnapshots,
  socialPosts,
  postPieces,
  type SocialPlatform,
  type SocialSnapshot,
  type SocialPost,
} from '../schema/social';
import { pieces } from '../schema/pieces';
import { generateId } from '../../utils/id';

export interface NewSnapshotInput {
  platform: SocialPlatform;
  capturedOn: string;
  followers: number;
  postsCount: number;
  reach?: number | null;
  profileViews?: number | null;
}

export async function createSnapshot(input: NewSnapshotInput): Promise<SocialSnapshot> {
  const now = new Date().toISOString();
  const id = generateId();
  await db.insert(socialSnapshots).values({
    id,
    platform: input.platform,
    capturedOn: input.capturedOn,
    followers: input.followers,
    postsCount: input.postsCount,
    reach: input.reach ?? null,
    profileViews: input.profileViews ?? null,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  });
  const [created] = await db.select().from(socialSnapshots).where(eq(socialSnapshots.id, id));
  return created;
}

/** Chronological order (oldest first) — ready to feed straight into a trend chart. */
export async function listSnapshots(platform: SocialPlatform, limit = 12): Promise<SocialSnapshot[]> {
  const rows = await db
    .select()
    .from(socialSnapshots)
    .where(eq(socialSnapshots.platform, platform))
    .orderBy(desc(socialSnapshots.capturedOn))
    .limit(limit);
  return rows.reverse();
}

export interface NewPostInput {
  platform: SocialPlatform;
  postedAt: string;
  caption?: string | null;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
  pieceIds: string[];
}

export async function createPost(input: NewPostInput): Promise<SocialPost> {
  const now = new Date().toISOString();
  const id = generateId();
  await db.insert(socialPosts).values({
    id,
    platform: input.platform,
    externalId: null,
    permalink: null,
    postedAt: input.postedAt,
    caption: input.caption ?? null,
    likes: input.likes,
    comments: input.comments,
    shares: input.shares,
    saves: input.saves,
    views: input.views,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  });
  for (const pieceId of input.pieceIds) {
    await db.insert(postPieces).values({ postId: id, pieceId });
  }
  const [created] = await db.select().from(socialPosts).where(eq(socialPosts.id, id));
  return created;
}

export interface PostWithPieces extends SocialPost {
  pieceNames: string[];
}

export async function listPosts(platform?: SocialPlatform, limit = 30): Promise<PostWithPieces[]> {
  const rows = await db
    .select()
    .from(socialPosts)
    .where(platform ? eq(socialPosts.platform, platform) : undefined)
    .orderBy(desc(socialPosts.postedAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const postIds = rows.map((r) => r.id);
  const tagRows = await db
    .select({ postId: postPieces.postId, pieceName: pieces.name })
    .from(postPieces)
    .innerJoin(pieces, eq(postPieces.pieceId, pieces.id))
    .where(inArray(postPieces.postId, postIds));
  const namesByPost = new Map<string, string[]>();
  for (const r of tagRows) {
    const list = namesByPost.get(r.postId) ?? [];
    list.push(r.pieceName);
    namesByPost.set(r.postId, list);
  }

  return rows.map((r) => ({ ...r, pieceNames: namesByPost.get(r.id) ?? [] }));
}

export interface PostForPiece {
  id: string;
  platform: SocialPlatform;
  postedAt: string;
  caption: string | null;
  likes: number;
}

/** For the piece detail screen: "posts it appeared in". */
export async function getPostsForPiece(pieceId: string): Promise<PostForPiece[]> {
  const rows = await db
    .select({ post: socialPosts })
    .from(postPieces)
    .innerJoin(socialPosts, eq(postPieces.postId, socialPosts.id))
    .where(eq(postPieces.pieceId, pieceId))
    .orderBy(desc(socialPosts.postedAt));
  return rows.map((r) => ({
    id: r.post.id,
    platform: r.post.platform,
    postedAt: r.post.postedAt,
    caption: r.post.caption,
    likes: r.post.likes,
  }));
}
