import type { BackupFile } from '@/backup/backup-service';

/** Triggers a browser download of a generated backup file. */
export function downloadBackupFile(file: BackupFile): void {
  const blob = new Blob([file.contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
