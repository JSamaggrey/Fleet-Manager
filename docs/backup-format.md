# Full-workspace backup format (version 1)

A backup is one UTF-8 JSON file named `fms-<workspace>-<YYYYMMDD-HHmm>.fmsbackup.json`. It holds
every record of one local workspace. It is the **only** supported way to move a workspace between
devices, and the planned route for any future migration to a server database.

CSV/XLSX report exports are a different thing and can never be restored.

## Envelope

```jsonc
{
  "format": "fms.workspace-backup", // identifies the file type
  "formatVersion": 1, // envelope version (this document)
  "schemaVersion": 1, // database schema version of the data section
  "app": { "name": "fms", "version": "0.1.0" },
  "exportedAt": "2026-03-10T09:00:00.000Z", // UTC
  "workspace": { "id": "<uuid>", "name": "…", "kind": "business" | "demo" },
  "counts": { "workspace": 1, "auditEvents": 12 },
  "checksum": { "algorithm": "SHA-256", "value": "<64 hex chars>" },
  "data": {
    "workspace": [
      /* exactly one workspace record */
    ],
    "auditEvents": [
      /* ordered by sequence */
    ],
  },
}
```

- `checksum.value` is SHA-256 over `JSON.stringify(data)`. File whitespace does not matter.
  The checksum detects truncation and accidental corruption. It is **not** a signature, and it
  does not prove who created the file.
- The header (`workspace`, `counts`) sits outside the checksum, so import checks that it agrees with
  the verified data.
- Record shapes are the strict Zod schemas in `src/domain/workspace` and `src/domain/audit`.
  Unknown fields are rejected.
- Money (from Phase 2 onward) is stored as integer minor units plus an explicit currency code.

## Import checks (in order; the first failure stops with a clear message)

1. Size ≤ 50 MB, checked before the file is read.
2. Valid JSON.
3. `format` is `fms.workspace-backup`. This rejects CSV, reports, and other JSON files.
4. `formatVersion` and `schemaVersion` are not newer than the app supports.
5. Envelope fields are complete and well formed.
6. Checksum matches.
7. Every record passes its strict schema (UUIDs, timestamps, enums, limits).
8. Consistency: exactly one workspace; header matches data; counts match; every record belongs to
   the workspace; no duplicate IDs or audit sequence numbers.

Only after all checks pass does the user see a preview. Restoring requires a separate explicit
confirmation.

## Restore rules

- Restore works only into an **empty** workspace. It is never merged into or written over existing
  data, so restoring the same file twice is rejected.
- All records are written in one IndexedDB transaction. On any failure nothing is kept.
- IDs, timestamps and audit sequence numbers are preserved exactly. A `backup.restored` audit
  event is appended, and `lastBackupAt` is set to the backup's `exportedAt`.

## Versioning policy

- Adding a table or field: bump the database `schemaVersion`, add a Dexie migration, and add a
  backup upgrade step for older backups, with tests.
- Changing the envelope: bump `formatVersion`.
- Older backups must stay restorable. Newer backups are refused with "update the app".
