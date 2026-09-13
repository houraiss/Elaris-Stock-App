import AsyncStorage from '@react-native-async-storage/async-storage';
import { isCloudConfigured } from './supabaseClient';
import { uploadPendingPhotos } from './photoSync';
import { pushOutbox } from './push';

const LAST_SYNC_KEY = 'elaris.lastSyncAt';

export async function getLastSyncAt(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SYNC_KEY);
}

export interface SyncResult {
  ranAt: string;
  pushedRowCount: number;
  photosUploaded: number;
}

/**
 * Photos first, then table rows — a photo upload sets piece_photos.remote_url
 * locally, which is exactly what the outbox push needs to carry up next.
 * Silent no-op when cloud isn't configured; the app stays fully usable
 * offline either way (section 4).
 */
export async function runSync(): Promise<SyncResult | null> {
  if (!isCloudConfigured) return null;

  const { uploaded } = await uploadPendingPhotos();
  const { pushedRowCount } = await pushOutbox();

  const ranAt = new Date().toISOString();
  await AsyncStorage.setItem(LAST_SYNC_KEY, ranAt);

  return { ranAt, pushedRowCount, photosUploaded: uploaded };
}
