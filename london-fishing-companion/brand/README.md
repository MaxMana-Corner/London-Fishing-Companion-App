# Creel — brand assets

The mark is a **creel with a rod laid across the top**, the rod running through
the strap so the basket and the rod read as one carried object. A fish tail
breaks the lid. Approved 2026-09-07.

## What is in here

| File | What it is |
|---|---|
| `creel-mark.svg` | Full cut. Grip, reel seat, two line guides, weave. Use at 48 px and up. |
| `creel-mark-small.svg` | Heavy cut. Detail removed so the rod stays a single strong diagonal. Use below 48 px. |
| `colourways.json` | The three approved ink/ground pairs. |
| `rasterise.html` | Renders the masters to the PNGs below. |
| `icon-180.png` | `apple-touch-icon`. |
| `icon-192.png` `icon-512.png` | Manifest icons, `purpose: any`. |
| `icon-maskable-512.png` | Manifest icon, `purpose: maskable`. 22% padding so Android's circle/squircle crop cannot clip the rod tip. |
| `favicon-32.png` | Browser tab. |

## The masters carry no colour

Every stroke and fill in both SVGs is `currentColor` — there is not one
hard-coded hex in either file. That is what makes a colourway a two-value
change rather than a third copy of the artwork, and it is why the in-app mark
can follow the theme with no extra assets.

```bash
grep -c 'currentColor' creel-mark.svg        # 5
grep -ci '#[0-9a-f]\{3,6\}' creel-mark.svg   # 0
```

Keep it that way. A hex sneaking into the master is the bug that produces a
mark which ignores the theme on exactly one screen.

## Regenerating the PNGs

The rasteriser is a page, and a page cannot write to the repo, so a small
local-only sink does the writing:

```bash
node tools/icon-sink.mjs
```

Then open `http://localhost:8788/brand/rasterise.html`. It draws each spec and
POSTs the result to the sink, which validates the PNG signature before writing
and only accepts the five known names. The page prints what it saved. Ctrl-C
the sink when it is done.

## The colourway that ships is not a free choice

All three colourways ship in the bundle and the setting lives in Options, but
the **installed home-screen icon is fixed at install time** and is always
Slate & Bone. iOS reads `apple-touch-icon` once when the user adds to the home
screen and caches it; Android reads the manifest at install. There is no
runtime API that repoints an installed PWA's icon, and this app has no backend
to serve a per-user manifest.

So changing the colourway restyles the in-app mark, the favicon and
`theme-color` immediately, and does **not** change the home-screen icon. The
Options UI has to say so. An app that silently fails to do something it just
offered is the same failure as every other one on the invariants list.
