import { Directory, File, Paths } from 'expo-file-system';
import { db } from '../db/client';
import { pieces } from '../db/schema/pieces';
import { piecePhotos, type PiecePhoto } from '../db/schema/piecePhotos';
import { materials } from '../db/schema/materials';
import { markupRules } from '../db/schema/markupRules';
import { postPieces } from '../db/schema/social';
import { supabase } from './supabaseClient';
import { toCamelCaseRow } from './caseConvert';
import { SYNC_TABLES, POST_PIECES_TABLE_NAME } from './tables';

const photosDirectory = new Directory(Paths.document, 'piece-photos');

// Same fetch+arrayBuffer approach photoSync.ts already uses successfully for
// uploads — File.downloadFileAsync was found (via device logs) to write the
// error response body straight to disk on a bad request instead of throwing,
// so an explicit response.ok check is essential here.
async function downloadPhotoLocally(remoteUrl: string, photoId: string): Promise<string> {
  if (!photosDirectory.exists) {
    photosDirectory.create({ intermediates: true });
  }
  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${remoteUrl}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());

  const extension = remoteUrl.split('.').pop()?.split('?')[0] || 'jpg';
  const destination = new File(photosDirectory, `${photoId}.${extension}`);
  if (destination.exists) {
    destination.delete();
  }
  destination.create();
  destination.write(bytes);
  return destination.uri;
}

/** True once anything real has been entered — the guard for offering restore. */
export async function hasLocalCatalogueData(): Promise<boolean> {
  const [row] = await db.select({ id: pieces.id }).from(pieces).limit(1);
  return Boolean(row);
}

export interface RestoreResult {
  restoredRowCounts: Record<string, number>;
  photosDownloaded: number;
}

/**
 * Pulls every table from Supabase into a (presumably fresh) local database,
 * in the same dependency order used for push, downloading each piece photo
 * back to local storage since a new device has no local file at the old uri.
 */
export async function restoreFromCloud(): Promise<RestoreResult> {
  if (!supabase) throw new Error('Cloud sync is not configured');

  // materials/markup_rules are auto-seeded locally with fresh random ids on
  // every empty install (App.tsx's seedDatabase() runs before this screen
  // is ever reachable). Left in place, those would collide by natural key
  // (materials.code) with the cloud rows below, and SQLite's "insert or
  // ignore" semantics swallow that silently — the piece/variant rows that
  // reference the cloud material ids then fail their foreign key too, just
  // as quietly, so the whole restore looks like a no-op. Neither table has
  // any other legitimate local data this early (materials has no create UI
  // at all; markup_rules would only hold the seed defaults before a first
  // piece exists), so it's safe to clear them and let the cloud ids win.
  await db.delete(markupRules);
  await db.delete(materials);

  const restoredRowCounts: Record<string, number> = {};

  for (const { name, table } of SYNC_TABLES) {
    if (name === 'piece_photos') continue; // needs file downloads, handled below
    const { data, error } = await supabase.from(name).select('*');
    if (error) throw new Error(`Restore failed for ${name}: ${error.message}`);
    restoredRowCounts[name] = data?.length ?? 0;
    if (!data || data.length === 0) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(table as any).values(data.map((r) => toCamelCaseRow(r))).onConflictDoNothing();
  }

  const { data: photoRows, error: photoError } = await supabase.from('piece_photos').select('*');
  if (photoError) throw new Error(`Restore failed for piece_photos: ${photoError.message}`);
  let photosDownloaded = 0;
  if (photoRows) {
    for (const raw of photoRows) {
      const row = toCamelCaseRow(raw) as unknown as PiecePhoto;
      let localUri = row.uri;
      if (row.remoteUrl) {
        try {
          localUri = await downloadPhotoLocally(row.remoteUrl, row.id);
          photosDownloaded++;
        } catch (err) {
          // Keep the original (now almost certainly invalid) uri as a fallback,
          // but surface the reason instead of failing silently.
          console.warn(`Photo download failed for ${row.id}:`, err);
        }
      }
      // onConflictDoUpdate (not DoNothing): a retry after a previously failed
      // download must be able to overwrite the bad local uri it left behind.
      await db
        .insert(piecePhotos)
        .values({ ...row, uri: localUri })
        .onConflictDoUpdate({ target: piecePhotos.id, set: { uri: localUri, remoteUrl: row.remoteUrl } });
    }
  }
  restoredRowCounts.piece_photos = photoRows?.length ?? 0;

  const { data: postPieceRows, error: postPieceError } = await supabase.from(POST_PIECES_TABLE_NAME).select('*');
  if (postPieceError) throw new Error(`Restore failed for post_pieces: ${postPieceError.message}`);
  if (postPieceRows && postPieceRows.length > 0) {
    const values = postPieceRows.map((r) => toCamelCaseRow(r)) as { postId: string; pieceId: string }[];
    await db.insert(postPieces).values(values).onConflictDoNothing();
  }
  restoredRowCounts[POST_PIECES_TABLE_NAME] = postPieceRows?.length ?? 0;

  return { restoredRowCounts, photosDownloaded };
}
