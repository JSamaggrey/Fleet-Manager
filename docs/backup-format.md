# Full-workspace backup format

A backup is one UTF-8 JSON file named `fms-<workspace>-<YYYYMMDD-HHmm>.fmsbackup.json`. It holds
every record of one local workspace. It is the **only** supported way to move a workspace between
devices, and the planned route for any future migration to a server database.

CSV/XLSX report exports are a different thing and can never be restored.

Current versions: envelope `formatVersion` **1**, data `schemaVersion` **3** (Phase 3). Data
version 1 (Phase 1) and 2 (Phase 2) files are still accepted and upgraded in memory on import.

## Envelope

```jsonc
{
  "format": "fms.workspace-backup", // identifies the file type
  "formatVersion": 1, // envelope version
  "schemaVersion": 3, // database schema version of the data section
  "app": { "name": "fms", "version": "0.3.0" },
  "exportedAt": "2026-03-10T09:00:00.000Z", // UTC
  "workspace": { "id": "<uuid>", "name": "…", "kind": "business" | "demo" },
  "counts": { "workspace": 1, "auditEvents": 12, "assetCategories": 6, "assets": 3, "…": 0 },
  "checksum": { "algorithm": "SHA-256", "value": "<64 hex chars>" },
  "data": {
    "workspace": [/* exactly one */],
    "auditEvents": [/* ordered by sequence */],
    "assetCategories": [],
    "assets": [],
    "depreciationSchedules": [/* every version, including superseded ones */],
    "depreciationLines": [/* every stored line of every version */],
    "expenseCategories": [],
    "revenueEntries": [/* including voided entries, with their reason */],
    "expenses": [/* including voided expenses, with their reason */],
  },
}
```

| Data version | Tables                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1            | `workspace` (no `depreciationClosedThrough`), `auditEvents`                                                                     |
| 2            | v1 tables plus `workspace.depreciationClosedThrough`, `assetCategories`, `assets`, `depreciationSchedules`, `depreciationLines` |
| 3            | v2 tables plus `expenseCategories`, `revenueEntries`, `expenses`                                                                |

- `checksum.value` is SHA-256 over `JSON.stringify(data)`. File whitespace does not matter.
  The checksum detects truncation and accidental corruption. It is **not** a signature, and it
  does not prove who created the file.
- The header (`workspace`, `counts`) sits outside the checksum, so import checks that it agrees with
  the verified data.
- Record shapes are the strict Zod schemas in `src/domain/*`. Unknown fields are rejected.
- Money is `{ "amountMinor": <integer pesewas>, "currency": "GHS" }`. Only GHS is accepted.
- Calendar dates are `YYYY-MM-DD`, months `YYYY-MM`, timestamps UTC ISO-8601.

## Import checks (in order; the first failure stops with a clear message)

1. Size ≤ 50 MB, checked before the file is read.
2. Valid JSON.
3. `format` is `fms.workspace-backup`. This rejects CSV, reports, and other JSON files.
4. `formatVersion` and `schemaVersion` are not newer than the app supports and are known versions.
5. Envelope fields are complete and well formed.
6. Checksum matches.
7. Every record passes the strict schema for that data version: UUIDs, dates, money, residual ≤
   cost, useful life of 1–600 months, and so on.
8. Header counts match exactly the tables present.
9. Older data versions are upgraded in memory. The v1 → v2 upgrade adds
   `depreciationClosedThrough: null` and the default asset categories. The v2 → v3 upgrade adds
   the default expense categories and empty revenue/expense tables. A v1 file goes through both.
10. Consistency:
    - exactly one workspace, and the header matches it;
    - every record belongs to that workspace;
    - no duplicate IDs or audit sequence numbers;
    - every asset's category exists;
    - asset codes are unique, ignoring case;
    - every schedule's asset exists, and schedule versions are unique per asset;
    - each asset matches its latest schedule's assumptions;
    - every line belongs to a schedule of the same asset;
    - every revenue entry and expense that names an asset refers to an existing asset;
    - every expense's category exists;
    - (schema) an expense names an asset exactly when it is a direct asset expense; amounts are
      positive GHS.

Only after all checks pass does the user see a preview. Restoring requires a separate explicit
confirmation.

## Restore rules

- Restore works only into an **empty** workspace. It is never merged into or written over existing
  data, so restoring the same file twice is rejected.
- All records are written in one IndexedDB transaction. On any failure nothing is kept.
- IDs, timestamps, audit sequence numbers, schedule versions and depreciation lines are preserved
  exactly. A `backup.restored` audit event is appended, and `lastBackupAt` is set to the backup's
  `exportedAt`.

## Versioning policy

- Adding a table or field: bump the database `schemaVersion`, add a Dexie migration, freeze the
  previous data schema in `src/backup/format.ts`, and add an upgrade step for older backups, with
  tests (`src/backup/backup-versions.test.ts`, `src/persistence/dexie/migrations.test.ts`).
  Per-version data schemas live in `BACKUP_DATA_SCHEMAS`; upgrades chain in `upgradeToCurrent`.
- Changing the envelope: bump `formatVersion`.
- Older backups must stay restorable. Newer backups are refused with "update the app".
