# Deployment reference

## Live site

**https://london-fishing-companion-app.netlify.app** — the current live
domain, confirmed by the owner on 2026-09-03. This is the URL that belongs
in the READMEs, the privacy link, and the Google Cloud Console setup below.

An older **`london-fishing.netlify.app`** deploy also still answers, and it
is the domain named all through earlier versions of these notes as "locked
in and registered as the OAuth authorized origin." Treat that claim as
**unverified and probably stale**.

**Consequence worth checking first if Drive sign-in misbehaves:** Google
matches the authorized JavaScript origin exactly. If Cloud Console still
lists only `https://london-fishing.netlify.app`, then on the live
`-companion-app` domain sign-in fails with an origin mismatch while every
other feature works perfectly — which reads to a user as "Drive is broken,"
not "wrong address." Fix by adding (or switching to) the live origin in
Cloud Console. Retire the old subdomain, or keep it as a registered second
origin deliberately — but don't leave it advertised in any README.

## Deploying

Drag the `london-fishing-companion/` folder (or its zip, with `index.html`
at the root) onto Netlify. No build command, no framework preset —
everything is pre-compiled before it gets there. There is no `dist/`
folder; `netlify.toml` sets `publish = "."`, so the project root is the
publish directory and `src/`, `tests/`, `apps-script/` and `standalone/`
ride along. Harmless (they're never requested), but worth knowing.

`netlify.toml` / `_headers` set `sw.js` to
`Cache-Control: public, max-age=0, must-revalidate`. This is load-bearing:
without it, the service worker file itself can get stuck in an HTTP cache,
which means the update mechanism described in architecture.md (bytes-diff
on `sw.js`) never even gets a chance to fire.

## Google Drive OAuth setup (one-time, done by whoever deploys the app)

Needed only once per deployment. Steps, if redoing or auditing:

1. **console.cloud.google.com** → new project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: External
   - App name, support email, developer contact
   - Privacy policy URL:
     `https://london-fishing-companion-app.netlify.app/privacy`
     (this file already exists at `privacy.html` and is precached)
   - Scope added: `https://www.googleapis.com/auth/drive.file` only
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origin:
     `https://london-fishing-companion-app.netlify.app`
     — exact string, `https`, no trailing slash, no path
5. Paste the resulting client ID into `index.html`:
   ```html
   <script>
     window.LFC_GOOGLE_CLIENT_ID = "…apps.googleusercontent.com";
   </script>
   ```
   Leave it as an empty string and the app still runs completely — the
   Drive section just says it isn't configured, rather than breaking
   anything else. **The current checked-in `index.html` has a real client ID
   filled in**, which is correct and expected: an OAuth client ID is a public
   identifier, not a secret, and it ships in the HTML of every deployed copy
   by design. Don't "redact" it.

## Two separate Google-side gates — don't conflate them

These caused real confusion once and are easy to mix up:

**Gate 1 — Publishing status: Testing vs. In production.**
While the OAuth consent screen is in **Testing**, only Google accounts
explicitly added under **Test users** can sign in at all — everyone else,
including the developer's own account if not added, gets a hard
**Error 403: access_denied**, "has not completed the Google verification
process… can only be accessed by developer-approved testers." This already
happened once in this project and was fixed by adding the developer's
email as a test user (to unblock immediately) and clicking **Publish App**
on the consent screen (to open it to everyone, not just an allowlist).
**This is the one that fully blocks sign-in for anyone not on the list.**

**Gate 2 — Verification review (separate, and softer).**
Even after publishing, until Google completes formal app verification,
every user (not just untested ones) sees a "Google hasn't verified this
app" interstitial with a **Continue** option, and there's a lifetime cap of
roughly 100 people who can ever connect. This is a click-through, not a
block — expected and acceptable for a small independent project, and stated
plainly in the public README so it doesn't read as broken or suspicious.
Formal verification (if ever pursued) is submitted from the same consent
screen; the privacy policy page needed for it already exists and is
already linked correctly.

**Do not confuse these two.** Gate 1 (Testing/allowlist) is what actually
blocks real usage and is the first thing to check if someone reports
Google sign-in failing outright. Gate 2 (verification) is cosmetic friction
that doesn't need fixing to ship.

## Google Sheets sync (separate optional feature)

Full walkthrough lives in `apps-script/SETUP.md` — roughly five minutes:
create an Apps Script project, paste `apps-script/Code.gs`, set a private
token string, deploy
as a web app (Execute as: Me, Who has access: Anyone), paste the resulting
URL and token into the app's Sync screen. This is unrelated to the Drive
OAuth setup above — see decisions.md for why the two must stay independent.

## After any rebuild

1. Bump `CACHE` in `sw.js`.
2. Redeploy the whole `london-fishing-companion/` folder.
3. Verify in a fresh private/incognito browser window first — that has no
   service-worker history and hits the network cleanly, which isolates
   "did the deploy actually change" from "is a device just serving a stale
   cached copy."
