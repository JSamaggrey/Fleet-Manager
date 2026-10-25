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

Folders are created when they are first used. Phase 0 contains `domain/money` and `app`.

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
