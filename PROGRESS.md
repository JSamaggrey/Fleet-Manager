# PROGRESS — handoff notes for continuing development

Read with `CLAUDE.md` (rules) and `AGENT.md` (spec). This file records **state, decisions, and
gotchas** that aren't obvious from the code. Keep it current at the end of each phase.

## Status

| Phase                                                                      | State    | Commit                          |
| -------------------------------------------------------------------------- | -------- | ------------------------------- |
| 0 Scaffold, architecture decision, money domain                            | Done     | `54cf965`                       |
| 1 Offline PWA shell, local workspace, settings, audit, full backup/restore | Done     | `1bdc92c`                       |
| 2 Assets, categories, depreciation schedules, revisions, period close      | Done     | see `git log --grep "Phase 2:"` |
| 3 Trip revenue, direct/shared expenses, void/reversal, audit               | **Next** | —                               |
| 4 Reports, dashboard, period filters, CSV export, exceptions               | Pending  | —                               |
| 5 Tasks, accessibility/tablet QA, release docs                             | Pending  | —                               |

Last verified (Phase 2, app v0.2.0): `pnpm check` green (192 unit/component tests).
`pnpm test:e2e` 14/14 on desktop-chromium and tablet-webkit (offline start, offline asset
creation, backup round trips with and without assets).

## Environment (Windows)

- Node 24.22.1, pnpm 12.15.0 (corepack shim in `%APPDATA%\npm`), Git 2.45. Playwright Chromium and
  WebKit browsers are installed.
- **Run pnpm via the PowerShell tool**, prefixing with
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User");`
  From Git Bash the shim path gets mangled.
- **Never put backticks or `${}` inside Bash `node -e "…"` or unquoted heredocs**: bash executes
  them and silently corrupts the code. Use the Edit/Write tools, or write a script file to the
  scratchpad and run it.
- The user's network is slow. Large downloads need a background run.
- TypeScript is pinned to **6.0.3**, not 7: typescript-eslint 8.72 needs TS < 6.1.
- TanStack Table is **v9** (`useTable`, `tableFeatures`, `createColumnHelper<typeof features, Row>()`,
  `table.FlexRender`, `getPrePaginatedRowModel`). The package ships guides under
  `node_modules/@tanstack/react-table/skills/`. Numeric columns sort descending on the first click.
- To debug a real-browser-only failure: `vite build`, `vite preview --port 4173`, then a scratchpad
  Playwright script importing `file:///…/node_modules/@playwright/test/index.mjs`. Kill the preview
  node process afterwards.

## Architecture map (enforced by ESLint layer rules in `eslint.config.js`)

```
src/domain/        pure rules + strict Zod schemas: money, periods (YearMonth), workspace, audit,
                   assets (+categories), depreciation (engine, revisions). No React/Dexie/browser APIs.
src/repositories/  interfaces: WorkspaceStore, Repositories, WorkspaceTables, TABLE_NAMES, emptyTables
src/application/   workspace-service, asset-service, depreciation-service, asset-records (shared
                   helpers: validation, audit views, insertAssetWithSchedule), demo-seed
src/persistence/   dexie/ (FmsDatabase v2 + migration, DexieWorkspaceStore), memory/,
                   workspace-store.contract.ts (shared adapter suite), dexie/migrations.test.ts
src/backup/        format.ts (envelope; frozen V1 + current V2 data schemas), backup-service.ts
src/ui/            components/, layout/, pages/, assets/ (ScheduleTable, CategoriesCard,
                   form-values), backup/, queries.ts, services.ts, device-status.ts, format.ts
src/app/           App.tsx (routes), create-services.ts (composition root), pwa.ts
src/test/          fixtures.ts (ids, clock, sample workspace/audit/category/asset/schedule)
e2e/               smoke, offline, backup-restore, assets specs + helpers
```

## Decisions in force

- **PWA + IndexedDB via Dexie** (ADR 0001). Hash routing, `base: './'`, SW `registerType: 'prompt'`.
- **Dexie transactions:** repositories use `tx.table()` explicitly (see `docs/architecture.md`).
  Never rely on implicit zones, and never await non-repository work inside `store.write()`.
- **Money** (ADR 0002): `{ amountMinor, currency: 'GHS' }`, big.js strict (string inputs only).
  Half-up rounding. Only GHS is representable.
- **IDs**: injected `newId` (`crypto.randomUUID()`). UTC ISO timestamps, displayed in the workspace
  time zone. "Current month" comes from `currentYearMonth(now, workspace.settings.timeZone)`.
- **Audit**: append-only with a monotonic `sequence`. Money in audit changes is shown as
  `"GHS 1234.56"` (`assumptionsAuditView`). The actor is `LOCAL_ACTOR`.
- **Depreciation**:
  - Straight-line, full first month, final month absorbs rounding.
  - Every assumption change creates a new schedule version with stored lines. History is never
    rewritten.
  - Explicit period close (`workspace.depreciationClosedThrough`, irreversible, ended months only).
  - Before any close a revision regenerates the whole schedule. After close it preserves closed
    lines; cost and in-service date are locked, and life is total months from in-service.
  - Archiving does not stop depreciation. Retire/dispose is disabled pending a policy.
- **Assets**: code unique ignoring case; vehicle fields only for vehicle categories; no hard
  delete; details edits are audited per field; assumptions change only via revision (preview + reason).
- **Backups**: data schemaVersion 2. v1 files are upgraded in memory on import. Cross-table
  integrity checks are listed in `docs/backup-format.md`.
- Defaults for open questions: `docs/product-defaults.md` (rows 4d–4f were added in Phase 2).

## Checklist: adding a new persisted entity (Phase 3: revenue/expenses)

1. Domain: strict Zod schema in `src/domain/<entity>/`, with `workspaceId`, UUID `id`, timestamps,
   and `moneySchema` for amounts.
2. `src/repositories/index.ts`: interface, add it to `Repositories`, `WorkspaceTables`,
   `TABLE_NAMES`, and `emptyTables()`.
3. Dexie: add a **new** `this.version(3)` block (export `SCHEMA_V3`), bump `DB_SCHEMA_VERSION`, and
   bind the repository in `repositoriesFor(tx)`.
4. Memory adapter: repository methods. Restore uniqueness checks are already generic.
5. Extend the contract suite and the migration test (v2 → v3).
6. Backup: freeze `backupDataSchemaV2`, add V3, add an upgrade step 2 → 3 (and 1 → 3 via 1 → 2),
   extend `SUPPORTED_SCHEMA_VERSIONS` and `checkIntegrity`, update `docs/backup-format.md`, and test
   restoring v1 and v2 files.
7. Service writes and audit happen in one `store.write()`. Add a Playwright test for any multi-step
   write; fake-indexeddb won't catch transaction problems.
8. UI: hooks in `ui/queries.ts`, page, nav item in `AppShell.tsx`, route in `App.tsx`.

## Phase 3 scope (AGENT.md §7–9, CLAUDE.md)

- Trip/job revenue: service date, reference, asset (an explicit "unassigned" option, shown as an
  exception), customer/contract label, description, optional origin/destination/distance/rate,
  amount (GHS), status, notes.
- Expenses: date, either a direct asset or shared/fleet classification, category,
  vendor/reference, amount, payment status/method if needed. Capital items are not operating
  expenses.
- Void/reversal with a reason instead of deletion. Audit every material change.
- Recognition default: service date / expense date (not cash). Label it in the UI.
- Do not build dispatch, GPS, payroll, or payments.

## Open items / known limitations

- How devices receive the app (fixed HTTPS hosting vs local install) is undecided.
- Not yet verified on a real iPad or Windows device (ADR 0001 proof table).
- Backups are unencrypted. The checksum catches corruption, not authorship.
- JS bundle ~700 KB in one chunk. Consider route-level code splitting.
- **Awaiting product confirmation:** recognition basis (3), full-first-month (4a), period-close
  model (4d), disposal policy (4c, blocking retire/dispose), task categories (5).
