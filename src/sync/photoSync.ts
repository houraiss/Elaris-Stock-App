import { eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { piecePhotos } from '../db/schema/piecePhotos';
import { supabase } from './supabaseClient';

const BUCKET = 'piece-photos';

function extensionOf(uri: string): string {
  const match = uri.split('.').pop()?.split('?')[0];
  return match && match.length <= 5 ? match : 'jpg';
}

function contentTypeFor(extension: string): string {
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export interface PhotoSyncResult {
  uploaded: number;
}

/** Photos upload lazily (section 7): only ones without a remote_url yet. */
export async function uploadPendingPhotos(): Promise<PhotoSyncResult> {
  if (!supabase) return { uploaded: 0 };

  const pending = await db.select().from(piecePhotos).where(isNull(piecePhotos.remoteUrl));
  let uploaded = 0;

  for (const photo of pending) {
    try {
      const response = await fetch(photo.uri);
      const bytes = await response.arrayBuffer();
      const extension = extensionOf(photo.uri);
      const path = `${photo.pieceId}/${photo.id}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: contentTypeFor(extension), upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const now = new Date().toISOString();
      await db
        .update(piecePhotos)
        .set({ remoteUrl: data.publicUrl, updatedAt: now })
        .where(eq(piecePhotos.id, photo.id));
      uploaded++;
    } catch {
      // Left with remote_url null — picked up again on the next sync pass.
    }
  }

  return { uploaded };
}
