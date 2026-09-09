# Discord announcement copy

Paste-ready. Pick the length that fits the channel — do not post all three.

---

## Short — for a #showcase or #projects channel

> **Creel** — a fishing field guide and catch log that works with no signal.
>
> Offline maps for six regions of southern Ontario drawn from OpenStreetMap:
> rivers, streets, footpaths, and the things that actually matter on a bank —
> piers, boat ramps, parking with paid and free marked separately, toilets,
> weirs. A catch rating that shows its working instead of just handing you a
> number. An encyclopedia of fish, baits, tactics and knots where everything
> cross-links.
>
> No account, no ads, nothing tracked. Installs to a phone from the browser.
>
> <https://london-fishing-companion-app.netlify.app>

---

## Medium — for an angling community

> Built a thing for people who fish where there is no phone signal.
>
> **Creel** is a field guide and catch log that installs from a browser and
> then runs completely offline. It is free, there is no account, and nothing
> is tracked or uploaded — your log sits on your phone.
>
> What is in it:
>
> **Offline maps.** Six regions of southern Ontario — London, Windsor, Sarnia,
> Goderich, Grand Bend, the GTA — drawn on the device from OpenStreetMap data
> you download once. Not just roads: piers, boat ramps, parking with paid and
> free distinguished, toilets, weirs, dams, canoe clubs. Download it at home,
> use it where there is no signal.
>
> **A rating that explains itself.** Solunar period, time of day, moon, cloud,
> wind, barometric trend — and it shows every factor with what it contributed,
> so you can disagree with it on the evidence rather than just distrusting it.
>
> **An encyclopedia that is actually joined up.** Fish, baits, hooks and rigs,
> tactics, knots, tips, rules. One search box across all of it. A tactic lists
> the fish it takes and those fish list the tactic back, from the same data,
> so they can never disagree.
>
> **A log** with photos and stats you can read one season at a time.
>
> **Map pins you can share** — snags, hazards, good spots, access notes — and
> community packs of local knowledge from other anglers. Everything shared is
> read by a person before it goes in. Personal pins never leave your phone.
>
> It cannot tell you the regulations, and does not pretend to: it carries a
> seasons table as a convenience, says so, and links to the ministry's own
> pages. A regulation changed in March is the difference between a legal fish
> and a fine.
>
> <https://london-fishing-companion-app.netlify.app>
>
> iPhone: open in Safari, Share → Add to Home Screen. Android: Chrome, ⋮ →
> Install app. Open it once with a connection, then it works without one.

---

## For a developer channel

> **Creel** — an offline-first fishing app, and an exercise in how few
> dependencies you can get away with.
>
> Vanilla React bundled by esbuild into one file. No framework, no router, no
> state library, no CSS framework. A hand-written service worker. Storage
> degrades IndexedDB → localStorage → memory so it still runs in a locked-down
> browser. Three network calls in the whole app, all on demand; a test asserts
> first render fires none.
>
> The maps are drawn on a canvas from OpenStreetMap data processed offline —
> Douglas–Peucker simplification, Sutherland–Hodgman clipping, quantised
> integer coordinates. The QR code generator is written from the spec, because
> a code that only appears when you have signal is useless for the one thing it
> is for.
>
> The interesting part was not the features. Nine separate times the map
> pipeline was handed a wrong answer with an HTTP 200 on it — a Swiss mirror
> answering questions about Canada, a timeout returned as an empty success, a
> query whose area-clipped half silently resolved to nothing. Every one of them
> is now an assertion about what the data must contain, and they are written up
> with the failure that produced them.
>
> 18 test suites, 817 assertions, plain Node. No test runner.
>
> <https://github.com/MaxMana-Corner/London-Fishing-Companion-App>

---

## Answering the obvious questions

**"Is it free?"** Yes. No account, no ads, no paid tier.

**"Does it track me?"** No analytics of any kind. Your location is used on the
device and never transmitted. The app does not ask for it until you tap the
button that asks.

**"Ontario only?"** The maps are, for now — six regions of southern Ontario.
The field guide, tactics and log work anywhere; the seasons table is written
for Fisheries Management Zone 16.

**"Is it on the App Store?"** No. It installs from the browser, which is why
there is nothing to approve and no account to make.

**"Can I add my local spot?"** Yes, from inside the app, and you do not need a
GitHub account. A person reads every submission.
