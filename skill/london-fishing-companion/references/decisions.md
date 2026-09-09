# Decisions worth remembering

Each of these was chosen deliberately, usually after weighing a real
tradeoff or finding a real bug. If a future change seems to call one of
these into question, treat that as worth flagging explicitly to the user
rather than quietly reversing.


## Scope is Canada — settled, not open

The app covers **Canada only**. Owner's direction, 2026-09-07: no American
cities in the map beyond a name and the border where one sits close to a
Canadian region, as Detroit does to Windsor and Port Huron to Sarnia. No
American buildings, streets, parks or paths.

Implemented as an `area["ISO3166-1"="CA"]` filter on the land layers in
`tools/build-map.mjs`, with a `border` layer drawn as a dashed line so the
absence of detail across it reads as a decision rather than a missing tile.
**Water is exempt on purpose** — the border runs down the middle of the
Detroit and St. Clair rivers and they are prime fishing.

Do not re-open this as "we could support US users too" without treating it as
a scope change the owner has to agree to.

## Live conditions: two tiers, not one

Early in the project, "add weather and other webhooks that make sense" was
deliberately split into:
- **Tier 1 (always on):** anything computable purely from coordinates + date
  — sunrise, moon phase, solunar windows, pressure trend from cached
  readings, licence expiry. Zero network involved, ever.
- **Tier 2 (best-effort):** live weather (Open-Meteo) and river gauge data
  (Environment Canada), fetched on demand, cached with a timestamp, always
  degrading to the last known value rather than an error.
- **Tier 3 (explicitly excluded):** UTRCA advisory-page scraping and any
  shared/community catch-reporting layer. Both were considered and rejected
  — the first because the data isn't cleanly structured (a page-watcher is
  fragile), the second because it changes the app's entire architecture
  from single-user to multi-user. **Don't quietly reintroduce either as a
  "nice to have."**

## Gauge auto-selection: capped and lazy, on purpose

Auto-picks the nearest Environment Canada gauge within 50 km when a spot
with coordinates has none chosen. Two constraints matter:
- **Capped at 50 km** so a spot with nothing nearby doesn't get handed a
  useless gauge 300 km away.
- **Triggered lazily, per spot, only when that spot is opened** — never
  eagerly for all twelve spots on app load. Doing it eagerly would be a
  burst of network calls the app doesn't need, violating invariant #1.

A manual "Change gauge" override always exists and is never overwritten by
the auto-selection once a person has chosen one themselves.

## Export/import: three files, not one

Pack (custom spots/species/baits/knots/tips), Log (trips/catches/photos),
and Full (both) are kept as **separate export kinds**, not one blob, because
sharing your knowledge with another angler and backing up your own personal
catch history are different acts with different privacy implications. A
Field Guide Pack **excludes built-in content** specifically so importing it
into someone else's copy never creates duplicates.

Import always validates the file, computes a merge plan, and **shows the
plan before committing anything** ("12 new spots, 3 updated, 40
unchanged"). Merge is by `id`, newest `updatedAt` wins — the same rule
everywhere records reconcile (Sheets sync, Drive backup, manual import).

**One deliberate difference, on ties only.** `mergeList()` in
`portability.js` requires the incoming record to be *strictly* newer
(`incoming > existing`); `mergeById()` in `App.jsx` and `mergeLists()` in
`Code.gs` let the incoming copy win a tie (`>=`). This is not an oversight
to "harmonise": strict `>` is what makes re-importing your own backup report
"40 unchanged" instead of "40 updated", which is the whole point of showing
a preview. Changing it to `>=` would make an idempotent import look
destructive. Leave it.

## Google Sheets sync vs. Google Drive backup — two systems, kept apart

These are **not** the same feature and must not be merged or confused:

| | Google Sheets sync | Google Drive backup |
|---|---|---|
| Auth model | Apps Script deployed under the **developer's** own Google account | Real per-person OAuth — each user connects **their own** account |
| Who it suits | The developer's personal log, or a deliberately shared one | Anyone downloading the app, wanting their own private backup |
| Where data goes | One spreadsheet, whoever deployed the script owns it | Each person's own Drive, invisible to everyone else |
| Setup cost | ~5 min, no Google Cloud Console needed | One-time OAuth Client ID setup in Google Cloud Console by the developer; then zero setup per end user |

**Keep the two feature sets in step.** Because Sheets sync was built first,
content types added later have twice been missed on the sync side: knots
became user-extensible long after `mergeData()` in `Code.gs` and
`applyRemote()` in `App.jsx` were written, and neither carried them, so
custom knots were silently dropped. When you add a content type, update
both merge paths as part of the same change.

The Sheets sync feature was built **first**, when the app was assumed to be
Dillon's personal tool. The Drive backup feature was built **later**,
specifically because the requirement changed to "other people download this
and want their own backup" — a real sign-in with the shared Apps-Script
identity fundamentally cannot satisfy that requirement, since everyone's
data would land in one person's Drive. Both were kept, as independent,
non-overlapping options, rather than having one replace the other.

## Google Drive: scope, sharing, and token lifetime

- **Scope is `drive.file` only** — the app can create files and re-open
  only the files it created itself. It was never widened to `drive.appdata`
  or full Drive access. This is the narrowest scope that does the job and
  it should stay that way even if a future feature wants to read more.
- **Files are created private, never shareable-by-link.** This was
  explicitly *flipped* mid-project: an earlier design (routing backups
  through the developer's own Apps Script identity) had considered
  link-shareable files for simplicity, since it was "just Dillon's own
  photos." Once the requirement changed to real strangers' personal photos,
  the default correctly flipped to private + authenticated re-fetch. Don't
  flip it back for convenience.
- **The OAuth token is held in memory only, for the current session, and
  deliberately not persisted.** Google's own current guidance for
  browser-only apps (no backend) is the token model: short-lived access
  tokens, no refresh tokens, because refresh tokens require a client secret
  that cannot live safely in browser JavaScript. The app's `connected`
  state is explicitly reset to `false` on every reload rather than lying
  about a session that no longer has a valid token.
- **Known asymmetry:** silent token refresh relies on Google's own
  browser-session cookie, which Safari's Intelligent Tracking Prevention
  interferes with. Expect more frequent "reconnect" prompts on iOS Safari
  than Android Chrome. This is a platform limitation, not a bug to chase.
- **OAuth requires a fixed, pre-registered origin**
  (`https://london-fishing-companion-app.netlify.app`, exact match, no
  trailing slash — see deployment.md, this changed and may not yet be
  updated in Cloud Console).
  Changing the deployed domain means updating the Google Cloud Console
  OAuth client's authorized origin to match, or sign-in breaks entirely.

## Photo archiving: ordering and permanence are the whole safety model

- **Upload, verify a real file id came back, only then delete the local
  original.** Never the reverse order. A failed upload must never cost
  someone a photo — this exact ordering is unit-tested.
- **The thumbnail is permanent and is never deleted**, even after the
  full-resolution original is archived away. This is what makes an old
  catch always show *something* instantly, even offline, even years later
  — the full-resolution image is fetched back from Drive only when there's
  a connection and a valid session.
- **Archiving triggers at 80% of the device's storage quota, oldest photos
  first**, checked when the app opens (see invariant #10 — there is no
  background execution to check this any other way on iOS).

## Hook & rig illustrations: redesigned for a real reason

The original 11 hook drawings only labelled one feature explicitly (the
offset hook's Z-bend); the rest relied on a caption below the image that the
reader had to match up themselves. This was identified as a real
readability gap and fixed by giving **every** hook and rig drawing an
explicit `Callout` (a ringed feature + leader line + word) and a `ScaleBar`
(a relative-size reference), so the eleven-plus-seven set reads as a
comparable series rather than eleven pictures each sized to fill its own
frame. Strokes were also darkened for outdoor/sunlight screen legibility.

## Illustrations are drawn, not photographed — and this is permanent

Both the bait/lure art and the hook/rig art are hand-drawn SVG, not stock or
scraped photography. Three reasons, all still valid: product photos are
copyrighted; external image URLs would break the offline/zero-external-
request guarantee; and a drawing can show the thing that actually matters
(where a hook sits inside a tube, which way a blade turns) in a way a
catalogue photo usually hides. A person can still paste their own photo
into most of these fields to override the drawing — that's additive, not a
replacement for the default illustration.
