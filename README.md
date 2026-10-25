# Fleet & Asset Management (offline-first)

Management reporting for transport vehicles and other business assets. It runs on each device
independently with no internet, LAN, or server after installation. Reporting currency is GHS.

> **Status: Phase 0 (scaffold).** No business features yet. See `AGENT.md` for the product
> specification and `docs/` for decisions.

**Each device has its own workspace. Nothing syncs between devices.** Moving data between devices
will use an explicit full backup export and restore (Phase 1).

## Requirements

- Node.js 24 LTS (>= 24.15; see `.nvmrc`)
- pnpm 12 (`corepack enable pnpm`)

## Setup

```sh
pnpm install
pnpm exec playwright install chromium webkit   # browsers for end-to-end tests
pnpm dev                                       # http://localhost:5173
```

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

## Data safety

- Browser storage can be cleared or evicted. Once backup exists (Phase 1), export backups often and
  keep them somewhere safe.
- Backup files contain sensitive business information. Never commit them; `.gitignore` excludes
  `*.fmsbackup.json`, `backups/` and `exports/`.
