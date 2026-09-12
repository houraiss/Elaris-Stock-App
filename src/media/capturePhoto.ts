import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';

const photosDirectory = new Directory(Paths.document, 'piece-photos');

function ensurePhotosDirectory(): void {
  if (!photosDirectory.exists) {
    photosDirectory.create({ intermediates: true });
  }
}

// expo-image-picker hands back a cache URI that the OS can reclaim; copy it
// into document storage so it survives past the current app session.
async function persistPickedAsset(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  ensurePhotosDirectory();
  const sourceFile = new File(asset.uri);
  const extension = asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
  const fileName = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;
  const destination = new File(photosDirectory, fileName);
  await sourceFile.copy(destination);
  return destination.uri;
}

export type CaptureSource = 'camera' | 'library';

/** Returns the persisted local URI, or null if the user cancelled. */
export async function capturePhoto(source: CaptureSource): Promise<string | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error(`Permission to use the ${source} was not granted`);
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    allowsEditing: false,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || result.assets.length === 0) return null;

  return persistPickedAsset(result.assets[0]);
}
