# Real-device QA script

Automated tests cover desktop Chromium, WebKit with iPad (gen 7) emulation, and Chromium with Android tablet (Galaxy Tab S9) emulation (`pnpm test:e2e`),
including offline use and WCAG 2.1 AA checks with axe. They **cannot** prove behaviour on real
hardware: iPadOS storage rules, the home-screen app, the on-screen keyboard and file saving all
differ. Run this script on **one real iPad, one real Android tablet (if used) and one real Windows PC** before the pilot, and record
the results in the table at the end (also update the proof table in ADR 0001).

Use the hosted address (see [deployment.md](deployment.md)) and a **demo workspace**. Never use
real business data for QA.

### Testing before the app is hosted

- **Windows PC:** run `pnpm build` then `pnpm preview` and open `http://localhost:4173`. Turning
  off Wi-Fi does not affect `localhost`, so to test offline, **stop the preview server** instead.
- **Android tablet:** enable Developer options → USB debugging and connect it by USB. On the PC,
  open `chrome://inspect`, turn on **Port forwarding** `4173 → localhost:4173`, then open
  `http://localhost:4173` in Chrome on the tablet. Android treats this as a secure address.
- **iPad:** no simple equivalent; use the hosted HTTPS address.

Data entered at `localhost` stays with that address and does not carry over to the hosted one.

## 1. Install and offline start

1. Open the address online, wait for **Available offline**, then install (Windows: address-bar
   install icon; iPad: Share → Add to Home Screen; Android: Chrome menu → Install app / Add to Home screen).
2. Open the installed app. Choose **Open demo workspace**.
3. Turn on airplane mode / disconnect Wi-Fi. Close the app completely (iPad/Android: swipe it away in the app switcher).
4. Reopen it from its icon. ✅ It opens, shows **Offline — working locally**, and the demo data is there.

## 2. Core work while offline

1. Add an asset; check its schedule appears.
2. Record a revenue entry for it and an expense; void one with a reason.
3. Open Reports for this month; check the figures and the **not ended** notice.
4. Close and reopen the app (still offline). ✅ Everything recorded is still there.

## 3. Backup and restore on the device

1. Backup & Restore → **Download full backup**.
   - iPad: confirm where the file goes (Files → Downloads) and that it can be found again.
   - Android: confirm it lands in Downloads and that the restore file picker can open it.
2. **Erase workspace** (type the name to confirm).
3. Restore the file you just saved. ✅ The preview shows the right counts; after restore the
   asset, revenue, the voided entry and the audit log are all back.
4. Copy the file to the other device (email, USB, AirDrop, cloud drive) and restore it there into
   an empty workspace. ✅ Same data on both, and the app states nothing is synchronised.

## 4. Storage durability

1. Backup page: press **Ask the browser to keep data**; note the result.
2. iPad: leave the app unused for several days, then reopen. ✅ Data still present. (iPadOS may
   remove data of sites not used for a long time; this is why backups matter.)

## 5. Touch, keyboard and screen reader

1. iPad and Android tablet, portrait and landscape: menu button opens navigation; tables scroll sideways; forms
   are usable with the on-screen keyboard (date pickers, decimal keypad for amounts).
2. Windows, keyboard only: Tab through Dashboard → Revenue → Record revenue; every control is
   reachable, focus is visible, dialogs trap focus and close with Esc.
3. Screen reader spot check (VoiceOver on iPad, Narrator or NVDA on Windows): after choosing a
   menu item, reading continues from the new page's content; form errors are read; the period
   change on Reports is announced.

## 6. Update

1. Publish a newer build to the same address. Open the app online.
2. ✅ **Update ready — reload** appears; data is intact after reloading.

## Results

| Check                    | iPad (model / iPadOS) | Android tablet (model / Android, Chrome) | Windows (browser / version) | Notes |
| ------------------------ | --------------------- | ---------------------------------------- | --------------------------- | ----- |
| 1 Install, offline start |                       |                                          |                             |       |
| 2 Core work offline      |                       |                                          |                             |       |
| 3 Backup / restore       |                       |                                          |                             |       |
| 4 Storage durability     |                       |                                          |                             |       |
| 5 Touch / keyboard / SR  |                       |                                          |                             |       |
| 6 Update                 |                       |                                          |                             |       |
