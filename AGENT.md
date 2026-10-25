# AGENT.md — Offline-First Fleet & Asset Management

## 1. Product mission and confirmed decisions

Build a management application for a pool of transport vehicles and other business assets. It must run independently on multiple computers/tablets without internet, LAN, or an always-on server. Each device has its own local workspace.

Confirmed MVP decisions:
- Deployment: offline-first, independent per-device installation.
- Reporting: management reporting, not statutory/tax accounting.
- Revenue model: transport/trip/job revenue.
- Default reporting currency: GHS (Ghanaian cedi, ISO 4217 `GHS`).
- Shared-cost allocation: deferred. Track shared costs separately; do not allocate them to assets in MVP.
- Assets: cars first, but support configurable categories and non-vehicle assets.

## 2. Critical offline behavior

**No network is required for core MVP workflows after installation.** Assets, schedules, revenue, expenses, dashboard, and reports must work offline.

Each device owns a separate workspace. Changes do not appear on another disconnected device. Explain this in onboarding and documentation.

For MVP, transfer/backup is through explicit full-workspace export and import:
- Provide a versioned JSON backup package (portable, structured, documented).
- Support validated restore/import into an empty workspace, with a preview and explicit confirmation.
- Never silently merge, replace, or overwrite existing records.
- Clearly distinguish a full backup from CSV/XLSX report exports.
- Test round-trip restoration and malformed/unsupported import handling.
- Keep file-based export and import usable without internet.

Do not promise automatic device-to-device sync. No LAN sync, peer-to-peer sync, conflict merging, or cloud sync in MVP. Future synchronization requires a separate design for concurrent edits, identity, conflict resolution, reversals/deletions, and audit ordering.

## 3. Recommended stack and storage decision

Recommended product direction:
- Frontend: React + TypeScript + Vite.
- UI: Tailwind CSS with accessible reusable components.
- Forms: React Hook Form + Zod.
- API/server state abstraction: TanStack Query where useful, but MVP must not depend on a running API.
- Tables: TanStack Table; charts: Recharts or comparable maintained library.
- Test: Vitest + React Testing Library; Playwright for user journeys.
- Quality: TypeScript strict mode, ESLint, Prettier.

Choose and document ONE initial local persistence approach before coding:
1. **PWA + IndexedDB** (recommended for broad desktop/tablet access and simpler installation). Use a robust wrapper such as Dexie; IndexedDB is the app's transactional local store. Explain browser storage clearing/eviction risk and offer routine export backups.
2. **Desktop wrapper + SQLite** (e.g. Tauri) if dependable file-based database control is a priority and platform support/packaging is acceptable. Validate tablet access separately.

Do not use a JSON file, spreadsheet, or browser localStorage as the live financial database. Use JSON for portable backup; CSV/XLSX for report exports/import templates. Do not introduce FastAPI or PostgreSQL into the offline MVP unless there is a concrete requirement; keep the domain/persistence boundary ready for a later backend.

## 4. Backend-ready architecture

Use a modular monolith with a clean separation between:
- UI
- Domain calculations and validation
- Application/use-case services
- Repository/persistence interfaces
- Local persistence adapter
- Backup/import/export services

Define interfaces such as `AssetRepository`, `RevenueRepository`, `ExpenseRepository`, `DepreciationRepository`, `TaskRepository`, and `WorkspaceBackupService`.

Backend migration requirements:
- Stable UUID identifiers for businesses/workspaces, assets, transactions, schedules, tasks, and audit events.
- Explicit schema and backup format versions.
- Record created/updated timestamps and actor/profile metadata where available.
- Domain rules must not depend on IndexedDB/SQLite or browser components.
- Document a migration route: export validated workspace → migration/import utility → backend database.
- Do not claim local-to-cloud migration or synchronization exists until implemented and tested.

## 5. Asset management

Allow users to create, view, edit, archive, and retire assets. Never hard-delete assets with financial history.

Common fields:
- Asset code (unique within workspace), name, category/type, description
- Acquisition date, in-service date, capitalized cost, currency
- Residual value, useful life in months, depreciation method
- Status, location, notes
- Optional make/model/year, registration/plate, chassis/VIN, supplier, attachments

Car-specific fields must be optional. Non-car assets must not be forced to provide vehicle fields. Track material changes.

## 6. Depreciation schedules

Cars and tangible assets use depreciation terminology; UI may say “Depreciation / Amortization” where suitable.

MVP method: straight-line.
- Depreciable basis = capitalized cost − residual value.
- Base monthly charge = depreciable basis / useful life in months.
- Require a documented first/last period convention (select and disclose a sensible default).
- Monetary math must use decimal/fixed precision, not binary floating point.
- Final rounding must ensure total depreciation does not exceed the depreciable basis.
- Generate monthly lines showing opening book value, charge, accumulated depreciation, closing book value, and remaining useful life.
- Validate useful life > 0, residual ≥ 0 and ≤ cost, and coherent dates.
- If assumptions change, preview a new schedule version and preserve prior closed periods. Never silently rewrite historical figures.
- Disposal behavior needs an explicit policy before implementation.

Asset acquisition must not also be recorded as an operating expense. Depreciation is a non-cash cost.

## 7. Transport revenue

Capture revenue with:
- Service date; trip/job/contract reference
- Assigned asset (allow an explicit unassigned case only with exception handling)
- Customer/contract label or reference, description
- Optional origin/destination, distance/quantity, rate
- Amount, currency (default GHS), status, notes
- Created/updated metadata and audit trail

Do not build dispatch, GPS, route tracking, driver payroll, telematics, or payment processing in MVP without approval.

Define when revenue is recognized. If policy is unresolved, label reporting basis clearly and avoid presenting cash receipts as earned revenue without a defined rule.

## 8. Expenses

Record date, asset or shared/fleet classification, category, vendor/reference, description, amount, currency, payment status/method if needed, notes, and audit metadata.

Distinguish:
- Direct operating expenses attributed to one asset
- Shared/fleet expenses (tracked separately; no MVP allocation)
- Capital acquisition or improvement (not automatically operating expense)

Use void/reversal with reason rather than destructive deletion. Unassigned items should be visible in an exception report.

## 9. Profit and margin definitions

Present results as **management profit/contribution**, not statutory net profit.

Asset-level formula:
`Asset management profit = recognized asset revenue − direct asset operating expenses − depreciation`

`Asset margin = asset management profit / asset revenue`, only if revenue > 0; otherwise show N/A.

Fleet-level formula:
`Fleet management profit = recognized fleet revenue − direct operating expenses − shared fleet expenses − depreciation`

Since shared allocation is deferred:
- Do not deduct shared expenses in each asset's profit.
- Show shared expenses separately at fleet level.
- Clearly distinguish total fleet profit from sum of asset-level profits.
- Display formulas and reporting assumptions.
- Do not aggregate currencies without an approved FX policy.

## 10. Reports and dashboard

Support weekly, monthly, quarterly, yearly, and custom date ranges. Define week start and business timezone in settings.

Reports:
- Executive summary: revenue, direct costs, shared costs separately, depreciation, management profit, margin, active assets
- Asset profitability with drill-through
- Trip/job revenue detail
- Expense detail
- Depreciation schedule and period charges
- Exceptions: missing asset assignment, incomplete asset setup, reversed/void transactions, schedule review needs
- CSV export; XLSX/PDF can follow if useful

All screens/reports must identify the active local workspace. Never imply consolidated cross-device reporting unless data has been deliberately consolidated.

## 11. Tasks

Build only tasks supported by captured data:
- Incomplete asset setup
- Revenue/expense items needing assignment/review
- Schedule changes awaiting confirmation
- Registration/insurance/inspection reminders only if the necessary dates are captured
- Maintenance tasks only if maintenance fields/workflow are implemented

Task fields: title, source record, owner/profile if applicable, due date, status, priority, history.

## 12. Navigation and UX

- Dashboard
- Assets
- Trips / Revenue
- Expenses
- Depreciation
- Reports
- Tasks
- Workspace / Settings / Backup & Restore / Audit

Responsive for desktop, laptop, and tablet. Include accessible keyboard navigation, labels, sufficient contrast, empty/loading/error/success states, validation, search, sorting, and filters.

Offline UX:
- Indicate offline-ready/local workspace state.
- Show last successful backup/export date if known.
- Prompt users to back up at an appropriate cadence without blocking work.
- Provide clear storage/browser compatibility guidance.
- Test core flows with network disabled after initial installation.

## 13. Data, privacy, and integrity

- One workspace/business in MVP; retain business-scoped schema for future multiple customer businesses.
- Role/profile controls must be described honestly. Local-only profiles are not equivalent to server-enforced authorization.
- Use unique IDs, constraints, transactional writes, migration/version support, and audit history for material financial changes.
- Store GHS as default and currency code explicitly.
- Avoid collecting unnecessary driver/customer personal data.
- Do not store secrets in the client.
- Protect exported backups as sensitive business records; explain their contents and handling.
- Do not rely on browser storage as the sole backup.
- If using SQLite, implement consistent safe backup; do not copy a live DB file naively during writes.

## 14. Implementation plan

Phase 0 — architecture proof:
- Compare PWA/IndexedDB vs wrapper/SQLite against target devices and offline expectations.
- Record the decision and known constraints before committing.

Phase 1 — offline foundation:
- App shell, local workspace, versioned persistence and migrations.
- Demo seed, settings, stable ID strategy.
- Offline startup and static asset caching.
- Full backup export/import with validation, preview, and safe restore.
- Verify operation with network disabled.

Phase 2 — assets and depreciation:
- Flexible asset CRUD/categories.
- Schedule engine, preview, history, deterministic rounding and tests.

Phase 3 — transport financial activity:
- Trip/job revenue.
- Direct and shared expense entry (shared recorded separately).
- Voids/reversals and audit trail.

Phase 4 — reports:
- Profitability, date filters, period reports, drill-through, CSV exports, exception report.

Phase 5 — tasks and release hardening:
- Task inbox, tablet QA, accessibility, backup/restore tests, docs, release checklist.

Later phases:
- Connected multi-user backend and PostgreSQL.
- Tenant authentication/roles, backup service, migration utility.
- Explicitly designed sync only if product needs it.

## 15. Acceptance criteria and tests

Required:
- Fresh install can complete core workflows offline after app assets are available.
- Create asset, generate schedule, inspect monthly amounts.
- Record transport revenue and direct expense, view asset profit/margin.
- Track shared expenses separately and show fleet-level deduction without asset allocation.
- Weekly/monthly/quarterly/yearly report boundaries work.
- No-revenue margin is N/A.
- Decimal calculations, final rounding, useful-life validation, and schedule revisions are tested.
- Backup/export then restore into clean workspace preserves IDs, relationships, schedule lines, transactions, and audit records.
- Invalid/unsupported import is rejected without partial writes.
- Existing workspace is never silently overwritten or merged.
- GHS display/precision is consistent.
- Network-disabled tests pass.
- Reports clearly disclose local workspace and reporting assumptions.

## 16. Agent operating rules

Before changes:
1. Inspect repository structure, existing code, and current conventions.
2. Give a concise plan and note assumptions.
3. Ask only blocking questions; otherwise proceed with documented defaults.
4. Preserve user work and avoid destructive resets.

During work:
- Deliver small working increments.
- Keep domain logic outside UI.
- Write tests alongside features.
- Do not claim tests passed unless executed.
- Do not add scope without approval.

At completion:
- Summarize implementation, run/setup instructions, test results, limitations, backup steps, and remaining decisions.
