# Hosting and installing the app

The app is a set of static files (`dist/` after `pnpm build`). There is no server-side code, no
database server and no login service. A device needs to reach the files **once** to install the
app. After that it runs offline.

> **Chosen host: GitHub Pages** at **https://jsamaggrey.github.io/Fleet-Manager/**, from the
> public repo `JSamaggrey/Fleet-Manager`. `.github/workflows/deploy.yml` runs every check and all
> end-to-end tests, then publishes `dist/` on each push to `main`. Every device must use **this
> exact address**, because the browser keeps each address's data separately.
>
> **Shared origin caution:** every GitHub Pages site under `jsamaggrey.github.io` shares one
> browser storage area. Do not publish other Pages sites under this username, or move this app
> to its own domain first (a later move means every device backs up and restores).

## Requirements for any host

- **HTTPS** (or `http://localhost` for testing on the same machine). Browsers only allow the
  offline service worker, and installation, on secure origins. A plain `http://192.168.x.x` LAN
  address will **not** work offline.
- Serve `index.html`, `sw.js`, `manifest.webmanifest`, `assets/` and the icons exactly as built.
  No rewrite rules are needed (the app uses `#/` URLs).
- Do not cache `sw.js` and `index.html` for long (`Cache-Control: no-cache` is ideal), so that
  app updates are noticed. Files in `assets/` have hashed names and can be cached for a long time.

## Options

| Option                                                                                       | Good for                    | Notes                                                                                    |
| -------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| Static hosting service (e.g. Netlify, Cloudflare Pages, GitHub Pages, Azure Static Web Apps) | Easiest; HTTPS included     | Upload `dist/`. The files contain no business data: data only ever lives on each device. |
| Company web server with a certificate                                                        | Keeping everything in-house | Any web server (IIS, nginx, Apache) serving `dist/` over HTTPS.                          |
| `pnpm preview` on one laptop                                                                 | Developer testing only      | `http://localhost:4173` works offline **only on that laptop**.                           |

None of these send workspace data anywhere. Revenue, expenses and assets stay in each device's
browser storage. Only backups you download leave the device.

## Install on each device

1. Open the app's address in **Chrome or Edge** (Windows), **Safari** (iPad) or **Chrome** (Android) while online.
2. Wait until the header shows **Available offline**.
3. Install it:
   - Windows: the install icon in the address bar (or menu → _Install app_).
   - iPad: Share → **Add to Home Screen**. Open it from the home-screen icon from then on. On
     iPad, Safari tabs and the home-screen app have **separate storage**.
   - Android: Chrome menu → **Install app** (or _Add to Home screen_).
4. On the Backup & Restore page, choose **Ask the browser to keep data**.
5. Create the workspace, or restore a backup (see [backup-and-restore.md](backup-and-restore.md)).

## Updating

Publish a new `dist/` to the same address. Each device downloads the update the next time it is
online and shows **Update ready — reload**. Nothing changes until the user reloads, so work in
progress is never interrupted. The local database upgrades itself on first start of the new
version (tested in `src/persistence/dexie/migrations.test.ts`). **Download a full backup before
updating.**

## Removing the app from a device

Back up first. Then use **Erase workspace** in the app, or clear the site's data in the browser
settings. Uninstalling the icon alone may leave data in browser storage.
