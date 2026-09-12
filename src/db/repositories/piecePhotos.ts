import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import { piecePhotos, type PiecePhoto } from '../schema/piecePhotos';
import { generateId } from '../../utils/id';

export async function listPhotosForPiece(pieceId: string): Promise<PiecePhoto[]> {
  return db.select().from(piecePhotos).where(eq(piecePhotos.pieceId, pieceId));
}

/** Adds a photo. The first photo added for a piece becomes primary automatically. */
export async function addPhoto(
  pieceId: string,
  uri: string,
  makePrimary?: boolean,
): Promise<PiecePhoto> {
  const now = new Date().toISOString();
  const existing = await listPhotosForPiece(pieceId);
  const isPrimary = makePrimary ?? existing.length === 0;

  return db.transaction(async (tx) => {
    if (isPrimary) {
      await tx
        .update(piecePhotos)
        .set({ isPrimary: false, updatedAt: now })
        .where(and(eq(piecePhotos.pieceId, pieceId), eq(piecePhotos.isPrimary, true)));
    }

    const id = generateId();
    await tx.insert(piecePhotos).values({
      id,
      pieceId,
      uri,
      isPrimary,
      createdAt: now,
      updatedAt: now,
    });

    const [created] = await tx.select().from(piecePhotos).where(eq(piecePhotos.id, id));
    return created;
  });
}

export async function setPrimaryPhoto(pieceId: string, photoId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx
      .update(piecePhotos)
      .set({ isPrimary: false, updatedAt: now })
      .where(and(eq(piecePhotos.pieceId, pieceId), eq(piecePhotos.isPrimary, true)));
    await tx
      .update(piecePhotos)
      .set({ isPrimary: true, updatedAt: now })
      .where(and(eq(piecePhotos.pieceId, pieceId), eq(piecePhotos.id, photoId)));
  });
}

export async function removePhoto(photoId: string): Promise<void> {
  await db.delete(piecePhotos).where(eq(piecePhotos.id, photoId));
}
