# PROGRESS — handoff notes for continuing development

Read with `CLAUDE.md` (rules) and `AGENT.md` (spec). This file records **state, decisions, and
gotchas** that aren't obvious from the code. Keep it current at the end of each phase.

## Status

| Phase                                                                      | State | Commit    |
| -------------------------------------------------------------------------- | ----- | --------- |
| 0 Scaffold, architecture decision, money domain                            | Done  | `5c01a5e` |
| 1 Offline PWA shell, local workspace, settings, audit, full backup/restore | Done  | `0126844` |
| 2 Assets, categories, depreciation schedules, revisions, period close      | Done  | `c163fd0` |
| 3 Trip revenue, direct/shared expenses, void/reversal, audit               | Done  | `af273e9` |
| 4 Reports, dashboard, period filters, CSV export, exceptions               | Done  | `c1e91eb` |
| 5 Tasks, accessibility, release docs (real-device QA still manual)         | Done  | `8942092` |

Last verified (Phase 5, app v0.5.0): `pnpm check` green (274 unit/component tests).
`pnpm test:e2e` 33/33 on desktop-chromium, tablet-webkit (iPad) and tablet-android (Galaxy Tab S9), including the axe WCAG 2.1 AA scan
of every page. Main JS chunk is about 491 KB (157 KB gzipped).

**Hosting:** GitHub Pages at https://jsamaggrey.github.io/Fleet-Manager/ from the public repo
`JSamaggrey/Fleet-Manager`. Pushing to `main` runs `.github/workflows/deploy.yml` (pnpm check, all
Playwright profiles, then deploy). Commits use the noreply email
`121378447+JSamaggrey@users.noreply.github.com`, set in the repo-local git config; never commit with
the personal address. `gh` is at `/c/Program Files/GitHub CLI/gh.exe` (Git Bash path) and is logged in as JSamaggrey.

**What's next:** run `docs/device-qa.md` on a real iPad, Android tablet and Windows PC using the
hosted address; get answers to the open product questions below. After that, follow
`docs/release-checklist.md` for the pilot release. Anything further (stored tasks, charts,
disposal, period lock for revenue/expenses, backend/sync) needs a product decision first.

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
- Testing Library `asyncUtilTimeout` is 5 s (`src/test/setup.ts`). Pages are lazy-loaded and run
  several queries, so always `findBy…` the first element of a newly opened page, and wait for
  data-dependent content, not just the heading.
- New pages: add them to `src/app/lazy-pages.ts` (named export → `lazy`), not as direct imports in
  `App.tsx`.
- To debug a real-browser-only failure: `vite build`, `vite preview --port 4173`, then a scratchpad
  Playwright script importing `file:///…/node_modules/@playwright/test/index.mjs`. Kill the preview
  node process afterwards.

## Architecture map (enforced by ESLint layer rules in `eslint.config.js`)

```
src/domain/        pure rules + strict Zod schemas: money, periods (YearMonth), workspace, audit,
                   assets (+categories), depreciation (engine, revisions), transactions (revenue,
                   expenses, expense categories, void, expenseBucket, summarizeActivity,
                   isDateInRange), periods/date-range (week/month/quarter/year ranges,
                   monthsInRange), reports (buildProfitReport, depreciationInRange, formula and
                   assumption texts, CSV). money has prorate and percentOf. No React/Dexie/browser APIs.
src/repositories/  interfaces: WorkspaceStore, Repositories, WorkspaceTables, TABLE_NAMES, emptyTables
src/application/   workspace-service, asset-service, depreciation-service, asset-records (shared
                   helpers: validation, audit views, insertAssetWithSchedule), revenue-service,
                   expense-service (+expense categories), transaction-records (AssetRef,
                   parseOrThrow, voidInfo, rejectFutureDate), errors (ValidationError, NotFoundError),
                   demo-seed (assets + activity), report-service (profitReport, exceptions,
                   profit/revenue/expense CSV)
src/persistence/   dexie/ (FmsDatabase v3 + migrations, DexieWorkspaceStore), memory/,
                   workspace-store.contract.ts (shared adapter suite), dexie/migrations.test.ts
src/backup/        format.ts (envelope; V1, V2 frozen + current V3; BACKUP_DATA_SCHEMAS),
                   backup-service.ts (upgradeToCurrent chains 1→2→3)
src/ui/            components/ (DataTable, list-features), layout/, pages/, assets/,
                   transactions/ (form-values, VoidAction, HistoryCard, ExpenseCategoriesCard,
                   list-controls, list-helpers), reports/ (PeriodPicker, report-period: period in
                   URL ?kind=&from=&to=), backup/ (download.ts SavedFile for JSON + CSV),
                   queries.ts, services.ts
src/app/           App.tsx (routes), lazy-pages.ts (code-split pages), create-services.ts
                   (composition root), pwa.ts
src/test/          fixtures.ts (ids, clock, sample workspace/audit/category/asset/schedule)
e2e/               smoke, offline, backup-restore, assets, transactions, reports specs + helpers
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
- **Reports**:
  - Periods are inclusive calendar dates in the business time zone. The week start comes from
    settings.
  - Depreciation in a period is pro-rated by days for partial months (row 4g). Periods still in
    progress show a "not ended" notice (4h).
  - Fleet profit deducts unassigned operating expenses (9a). The report shows the reconciliation
    Σ asset profit + unassigned revenue − shared − unassigned expenses = fleet profit.
  - Margin is a one-decimal percentage via `percentOf`, or N/A when revenue ≤ 0.
  - Exceptions are all-dates and data-backed only. Revisions are confirmed on save, so there is
    no "awaiting confirmation" queue.
  - CSV is profit/revenue/expense only (row 10a) and is never restorable.
- Defaults for open questions: `docs/product-defaults.md` (rows 3a–3e were added in Phase 3;
  4g, 4h, 9a and 10a in Phase 4).

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
8. UI: hooks in `ui/queries.ts`, page in `app/lazy-pages.ts`, nav item in `AppShell.tsx`, route
   in `App.tsx`.

## Phase 5 notes (done)

- **Tasks** (`application/tasks.ts`, `deriveTasks`) are derived from `exceptions()` and nothing is
  stored (product-defaults row 5). Making them stored, with status, owner and history, needs schema
  v4 via the checklist above, and an answer to product question 5 first.
- **Accessibility:**
  - `e2e/accessibility.spec.ts` runs axe (WCAG 2.1 AA) on onboarding, every routed page and two
    detail pages. Add new pages to its `PAGES` list.
  - Wide-table scroll containers are focusable `role="region"` with a label.
  - `AppShell` moves focus to `#main` after each route change.
- **Docs:** `deployment.md` (hosting options and HTTPS requirement), `device-qa.md` (manual script
  with a results table), `user-guide.md`, `release-checklist.md`.
- Test timeouts: Vitest `testTimeout` 20 s and Testing Library `asyncUtilTimeout` 5 s, because
  the machine is slow under a full parallel run.
- AGENT.md §15 acceptance items are all covered by automated tests except real-device checks.

## Open items / known limitations

- The app is hosted on GitHub Pages; see `docs/deployment.md`. All Pages sites under
  `jsamaggrey.github.io` share browser storage, so publish no other Pages sites there.
- Not yet verified on a real iPad or Windows device. Run `docs/device-qa.md` and record the
  results in ADR 0001.
- Backups are unencrypted. The checksum catches corruption, not authorship.
- Main JS chunk is 491 KB (157 KB gzipped), mostly React, Zod, TanStack and Dexie. Acceptable for
  now.
- Revenue/expenses have no period lock. Corrections to old months are audited but allowed, so a
  report for a past period can change.
- No charts yet (tables and statements only).
- **Awaiting product confirmation:** recognition basis (3), corrections and voids (3a), capital
  items (3d), full first month (4a), period-close model (4d), disposal policy (4c, which blocks
  retire/dispose), report depreciation pro-rata (4g), unassigned expenses in fleet profit (9a),
  task categories (5).
