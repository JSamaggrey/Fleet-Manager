# PROGRESS — handoff notes for continuing development

Read with `CLAUDE.md` (rules) and `AGENT.md` (spec). This file records **state, decisions, and
gotchas** that aren't obvious from the code. Keep it current at the end of each phase.

## Status

| Phase                                                                      | State    | Commit    |
| -------------------------------------------------------------------------- | -------- | --------- |
| 0 Scaffold, architecture decision, money domain                            | Done     | `54cf965` |
| 1 Offline PWA shell, local workspace, settings, audit, full backup/restore | Done     | `1bdc92c` |
| 2 Assets + depreciation schedule                                           | **Next** | —         |
| 3 Trip revenue, direct/shared expenses, void/reversal, audit               | Pending  | —         |
| 4 Reports, dashboard, period filters, CSV export, exceptions               | Pending  | —         |
| 5 Tasks, accessibility/tablet QA, release docs                             | Pending  | —         |

Last verified (Phase 1): `pnpm check` green (105 unit tests). `pnpm test:e2e` 10/10 on
desktop-chromium and tablet-webkit, including the offline test and backup→erase→restore.

## Environment (Windows)

- Node 24.22.1, pnpm 12.15.0 (corepack shim in `%APPDATA%\npm`), Git 2.45. Playwright Chromium and
  WebKit browsers are installed.
- **Run pnpm via the PowerShell tool**, prefixing with
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User");`
  From Git Bash the shim path gets mangled.
- Don't put backticks inside double-quoted `node -e` strings in Bash; bash executes them. Use the
  Edit tool for edits.
- The user's network is slow. Large downloads (Playwright browsers) need a background run.
- TypeScript is pinned to **6.0.3**, not 7: typescript-eslint 8.72 needs TS < 6.1.

## Architecture map (enforced by ESLint layer rules in `eslint.config.js`)

```
src/domain/        pure rules + strict Zod schemas (money, workspace, audit). No React/Dexie/browser APIs.
src/repositories/  interfaces: WorkspaceStore, Repositories, WorkspaceTables, TABLE_NAMES
src/application/   use cases (workspace-service.ts); deps injected: store, newId, now, actor
src/persistence/   dexie/ (FmsDatabase, DexieWorkspaceStore), memory/ (MemoryWorkspaceStore),
                   workspace-store.contract.ts (shared adapter test suite)
src/backup/        format.ts (envelope + data schemas), backup-service.ts (create/inspect/restore)
src/ui/            components/, layout/, pages/, backup/, queries.ts (TanStack Query hooks),
                   services.ts (ServicesContext), device-status.ts (online/storage/PWA status)
src/app/           App.tsx (HashRouter + WorkspaceGate), create-services.ts (composition root), pwa.ts
src/test/          fixtures.ts (sequentialIds, steppingClock, sampleWorkspace, sampleAuditEvent)
e2e/               Playwright specs + helpers (waitForOfflineReady, createWorkspace, navigateTo)
```

## Decisions in force

- **PWA + IndexedDB via Dexie** (ADR 0001). Hash routing, `base: './'`, SW `registerType: 'prompt'`.
- **Money** (ADR 0002): `{ amountMinor: safe integer, currency: 'GHS' }`. big.js in strict mode
  (string inputs only; `Decimal('10')`, never `Decimal(10)`). Default rounding is half-up.
  `CurrencyCode` is GHS only.
- **IDs**: `crypto.randomUUID()` is injected as `newId`. Timestamps are UTC ISO strings, displayed
  in the workspace time zone.
- **Audit**: append-only `auditEvents` with a monotonic `sequence`. Use `diffFields()` for
  field-level changes. The actor is `LOCAL_ACTOR` ('local-user'); there are no profiles.
- **One workspace per device.** Restore only into an empty store. Erase requires typing the exact
  name.
- **TanStack Query** with `networkMode: 'always'` and `retry: false`. Mutations call `invalidate()`;
  workspace replace or erase calls `reset()`.
- Defaults for open questions are in `docs/product-defaults.md`: service-date recognition, full
  first month of depreciation, final period absorbs rounding, disposal blocked, Monday week start,
  Africa/Accra.

## Checklist: adding a new persisted entity (e.g. assets in Phase 2)

1. Domain: strict Zod schema + type in `src/domain/<entity>/`. Include `workspaceId`, UUID `id`,
   `createdAt`/`updatedAt`. Money uses the integer-minor-unit `Money` shape.
2. `src/repositories/index.ts`: add a repository interface, add it to `Repositories`, add the
   table to `WorkspaceTables` and `TABLE_NAMES`.
3. Dexie: add a **new** `this.version(2).stores({...})` block (never edit version 1). Bump
   `DB_SCHEMA_VERSION`. Update the snapshot/restore table handling in `dexie-workspace-store.ts`.
4. Memory adapter: add the table to `emptyTables()` and the repos, plus uniqueness checks on
   restore.
5. Extend the contract suite for the new repository.
6. Backup: add `backupDataSchemaV2` and accept schemaVersion 1 → upgrade to 2 (old backups must stay
   restorable). Update the `unsupported-schema` check, add integrity checks (FK references,
   workspaceId), and update `docs/backup-format.md`. Test restore of a v1 backup.
7. Application service writes audit events inside the same `store.write()`. Only await repository
   calls inside `write()` (a non-Dexie await ends the IndexedDB transaction).
8. UI: query/mutation hooks in `ui/queries.ts`, page, nav item in `AppShell.tsx`, route in
   `App.tsx`.

## Phase 2 scope (from AGENT.md §5–6, CLAUDE.md)

- Asset CRUD, archive, and retire states; never hard-delete assets with financial history. Asset
  code must be unique per workspace. Categories are configurable (vehicle first), and vehicle
  fields are optional for non-vehicles. Track material changes in the audit log.
- Straight-line depreciation. Basis = cost − residual. Monthly lines show opening book value,
  charge, accumulated depreciation, closing book value, and remaining life. The final period
  absorbs rounding. Validate life > 0 and 0 ≤ residual ≤ cost, with coherent dates.
- Revisions: preview a new schedule version and preserve closed periods. Historical figures are
  never rewritten silently.
- Acquisition cost is not an operating expense. Depreciation is non-cash.
- Use TanStack Table for the asset list (search, sort, filter, pagination).
- **Needs user confirmation:** the full-first-month convention, and the disposal policy (disposal
  stays blocked until approved).

## Open items / known limitations

- How devices receive the app (fixed HTTPS hosting vs local install) is undecided; one online
  load is required.
- Not yet verified on a real iPad or Windows device (ADR 0001 proof table).
- Backups are unencrypted. The checksum catches corruption, not authorship.
- Single JS bundle of ~600 KB. Consider route-level code splitting later.
- Open product questions 1–5 in CLAUDE.md are still unanswered; the defaults above apply.
