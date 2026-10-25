# PROGRESS — handoff notes for continuing development

Read with `CLAUDE.md` (rules) and `AGENT.md` (spec). This file records **state, decisions, and
gotchas** that aren't obvious from the code. Keep it current at the end of each phase.

## Status

| Phase                                                                      | State    | Commit                          |
| -------------------------------------------------------------------------- | -------- | ------------------------------- |
| 0 Scaffold, architecture decision, money domain                            | Done     | `54cf965`                       |
| 1 Offline PWA shell, local workspace, settings, audit, full backup/restore | Done     | `1bdc92c`                       |
| 2 Assets, categories, depreciation schedules, revisions, period close      | Done     | `e0203be`                       |
| 3 Trip revenue, direct/shared expenses, void/reversal, audit               | Done     | see `git log --grep "Phase 3:"` |
| 4 Reports, dashboard, period filters, CSV export, exceptions               | **Next** | —                               |
| 5 Tasks, accessibility/tablet QA, release docs                             | Pending  | —                               |

Last verified (Phase 3, app v0.3.0): `pnpm check` green (233 unit/component tests).
`pnpm test:e2e` 18/18 on desktop-chromium and tablet-webkit (adds offline revenue/expense/void
and a demo backup round trip with revenue, expenses and voids).

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
- Shared list table: `ui/components/DataTable.tsx` + `list-features.ts` (`listFeatures`,
  column `meta: { numeric, wrap }`). Use it for new list pages.
- ESLint `react-refresh/only-export-components`: keep hooks/functions out of `.tsx` component
  files (put them in a `.ts` next to them, e.g. `ui/transactions/list-helpers.ts`).
- Playwright: `getByLabel('Status')` also matches the header "Device status"; use `exact: true`.
- To debug a real-browser-only failure: `vite build`, `vite preview --port 4173`, then a scratchpad
  Playwright script importing `file:///…/node_modules/@playwright/test/index.mjs`. Kill the preview
  node process afterwards.

## Architecture map (enforced by ESLint layer rules in `eslint.config.js`)

```
src/domain/        pure rules + strict Zod schemas: money, periods (YearMonth), workspace, audit,
                   assets (+categories), depreciation (engine, revisions), transactions (revenue,
                   expenses, expense categories, void, expenseBucket, summarizeActivity,
                   isDateInRange). No React/Dexie/browser APIs.
src/repositories/  interfaces: WorkspaceStore, Repositories, WorkspaceTables, TABLE_NAMES, emptyTables
src/application/   workspace-service, asset-service, depreciation-service, asset-records (shared
                   helpers: validation, audit views, insertAssetWithSchedule), revenue-service,
                   expense-service (+expense categories), transaction-records (AssetRef,
                   parseOrThrow, voidInfo, rejectFutureDate), errors (ValidationError, NotFoundError),
                   demo-seed (assets + activity)
src/persistence/   dexie/ (FmsDatabase v3 + migrations, DexieWorkspaceStore), memory/,
                   workspace-store.contract.ts (shared adapter suite), dexie/migrations.test.ts
src/backup/        format.ts (envelope; V1, V2 frozen + current V3; BACKUP_DATA_SCHEMAS),
                   backup-service.ts (upgradeToCurrent chains 1→2→3)
src/ui/            components/ (DataTable, list-features), layout/, pages/, assets/,
                   transactions/ (form-values, VoidAction, HistoryCard, ExpenseCategoriesCard,
                   list-controls, list-helpers), backup/, queries.ts, services.ts
src/app/           App.tsx (routes), create-services.ts (composition root), pwa.ts
src/test/          fixtures.ts (ids, clock, sample workspace/audit/category/asset/schedule)
e2e/               smoke, offline, backup-restore, assets, transactions specs + helpers
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
- **Revenue/expenses**:
  - Recognition: service date / expense date. Payment status is informational only
    (`RECOGNITION_BASIS` text is shown on every page).
  - Amounts are positive GHS. Dates cannot be after today (business time zone).
  - Unassigned only by explicit choice. Revenue `assetId: null`; expense
    `assignment: 'unassigned'`. These count as exceptions (`unassignedCount`).
  - Expense `assignment` is asset | shared | unassigned, with `assetId` set only for asset.
    `nature` is operating | capital. Buckets: capital > direct > shared > unassigned.
    Shared costs are never allocated to assets.
  - Correct (audited per field) or void (reason, permanent). No deletes, and no revenue/expense
    period lock yet.
- **Backups**: data schemaVersion 3. v1 and v2 files are upgraded in memory on import.
  Cross-table integrity checks are listed in `docs/backup-format.md`.
- Defaults for open questions: `docs/product-defaults.md` (rows 3a–3e were added in Phase 3).

## Checklist: adding a new persisted entity

1. Domain: strict Zod schema in `src/domain/<entity>/`, with `workspaceId`, UUID `id`, timestamps,
   and `moneySchema` for amounts.
2. `src/repositories/index.ts`: interface, add it to `Repositories`, `WorkspaceTables`,
   `TABLE_NAMES`, and `emptyTables()`.
3. Dexie: add a **new** `this.version(N)` block (export `SCHEMA_VN`), bump `DB_SCHEMA_VERSION`,
   and bind the repository in `repositoriesFor(tx)`.
4. Memory adapter: repository methods, and bump its default `schemaVersion`. Restore uniqueness
   checks are already generic.
5. Extend the contract suite and the migration test (v(N-1) → vN).
6. Backup: add `backupDataSchemaVN` (extend the previous one), register it in
   `BACKUP_DATA_SCHEMAS` and `SUPPORTED_SCHEMA_VERSIONS`, add an upgrade step in
   `upgradeToCurrent`, extend `checkIntegrity`, update `docs/backup-format.md`, and test restoring
   every older version (`phase1Backup`/`phase2Backup` helpers in `backup-versions.test.ts`).
7. Service writes and audit happen in one `store.write()`. Add a Playwright test for any multi-step
   write; fake-indexeddb won't catch transaction problems.
8. UI: hooks in `ui/queries.ts`, page, nav item in `AppShell.tsx`, route in `App.tsx`.

## Phase 4 scope (AGENT.md §9–10, §15)

- Period selector: week (Monday start, `settings.weekStartsOn`), month, quarter, year, custom.
  Inclusive dates in the business time zone. Add pure period-boundary functions and tests to
  `domain/periods`.
- Per-asset report: revenue − direct operating expenses − depreciation (from `effectiveLines` /
  the governing schedule for each month) = management profit. Margin only when revenue > 0,
  otherwise N/A.
- Fleet report: fleet revenue (including unassigned) − direct − shared − unassigned operating
  expenses − depreciation. Show it clearly apart from the sum of asset profits, with the shared
  line separate. Capital items are listed and never deducted.
- Depreciation is monthly, so a week or a partial month needs a stated rule (e.g. whole months
  only, or pro-rata). **Ask the user, or default to month-granular depreciation and disclose it.**
- Drill-through from the report to the records. Exception view: unassigned revenue/expenses,
  assets without activity, and so on, using only collected data. CSV export (use
  `toDecimalString`; never restorable).
- Every report shows the date range, currency, formula, basis and assumptions. Label it
  "management profit/contribution", not net profit.
- Recharts (or equivalent) only if it adds value. Watch the bundle size (~800 KB now); consider
  route-level `lazy()` splitting.

## Open items / known limitations

- How devices receive the app (fixed HTTPS hosting vs local install) is undecided.
- Not yet verified on a real iPad or Windows device (ADR 0001 proof table).
- Backups are unencrypted. The checksum catches corruption, not authorship.
- JS bundle ~700 KB in one chunk. Consider route-level code splitting.
- Revenue/expenses have no period lock. Corrections to old months are audited but allowed.
- **Awaiting product confirmation:** recognition basis (3), corrections and voids (3a), capital
  items (3d), full first month (4a), period-close model (4d), disposal policy (4c, which blocks
  retire/dispose), task categories (5).
