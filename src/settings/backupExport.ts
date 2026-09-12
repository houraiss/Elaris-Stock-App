import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { buildBackupExport } from '../db/repositories/backup';

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** Ships a timestamped JSON export of every table through the share sheet. */
export async function backupNow(): Promise<void> {
  const backup = await buildBackupExport();
  const json = JSON.stringify(backup, null, 2);

  const backupsDir = new Directory(Paths.cache, 'backups');
  if (!backupsDir.exists) {
    backupsDir.create({ intermediates: true });
  }

  const file = new File(backupsDir, `elaris-backup-${timestampForFilename()}.json`);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Elaris backup' });
  } else {
    throw new Error(`Sharing isn't available on this device. Backup saved to ${file.uri}`);
  }
}
