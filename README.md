# Fleet & Asset Management (offline-first)

Management reporting for transport vehicles and other business assets. It runs on each device
independently with no internet, LAN, or server after installation. Reporting currency is GHS.

> **Status: MVP feature-complete (Phase 5), pending real-device QA.** Installable offline app,
> local workspace, settings, audit log, full backup/restore, asset register with categories,
> straight-line depreciation schedules with revisions and period close, trip/job revenue, direct
> and shared expenses, corrections and voids, weekly/monthly/quarterly/yearly/custom management
> profit reports with drill-through, exceptions, a task list derived from the data, and CSV
> export. Automated WCAG 2.1 AA checks pass. See `AGENT.md` for the specification, `PROGRESS.md`
> for status, and `docs/` for decisions and guides.

**Each device has its own workspace. Nothing syncs between devices.** Moving data between devices
uses an explicit full backup and restore. See [Backing up and restoring](docs/backup-and-restore.md).

## Requirements

- Node.js 24 LTS (>= 24.15; see `.nvmrc`)
- pnpm 12 (`corepack enable pnpm`)

## Setup

```sh
pnpm install
pnpm exec playwright install chromium webkit   # browsers for end-to-end tests
pnpm dev                                       # http://localhost:5173
```

## Use offline

1. Serve the production build. Use `pnpm build`, then host `dist/` at a fixed HTTPS address
   (see [Hosting and installing](docs/deployment.md)), or run `pnpm preview` for local testing at
   `http://localhost:4173`.
2. Open it once while the server is reachable. The header shows **Available offline** once the app
   is cached.
3. Optionally install it: the install icon in the Chrome/Edge address bar, or Share → Add to Home
   Screen on iPad.
4. From then on it starts and works with no network. App updates are offered through a reload
   button and are never applied mid-task.

## Scripts

| Command                             | Purpose                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                          | Development server                                                      |
| `pnpm build` / `pnpm preview`       | Production build and local preview (port 4173)                          |
| `pnpm typecheck`                    | TypeScript strict type check                                            |
| `pnpm lint`                         | ESLint, including architecture-boundary rules                           |
| `pnpm format` / `pnpm format:check` | Prettier                                                                |
| `pnpm test`                         | Unit and component tests (Vitest + Testing Library)                     |
| `pnpm test:e2e`                     | Playwright against the production build (desktop Chromium, iPad WebKit) |
| `pnpm check`                        | typecheck + lint + format check + unit tests                            |

## Documentation

- [Architecture](docs/architecture.md)
- [ADR 0001 — Offline architecture (PWA + IndexedDB)](docs/adr/0001-offline-architecture.md)
- [ADR 0002 — Money representation and rounding](docs/adr/0002-money-representation.md)
- [Product defaults for open questions](docs/product-defaults.md)
- [Backing up, restoring, and moving a workspace](docs/backup-and-restore.md)
- [Backup file format](docs/backup-format.md)
- [Hosting and installing](docs/deployment.md)
- [User guide (pilot)](docs/user-guide.md)
- [Real-device QA script](docs/device-qa.md)
- [Release checklist](docs/release-checklist.md)

## Data safety

- Browser storage can be cleared or evicted. Download full backups often and keep them somewhere
  safe.
- Backup files contain sensitive business information. Never commit them; `.gitignore` excludes
  `*.fmsbackup.json`, `backups/` and `exports/`.
