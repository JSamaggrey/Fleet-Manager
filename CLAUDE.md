# CLAUDE.md — Claude Code Project Instructions

## Start here
Read `AGENT.md` before making changes. It is the authoritative product specification and acceptance checklist.

## Confirmed product decisions
- Initial application must work on many devices **independently**, without internet, LAN, or always-on server.
- Each device has its own local workspace. Work is not automatically shared between devices.
- MVP cross-device portability is explicit full-workspace export/import, not live sync.
- Reporting is management reporting.
- Transport is the initial revenue model.
- Default/reporting currency: GHS (Ghanaian cedi, ISO 4217 `GHS`).
- Shared-cost allocation is deferred. Capture shared expenses separately and do not allocate them to assets.
- Cars are first, but asset categories and model must support other business assets.

## First task: prove the offline architecture
Before implementing features, inspect the repository and compare:
1. React PWA + IndexedDB (recommend a maintained wrapper such as Dexie): simple deployment and good web/tablet reach, but browser storage has clearing/eviction and backup constraints.
2. React frontend + optional desktop wrapper + SQLite: stronger local database/file management, but packaging and tablet coverage require explicit consideration.

Choose one MVP approach, write down why, and ensure that core operations do not require a backend server. Do not add FastAPI/PostgreSQL merely by habit; keep seams ready for future backend work.

## Stack direction
- React + TypeScript + Vite
- Tailwind CSS and accessible component primitives
- React Hook Form + Zod
- TanStack Query only where beneficial; do not let the app require an API to function offline
- TanStack Table; Recharts or equivalent for reports
- Local persistence: IndexedDB or SQLite based on the documented architecture decision
- Tests: Vitest, React Testing Library, Playwright
- TypeScript strict mode, ESLint, Prettier

Pin compatible versions. Avoid dependencies without a clear benefit.

## Architecture rules
- Modular monolith; no microservices.
- Separate UI, domain services/calculations, repository interfaces, local persistence adapter, and backup/transfer services.
- Use stable UUIDs and schema versions.
- Financial calculations must be testable without UI or database implementation details.
- JSON is for a versioned full-workspace backup; CSV/XLSX are reporting/interchange formats. Do not treat spreadsheets or raw JSON files as the live transactional database.
- Provide full backup export/import with schema validation, preview, and explicit confirmation.
- MVP import should restore only into an empty workspace. Never silently merge or overwrite.
- Do not claim device synchronization. Do not build LAN/P2P/cloud sync until a separate specification addresses conflict handling, duplicate identity, audit ordering, deletions/retirements, and recovery.
- If using a PWA, explain that local browser storage can be cleared or evicted; encourage frequent downloadable backups.
- Keep repositories replaceable so a later API/PostgreSQL backend can be introduced with a migration/import path.
- Do not claim local-to-cloud migration is available until built and tested.

## Accounting and management calculations
- GHS is the pilot reporting currency; keep currency explicit on monetary records.
- Do not aggregate foreign currencies without an approved FX policy.
- Straight-line depreciation for MVP, useful life in months and residual value.
- Depreciable basis = capitalized cost − residual value.
- Use decimal/fixed-precision money, deterministic rounding, and final-period adjustment.
- Preserve prior closed schedule periods when assumptions change.
- Asset profit = recognized asset revenue − direct operating expenses − depreciation.
- Shared costs are excluded from asset profit and shown separately.
- Fleet profit = recognized fleet revenue − direct operating expenses − shared fleet expenses − depreciation.
- Asset margin = profit/revenue only when revenue > 0; otherwise N/A.
- Label results management profit/contribution, not statutory net profit.
- Do not double-count acquisition cost as operating expense or treat depreciation as cash payment.
- Make revenue/expense recognition basis and period convention visible; seek a product decision if a choice is blocking or risks misleading reports.

## MVP delivery order
1. Inspect repository and settle offline architecture decision.
2. Offline app shell, workspace persistence/versioning, seed/demo data, network-disabled operation.
3. Full backup/export and safe restore/import, validation, and tests.
4. Flexible asset CRUD and depreciation schedule.
5. Transport trip/job revenue and expenses, reversals, audit.
6. Dashboard, per-asset/fleet reports, time periods, CSV export, exception view.
7. Tasks, accessibility, tablet QA, release docs and backup/restore validation.

## UX requirements
- Desktop, laptop, and tablet responsive layout.
- Professional, calm business UI.
- Loading, empty, error, validation, and success states.
- Accessible labels, keyboard use, contrast, focus management.
- Search, sorting, filters, and pagination where appropriate.
- Show active local workspace identity and data/backup state.
- Reports must expose date range, currency, formula, and assumptions.
- Do not invent utilization metrics or reminders when required data is not collected.

## Security, privacy, and integrity
- Be accurate about local profile/lock limitations; client-side profile checks are not server-grade authorization.
- Avoid unnecessary personal data.
- Audit material financial edits.
- Validate imported content and prevent malformed/oversized files from corrupting workspace data.
- Never commit credentials or real financial records.
- Protect exported backup files; they may contain sensitive business information.
- Add regression tests for import failures and data integrity.

## Required tests
- Offline startup and core operations after installation.
- Depreciation schedule math, residuals, rounding, invalid useful life, and revisions.
- Report period boundaries, profit/margin, zero revenue, currency consistency.
- Shared expense treatment and no duplicate deductions.
- Void/reversal behavior.
- Backup/export and restore round trip preserves identifiers, relationships, schedule entries, transactions, and audit history.
- Bad, incompatible, or duplicate imports are rejected safely.
- No existing workspace is silently overwritten.
- Repository/domain tests independent of storage adapter.

## Working agreement
- Inspect before editing. Preserve existing work.
- Work in small vertical increments; keep the app runnable.
- Document assumptions and material trade-offs.
- Ask questions only when a decision blocks a safe or truthful implementation.
- Run and report actual tests; never claim unexecuted checks passed.
- Update setup, backup, restore, and architecture documentation.
- Do not expand into dispatch, GPS, telematics, driver payroll, payment processing, statutory accounting, or automatic sync without approval.

## Product questions still open
1. Is file-based export/import enough for first release, or is a physical direct device-to-device transfer method expected?
2. Are foreign-currency transactions needed alongside GHS? If yes, what conversion policy applies?
3. Cash-basis or accrual-style management recognition for transport revenue and expenses?
4. Depreciation first/last month convention and disposal policy?
5. Which due-date task categories are needed in MVP?

If unanswered, use conservative documented defaults and avoid misleading reporting.

## Completion report
Report:
- What changed
- How to install/run and use offline
- How to export and restore a workspace
- Tests run and actual outcomes
- Assumptions, known limitations, and next recommended increment
