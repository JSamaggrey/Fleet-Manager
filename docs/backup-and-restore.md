# Backing up, restoring, and moving a workspace

## Key facts

- Each device keeps its **own** workspace in the browser's storage. Nothing syncs between devices.
- Browser storage can be lost. Clearing browsing data, uninstalling the app, private browsing, or
  the browser freeing space can all remove it. **Your backup files are your safety net.**
- Backup files contain your business records **unencrypted**. Store them like confidential
  financial documents.

## Make a backup

1. Open **Backup & Restore** → **Download full backup**.
2. The browser saves `fms-<workspace>-<date-time>.fmsbackup.json` to your downloads.
3. Move it somewhere safe and secure, ideally in more than one place (e.g. an encrypted USB drive
   plus a protected company folder).

The header shows how long ago the last backup was made. A reminder appears when it is older than
the interval set in **Settings** (default 7 days). The app records that a backup file was created,
but it cannot confirm where you stored it.

## Restore on a new or empty device

1. Open the app. On the setup screen choose **Restore from a backup file** and pick the file.
2. The file is checked: format, version, checksum, and every record. You then see a preview with
   the workspace name, export time, and record counts. **Nothing has changed yet.**
3. Choose **Restore this workspace…** and confirm.

If the file is damaged, edited, from a newer app version, or not a backup at all, the app explains
why and changes nothing.

## Restore on a device that already has a workspace

Restore never merges or overwrites. To replace the current workspace:

1. **Download a full backup** of the current workspace first.
2. In **Backup & Restore** → **Erase this device’s workspace**, type the workspace name to confirm.
3. Restore from the setup screen as above.

## Moving work between devices

Backup and restore copies the **whole workspace** at a point in time. After restoring on device B,
any changes on device B are **not** sent back to device A, and vice versa. Pick one device as the
place where a workspace is maintained, or agree a hand-over routine: back up on A, restore on B,
then stop using A for that workspace.

## Keeping browser data safer

- Install the app (Chrome/Edge: install icon in the address bar; iPad: Share → **Add to Home
  Screen**) and open it from the installed icon.
- On the Backup page, use **Ask the browser to keep data** if storage shows "may be cleared".
  Browsers may decline. Back up regularly either way.
- Always use the same address for the app. A different address (domain, port, or `http` vs
  `https`) has separate, empty storage.

## Report exports (CSV) are not backups

The Reports page can save CSV files (asset and fleet profit, revenue detail, expense detail) for
spreadsheets. They hold only the rows of one report, so they **cannot** be restored, and the
restore screen rejects them. Use **Download full backup** to protect or move a workspace. CSV
files can still contain sensitive business information, so store and share them with care.
