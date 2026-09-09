# Deploying Creel on Netlify

## How it is wired

Netlify builds from **`main`**. There is no build command — the app ships as
static files and `app.js` is committed — so a merge to `main` is the deploy,
and it is live within about a minute.

`Experimental` is the review branch. Nothing on it is public.

| Setting | Value |
|---|---|
| Base directory | `london-fishing-companion` |
| Build command | *(empty)* |
| Publish directory | `.` |
| Production branch | `main` |

Configuration is in `london-fishing-companion/netlify.toml` and is committed —
do not set these in the Netlify UI as well, or the two will disagree and the
file will lose.

---

## The one header that actually matters

```toml
[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"
```

**If `sw.js` gets cached, installed phones keep serving the old build for
ever and your updates never arrive.** The service worker is the thing that
decides what everything else fetches, so it is the one file that must always
be checked against the server. `index.html` and the manifest are the same, for
smaller reasons.

`app.js` is deliberately cached for a week. That is safe *because* the service
worker versions it: bump `CACHE` in `sw.js` and installed clients fetch the new
bundle regardless of what the browser cache thinks.

Which is the whole deployment checklist:

```bash
npm run build          # regenerates app.js AND standalone/Creel.html
npm test               # 18 suites
# bump CACHE in sw.js  # lfc-vNN -> lfc-vNN+1
```

**Forgetting the bump is the one mistake that looks like a successful
deploy.** The site updates, your browser shows the new version, and every
installed phone carries on running the old one.

---

## Checking a deploy actually landed

```bash
curl -sI https://london-fishing-companion-app.netlify.app/sw.js | grep -i cache-control
curl -s  https://london-fishing-companion-app.netlify.app/sw.js | head -3
```

The second should show the `CACHE` version you just shipped. On a phone that
already has it installed, the new service worker installs in the background
and takes over on the next launch — so quit the app fully rather than just
switching away from it.

---

## Deploy previews

Netlify builds a preview for every pull request. Because the app is entirely
static, a preview is fully functional — including installing it to a phone.
Useful for handing a branch to somebody to try before it goes to `main`.

One caveat: a preview has its own origin, so anything stored on it is separate
from the live app. That is usually what you want, but it does mean a preview
cannot show you a bug that depends on somebody's existing data.

---

## The map files

`map/*.json` is 11 MB in total and is committed. The GTA region alone is 7.9 MB.

That is fine — Netlify serves it compressed, and only the ~515 KB London region
ships with the app. The rest are downloaded on request. But it does mean the
repository is large, and a `git clone` is not fast.

Do not add regions casually. Each one is a permanent addition to every clone.

---

## The plug

Copy for a Netlify showcase or a "built with" listing:

> **Creel** — an offline-first field guide and catch log for anglers.
>
> Installs from the browser and then works with no connection at all: maps for
> six regions of southern Ontario drawn on the device from OpenStreetMap data,
> a catch-conditions rating that shows its working, a cross-linked
> encyclopedia of fish, baits, tactics and knots, and a catch log that never
> leaves the phone.
>
> No account, no ads, no analytics, no backend. Vanilla React bundled to a
> single file, a hand-written service worker, and static hosting doing
> everything else — which is the point: the places worth fishing are the
> places with no signal, and an app that needs a server is an app that stops
> working exactly when you need it.
>
> <https://london-fishing-companion-app.netlify.app>

---

## If the site name changes

The app is called Creel now; the Netlify site and both repositories still carry
the old name. Renaming the site changes the URL, and the URL is:

- printed into the QR code (which reads `location.origin`, so that one is fine)
- in `community.js` as the packs base URL
- on anything already shared or bookmarked

If you do rename it, set up a redirect from the old address and expect to leave
it there permanently. `APP_ID` and the `lfc:` storage prefix must not change
regardless — see the note in `portability.js`.
