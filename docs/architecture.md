# Architecture

A modular monolith that runs entirely in the browser as an installable PWA. There is no server.
See [ADR 0001](adr/0001-offline-architecture.md) for why.

## Layers and dependency rule

Dependencies point inward only. ESLint (`eslint.config.js`) enforces the boundaries.

```
ui ──▶ application ──▶ repositories (interfaces) ──▶ domain
app (composition root) wires persistence adapters into application services
persistence ──implements──▶ repositories
backup ──▶ repositories + domain (validation)
```

| Folder              | Responsibility                                                                                                                                | May import                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `src/domain/`       | Pure business rules: money, depreciation, profit/margin, period maths, validation. No React, Dexie, or browser APIs.                          | domain only                            |
| `src/repositories/` | Interfaces such as `AssetRepository`, `RevenueRepository`, `ExpenseRepository`, `DepreciationRepository`, `TaskRepository`, `AuditRepository` | domain                                 |
| `src/application/`  | Use cases (create asset, void revenue, generate schedule). Orchestrates repositories inside units of work and writes audit events.            | domain, repositories                   |
| `src/persistence/`  | Dexie/IndexedDB adapter implementing the repositories, schema versions, migrations                                                            | domain, repositories                   |
| `src/backup/`       | `WorkspaceBackupService`: versioned JSON export, validation, preview, restore-into-empty                                                      | domain, repositories                   |
| `src/ui/`           | Components, pages, forms                                                                                                                      | application, domain (types/formatting) |
| `src/app/`          | Shell, routing, composition root                                                                                                              | everything                             |

Folders are created when first used. All layers exist as of Phase 1.

### Adapters and the repository contract

- `persistence/dexie`: the production IndexedDB adapter.
- `persistence/memory`: an in-memory reference adapter used by UI and service tests.
- Both run the same contract suite (`persistence/workspace-store.contract.ts`). It covers atomic
  writes, rollback, atomic restore-into-empty-only, erase, and copy semantics. A future SQLite or
  API adapter must pass it too.

### IndexedDB transactions (important)

`DexieWorkspaceStore` binds every repository call to the transaction object (`tx.table(...)`) and
does **not** rely on Dexie's implicit "current transaction" zones. Those zones get lost across deep
native `async` call chains (service → helper → repository). An operation that escapes the
transaction makes IndexedDB auto-commit early ("Transaction committed too early"). This only shows
up in real browsers, not in fake-indexeddb, which is why the Playwright suite covers multi-step
writes such as demo seeding. Inside `store.write()`, still await only repository calls: never
`fetch`, timers, or `crypto.subtle`.

### Depreciation model

- `assets.depreciation` holds the current assumptions. Each change creates a new
  `depreciationSchedules` version, and its generated `depreciationLines` are stored, never
  recomputed.
- The lines in force for a month come from the latest version whose `effectiveFrom` ≤ that month
  (`effectiveLines` in the domain). Superseded projections stay stored for history.
- `workspace.depreciationClosedThrough` marks closed months. Revisions start at the first open
  month (`planRevision`).

### Revenue and expenses

- `revenueEntries` and `expenses` are never deleted. A void is an update that sets
  `void: { voidedAt, reason }`; `summarizeActivity` (domain) excludes voided records.
- Every expense lands in exactly one bucket (`expenseBucket`): capital first, then direct /
  shared / unassigned. This is what prevents double counting in reports.
- Services expose `insertRevenue` / `insertExpense` so other writes (demo seeding) can add records
  inside the same transaction, as with `insertAssetWithSchedule`.
- Lists are loaded whole and filtered in the UI. That is fine at pilot volumes (thousands of
  records); add indexed range queries (`serviceDate`, `expenseDate` are indexed) if it gets slow.

### Reports

- `domain/reports/profit.ts` (`buildProfitReport`) is pure: records + effective depreciation
  lines + an inclusive date range in, asset and fleet results out. Formulas and assumptions shown
  in the UI are constants from the same module (`PROFIT_FORMULAS`, `REPORT_ASSUMPTIONS`), so the
  text and the maths cannot drift apart.
- Period boundaries live in `domain/periods/date-range.ts` (week start from settings, business
  time zone dates).
- `application/report-service.ts` loads everything in one read and also builds exceptions and CSV
  files (`domain/reports/csv.ts`). CSV is reporting output only, never a restore source.

### Code splitting

Pages other than the dashboard and onboarding load on first visit (`app/lazy-pages.ts`, with
`Suspense` in `AppShell`). The service worker precaches every chunk, so this does not affect
offline use. The offline Playwright tests open split pages with the network disabled.

### UI data flow

TanStack Query wraps the application services with `networkMode: 'always'`, so local reads and
writes never pause when the device is offline. Services are injected through `ServicesContext`
from `app/create-services.ts`, which is the only place that picks a storage adapter. Routing uses
hash URLs so any static host works without rewrite rules.

## Identity and versioning

- All entities use UUIDs from `crypto.randomUUID()`. IDs are generated on the device and never
  reused, so a future backend import can keep them.
- Each workspace has its own UUID. Records are scoped to a workspace, which leaves room for
  multiple businesses later.
- Two independent versions: the **database schema version** (Dexie migrations) and the **backup
  format version** (validated on import). Both are recorded in every backup.

## Money

Integer minor units with explicit currency, plus big.js for multiplication and division. See
[ADR 0002](adr/0002-money-representation.md).

## Future backend seam

Repository interfaces are the seam. Planned migration route: validated full-workspace backup →
migration/import utility → backend database. None of this is built yet. Do not describe it as
available.
