import { inArray, isNull, lt, or } from 'drizzle-orm';
import { db } from '../db/client';
import { postPieces } from '../db/schema/social';
import { supabase } from './supabaseClient';
import { toSnakeCaseRow } from './caseConvert';
import { SYNC_TABLES, POST_PIECES_TABLE_NAME } from './tables';

const BATCH_SIZE = 200;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pushTable(name: string, table: any): Promise<number> {
  const rows = await db
    .select()
    .from(table)
    .where(or(isNull(table.syncedAt), lt(table.syncedAt, table.updatedAt)));

  if (rows.length === 0) return 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase!
      .from(name)
      .upsert(chunk.map((r) => toSnakeCaseRow(r)), { onConflict: 'id' });
    if (error) throw new Error(`Push failed for ${name}: ${error.message}`);

    const now = new Date().toISOString();
    const ids = chunk.map((r) => r.id as string);
    await db.update(table).set({ syncedAt: now }).where(inArray(table.id, ids));
  }

  return rows.length;
}

// No synced_at to track — this join table is small, so every push just
// re-upserts the full set (idempotent, harmless).
async function pushPostPieces(): Promise<number> {
  const rows = await db.select().from(postPieces);
  if (rows.length === 0) return 0;
  const { error } = await supabase!
    .from(POST_PIECES_TABLE_NAME)
    .upsert(
      rows.map((r) => toSnakeCaseRow(r)),
      { onConflict: 'post_id,piece_id' },
    );
  if (error) throw new Error(`Push failed for post_pieces: ${error.message}`);
  return rows.length;
}

export interface PushResult {
  pushedRowCount: number;
}

/** Drains the "outbox" — every row with synced_at null or stale — to Supabase. */
export async function pushOutbox(): Promise<PushResult> {
  if (!supabase) return { pushedRowCount: 0 };

  let pushedRowCount = 0;
  for (const { name, table } of SYNC_TABLES) {
    pushedRowCount += await pushTable(name, table);
  }
  pushedRowCount += await pushPostPieces();

  return { pushedRowCount };
}
