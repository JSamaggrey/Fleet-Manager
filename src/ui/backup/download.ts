/** A generated file handed to the user: a backup (JSON) or a report export (CSV). */
export interface SavedFile {
  fileName: string;
  contents: string;
  /** Defaults to JSON (backups). */
  mimeType?: string;
}

/** Triggers a browser download of a generated file. */
export function downloadBackupFile(file: SavedFile): void {
  const blob = new Blob([file.contents], { type: file.mimeType ?? 'application/json' });
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
