# Creel

A field guide and catch log for Ontario anglers. It installs to a phone, then
works with the network off — which is the point, because the places worth
fishing are the places with no signal.

No account. No ads. Nothing tracked. Your log lives on your phone and goes
nowhere unless you export it yourself.

**Live at:** https://london-fishing-companion-app.netlify.app

---

## Installing it

| Platform | Steps |
|---|---|
| **iPhone / iPad** | Open the link in **Safari** → Share → **Add to Home Screen** |
| **Android** | Open the link in Chrome → ⋮ → **Install app** |

On iOS it has to be Safari; Chrome for iPhone cannot install web apps.

Open it once with a connection so it can save what it needs, then it runs with
the network off.

There is also a **single-file build** — `standalone/Creel.html`, about 610 KB.
One file, no server, no install. Copy it to a phone by cable or memory stick
and open it. Useful where there is no connection to install from in the first
place.

---

## What it does

**A dashboard that answers "is it worth going out".** A rating from the
solunar period, time of day, moon, cloud, wind and barometric trend — and it
shows its working, every factor with what it contributed, rather than asking
you to trust a number.

**Offline maps.** Six regions of southern Ontario, drawn from OpenStreetMap
and rendered on a canvas: rivers, lakes, streets, footpaths, buildings,
parks, and points of interest that matter to an angler — piers, boat ramps,
parking (paid and free marked separately), toilets, weirs, dams, canoe clubs.
Downloaded once, kept through app updates.

| Region | Download |
|---|---|
| Goderich | 139 KB |
| Sarnia | 232 KB |
| Grand Bend | 331 KB |
| London *(ships with the app)* | 515 KB |
| Windsor | 537 KB |
| Greater Toronto | 2.3 MB |

**An encyclopedia in seven parts** — fish, baits and lures, hooks and rigs,
tactics, knots, tips, rules — with one search box across all of it, and
everything cross-linked. A tactic lists the fish it takes; those fish list the
tactic back, from the same data, so the two can never disagree.

**A catch log** with trips, fish, photos, and stats you can read one season at
a time.

**Map pins** you can drop and share — snags, hazards, good spots, access
notes — and community packs of local knowledge that other anglers have
submitted.

---

## What it will not do

It will not tell you the regulations. It carries a seasons table as a
convenience and says so, and it links to the ministry's own pages, because a
regulation changed in March is the difference between a legal fish and a fine.
The app holds the addresses, never the contents.

It will not upload your log. There is no account to attach it to.

It will not ask for your location until you tap the button that asks for it.

---

## For developers

Vanilla React, no framework, bundled with esbuild into one file. A hand-written
service worker. Storage is IndexedDB with a localStorage fallback and an
in-memory fallback after that, so the app still runs in a locked-down browser.

```bash
npm install
npm run build      # app.js + the single-file build, both verified
npm test           # 18 suites, 817 assertions
```

Full architecture, the map pipeline and the pack format are in
**[docs/DEV-MANUAL.md](docs/DEV-MANUAL.md)**. How to use the app is in
**[docs/USER-MANUAL.md](docs/USER-MANUAL.md)**.

---

## Contributing local knowledge

You do not need a GitHub account to contribute a spot or a map pin — the app
submits them for you. If you would rather do it by hand, or want to build a
whole field-guide pack from a spreadsheet, see
[tools/PACK-BUILDING.md](london-fishing-companion/tools/PACK-BUILDING.md).

Everything submitted is read by a person before it is merged.

---

## Licence and credits

Map data © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
Weather from [Open-Meteo](https://open-meteo.com/). River gauges from the
Government of Canada hydrometric service.
