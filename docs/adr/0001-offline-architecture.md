# ADR 0001 — Offline architecture: React PWA + IndexedDB (Dexie)

- Status: Accepted (Phase 0, 2026-10-25). Proof criteria below must pass in Phase 1.
- Deciders: product owner, implementation agent

## Context

The MVP must run on many desktops, laptops, and tablets **independently**, with no internet, LAN, or
always-on server after installation (AGENT.md §1–2). Each device holds its own workspace. Portability
between devices is an explicit full-workspace export/import, not sync. Target devices include tablets
(iPad and Android) as well as Windows/macOS computers.

## Options considered

| Criterion                | A. React PWA + IndexedDB (Dexie)                                      | B. React + desktop wrapper (Tauri) + SQLite                                      |
| ------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Windows / macOS          | Yes (installable from Chrome/Edge; Safari 17+ on macOS)               | Yes (native installer per OS)                                                    |
| iPad                     | Yes (Add to Home Screen, Safari/WebKit)                               | No first-class path; Tauri mobile is a separate build and App Store distribution |
| Android tablet           | Yes (Chrome install)                                                  | Separate mobile build and Play/sideload distribution                             |
| Offline after install    | Yes, via service worker cache                                         | Yes                                                                              |
| Storage durability       | Browser-managed; can be cleared by the user or evicted under pressure | Real file on disk; app controls it                                               |
| Transactions / integrity | IndexedDB transactions (Dexie)                                        | Full SQL transactions and constraints                                            |
| Backup                   | App-generated JSON download                                           | App-generated JSON, plus safe DB-file backup possible                            |
| Packaging / signing      | None (static files over HTTPS)                                        | Code signing and installers per platform, update channel                         |
| Future backend seam      | Repository interfaces; same for both                                  | Same                                                                             |

## Decision

Use **Option A: a React PWA with IndexedDB as the transactional local store, accessed through
Dexie**, behind repository interfaces so the storage adapter can be replaced.

The main reasons are that one build reaches every target device class including iPad, with no
packaging or signing. The domain and repository layers are storage-agnostic, so a Tauri + SQLite
adapter (or an API/PostgreSQL backend) can be added later without rewriting business rules.

## Consequences and constraints (must be explained to users)

1. **Browser storage is not a guaranteed archive.** Data can be lost if the user clears site data,
   uninstalls the app, uses private browsing, or the browser evicts storage under disk pressure.
   - Mitigations: request persistent storage (`navigator.storage.persist()`) and show the result.
     Show the last backup date everywhere. Prompt for backups without blocking work. Make full JSON
     backup a first-class feature (Phase 1).
2. **Safari/iPad specifics.** WebKit may delete storage for _websites_ not used for several days.
   Web apps **added to the Home Screen** are treated separately. Onboarding must tell iPad users to
   install to the Home Screen and to back up regularly. This must be verified on a real device.
3. **One-time online install.** A PWA must be loaded once from an HTTPS origin (or `localhost`) to
   install its service worker. After that it runs offline. Distribution therefore needs one of:
   static HTTPS hosting reached once per device, or a documented local install procedure. _Open
   item: confirm how devices will receive the app._
4. **Data is bound to the origin.** Changing the hosting URL (domain, port, or protocol) creates a
   new, empty workspace. The production URL must stay fixed. Moving origins is done via
   backup → restore.
5. **Quota.** Browsers allow a large share of free disk. That is ample for transactional records,
   but attachments (if added later) need size limits and must be included in backup sizing.
6. **Integrity.** IndexedDB has no SQL constraints. Uniqueness (e.g. asset code), referential checks,
   and invariants are enforced in application services within Dexie transactions and covered by
   tests.
7. **No sync is implied.** The UI must always show the active local workspace identity.

## Phase 1 proof criteria (the decision is revisited if any fail)

- App installs and starts with the network disabled in Chromium and WebKit (Playwright), and on at
  least one real iPad and one Windows machine.
- Workspace survives reload and browser restart. `persist()` outcome is surfaced in the UI.
- Writes that touch multiple tables are atomic (failure leaves no partial records), proven by tests.
- Full backup export → restore into an empty workspace reproduces identical records and IDs.

### Status of proof criteria (Phase 1)

| Criterion                                                  | Result                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| Offline start and core workflow, Chromium (desktop)        | Passing: `e2e/offline.spec.ts`                             |
| Offline start and core workflow, WebKit (iPad emulation)   | Passing: `e2e/offline.spec.ts`                             |
| Real iPad and real Windows device                          | **Not yet verified.** Run `docs/device-qa.md`.             |
| Automated WCAG 2.1 AA scan of every page (axe)             | Passing: `e2e/accessibility.spec.ts` (both engines)        |
| Workspace survives reload; `persist()` outcome shown in UI | Passing (reload in e2e; storage status on Backup page)     |
| Multi-table writes are atomic                              | Passing: contract tests (Dexie and memory)                 |
| Backup → restore reproduces identical records and IDs      | Passing: unit tests (both adapters) and e2e (both engines) |

## Revisit triggers

- Users lose data to eviction despite mitigations, or need OS-level file control.
- A requirement for large attachments or OS integration (printing, file associations) that a PWA
  handles poorly.
- A decision to run on managed desktops only, which removes the tablet requirement.

If triggered, add a Tauri + SQLite persistence adapter implementing the same repository
interfaces. The backup format stays the migration path.
