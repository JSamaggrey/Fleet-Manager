# Release checklist

Work through this for every release. Record the version, date, and who checked it.

## Before building

- [ ] `PROGRESS.md` and `README.md` status are current; `package.json` version bumped.
- [ ] Any data change has a new Dexie version, a migration test, a frozen backup schema and an
      upgrade test for every older backup version (see the checklist in `PROGRESS.md`).
- [ ] `docs/backup-format.md` matches `src/backup/format.ts`.
- [ ] `docs/product-defaults.md` lists every default still awaiting confirmation.
- [ ] No credentials, real financial records, backups (`*.fmsbackup.json`) or CSV exports are
      committed (`git status`, `git log -p` for the release range).

## Automated checks (must all pass; record the actual numbers)

- [ ] `pnpm check`: typecheck, lint (with layer rules), format, unit/component tests.
- [ ] `pnpm test:e2e`: desktop Chromium and iPad-emulated WebKit, including offline start, offline
      work, backup → erase → restore round trips, damaged-backup rejection, reports, CSV and
      the axe WCAG 2.1 AA scan.
- [ ] `pnpm build` has no errors; note the main chunk size.

## Manual checks

- [ ] [Real-device QA script](device-qa.md) on a real iPad and a real Windows PC, at least for
      sections 1–3 when data storage or backup code changed.
- [ ] Restore a backup made by the **previous** released version into the new version.
- [ ] Open the new version over an existing installation; confirm the update prompt and that the
      data upgrades without loss.

## Publishing

- [ ] Ask pilot users to download a full backup before updating.
- [ ] Publish `dist/` to the same HTTPS address (see [deployment.md](deployment.md)).
- [ ] Tag the release commit (`git tag vX.Y.Z`).

## Honesty checks (from CLAUDE.md)

- [ ] Nothing in the UI or docs claims device synchronisation, cloud migration, statutory
      accounting, or server-grade security.
- [ ] Reports still show date range, currency, formulas, basis and assumptions.
