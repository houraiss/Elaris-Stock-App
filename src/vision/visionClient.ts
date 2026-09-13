import { File } from 'expo-file-system';
import { supabase, isCloudConfigured } from '../sync/supabaseClient';
import { listPieces } from '../db/repositories/pieces';

// Vision runs through the same Supabase project (Edge Function proxying
// Claude) — no separate configuration, but it needs that project either way.
export const isVisionAvailable = isCloudConfigured;

interface ImagePayload {
  mediaType: string;
  data: string; // base64
}

function mediaTypeFor(uri: string): string {
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function toImagePayload(uri: string): Promise<ImagePayload> {
  const file = new File(uri);
  const data = await file.base64();
  return { mediaType: mediaTypeFor(uri), data };
}

export interface MatchCandidateInput {
  pieceId: string;
  label: string;
  uri: string;
}

/** Up to `limit` catalogue photos to compare a new photo against (Tier 2). */
export async function getCandidatePhotos(limit = 25): Promise<MatchCandidateInput[]> {
  const pieces = await listPieces({});
  return pieces
    .filter((p): p is typeof p & { primaryPhotoUri: string } => Boolean(p.primaryPhotoUri))
    .slice(0, limit)
    .map((p) => ({ pieceId: p.id, label: p.name, uri: p.primaryPhotoUri }));
}

export interface VisualMatch {
  pieceId: string;
  confidence: number;
  reason: string;
}

/** Tier 2 — visual match against your own catalogue, never against the wider internet. */
export async function findVisualMatches(
  photoUri: string,
  candidates: MatchCandidateInput[],
): Promise<VisualMatch[]> {
  if (!supabase) throw new Error('Cloud sync is not configured');
  if (candidates.length === 0) return [];

  const image = await toImagePayload(photoUri);
  const candidatePayloads = await Promise.all(
    candidates.map(async (c) => ({ pieceId: c.pieceId, label: c.label, image: await toImagePayload(c.uri) })),
  );

  const { data, error } = await supabase.functions.invoke('vision', {
    body: { mode: 'match', image, candidates: candidatePayloads },
  });
  if (error) throw new Error(error.message);
  return (data?.matches ?? []) as VisualMatch[];
}

export interface PieceDescription {
  category: string;
  materialGuess: string | null;
  styleDescriptors: string[];
  suggestedName: string;
  caption: string;
}

/** Tier 3 — pre-fill a new-piece form from a single photo; always reviewed, never auto-saved. */
export async function describeNewPiece(photoUri: string): Promise<PieceDescription> {
  if (!supabase) throw new Error('Cloud sync is not configured');

  const image = await toImagePayload(photoUri);
  const { data, error } = await supabase.functions.invoke('vision', {
    body: { mode: 'describe', image },
  });
  if (error) throw new Error(error.message);
  return data as PieceDescription;
}
