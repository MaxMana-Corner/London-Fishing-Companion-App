# Creel — user manual

Everything the app does, in the order you are likely to need it.

---

## Getting it on your phone

Open **https://london-fishing-companion-app.netlify.app** and add it to your
home screen — Share → Add to Home Screen on an iPhone, ⋮ → Install app on
Android. On an iPhone it must be Safari; Chrome for iPhone cannot install web
apps.

Do this once with a connection. After that it opens with the network off.

**Handing it to somebody standing next to you:** Data → *Show someone the
app* prints a code they can point a camera at. It opens in whatever browser
they already use and there is nothing to install first.

---

## The five tabs

**Spots** — the dashboard. What is worth going after, whether conditions are
any good, what is near you, and the list of waters.

**Guide** — the encyclopedia. Seven categories, one search box.

**Log** — trips and fish.

**Stats** — what your log adds up to, one season at a time.

**Data** — backup, sharing, licence reminder, and the QR code.

---

## Spots — the dashboard

### The place line

The line above the heading is where the app thinks you are. Until you tell it,
it says so rather than guessing. **Tap the round button to its left** to fix
your position — it is used on the device to work out what is nearest, and is
never sent anywhere.

### Worth going after

One card: the fish most worth targeting right now — open season, and densest
across the waters the app knows — and how many species are open today. *See
the full season* opens the whole table.

### The rating

A number out of 100 with a word: Prime, Good, Fair or Slow. **Tap it** and it
shows exactly how it got there:

| Factor | Effect |
|---|---|
| Major solunar period | +25 |
| Minor solunar period | +12 |
| First or last light | +20 |
| Bright midday | −12 |
| Overcast | +8 |
| Useful ripple (8–20 km/h) | +5 |
| Too windy (over 30 km/h) | −15 |
| Rain likely | −8 |
| Falling pressure | +10 |
| Rising pressure | −5 |
| Full or new moon | +6 |
| Quarter moon | −3 |

It starts at 40 and adds up from there. A very good day can total more than
100, and the rating caps — when it does, the breakdown says so, so the numbers
you can see always agree with the dial.

Weather and pressure only count once you have fetched them.

### The weather tile

**The whole tile is the button.** Tap it to fetch the weather for the nearest
spot. It never fetches on its own — nothing in this app goes to the network
unless you ask — so the reading is whatever was last saved, and the tile says
when that was.

### Around you

**Near me** — the closest pins and spots, once the app knows where you are.
Distances are straight-line: they sort the list, they do not navigate.

**Favourites** — spots you starred. Open any spot and tap the star in its
header.

---

## The map

**Spots → Open the map.**

Pinch to zoom, drag to pan, and the crosshair button finds you. Everything is
drawn on the device from data you already downloaded — there are no map tiles
to fetch and no connection needed.

### Downloading a region

The dropdown lists the six regions and what each costs to download. London
ships with the app. A downloaded region survives app updates and stays until
you remove it.

If a region is marked **(experimental)**, the card above the download button
says what came back thin when it was built. It is still a real map — expect
gaps, like a missing street name or an unlabelled town.

### Pins

Long-press the map to drop one: snag, hazard, pollution, good spot, access
note, or a personal note for anything that fits none of those. Tap any pin or
symbol to see what it is, with a link out to your usual maps app for
directions.

**Personal pins never leave your phone.** Everything else can be shared, and
sharing is always a deliberate act — nothing is uploaded in the background.

### The legend

Every symbol the map can draw, drawn by the same code that draws the map, so
it cannot fall out of step with what you are looking at.

---

## The encyclopedia

**Guide** opens the hub. Seven tiles, a search box, and the things you use most
in a row underneath it.

Search covers every category at once. Type "walleye" and you get the fish, the
tactics that take it, and the baits — you do not have to know which drawer a
thing lives in.

### Rearranging it

**Arrange**, top right. Each tile gets:

- a size button that cycles **S → W → L** (small, wide, large — large tiles
  show a preview permanently)
- arrows to move it earlier or later, and you can drag it as well
- an ✕ to remove it, which only hides it from this page. It stays searchable,
  and the **Hidden** row puts it back.

Your layout is saved. A category added in a later update appears at the end
rather than being lost.

### Category pages

Every category lists everything with the same controls:

- **Default** — your own records first, then the built-in ones
- **Most used** / **Last used** — by what you actually open, not what you scroll past
- **A–Z**
- **★ Favourites** — only the starred ones
- **Clear** — appears when a filter is on

Under Default, your own records are capped at six with "and N more of yours"
below, so a long personal list cannot bury the rest.

### Tactics

Seventeen ways of fishing across six styles — float, ledgering, lure, fly,
ice, trolling. Each one has the steps, what you need, **how you know it is
working**, and **what usually goes wrong**, plus the fish, baits, rigs and
knots it uses. Tap any of those and it opens over the top; close it and you
are back where you were.

**Add your own** from the Tactics page. The wizard asks for the fish and baits
it uses — worth filling in, because that is what makes your tactic appear on
their pages. Without it, only a search for its name will find it.

### Links on records

Any fish, bait or tactic can carry up to three links — an article, a video, a
regulation page. They show as a label rather than a raw address, with an ✕ to
clear one.

Shortened links are refused, because there is no way to tell where they go.

### Rules

**Where to check** sits above the seasons table: the regulations summary,
licences, management zones, the eat-safe advisory, invasive species and the
spills line. You can add three of your own.

**The seasons table is a convenience and can be out of date.** Those links
open the real thing. Check before you go.

---

## The log

**Log → New trip** — where, when, water clarity. Then log fish against it:
species, bait, length, kept or released, and a photo.

Photos stay on the phone. Data → Google Drive can archive them if you want a
copy elsewhere, and that is opt-in.

---

## Stats

Trips, fish, hours, best of each species, and what actually produced — by
spot, by bait, by month, by water clarity.

Once you have fished more than one year, a row of seasons appears at the top.
**All time** blends them; a year shows that year alone.

---

## Sharing and backing up

**Data** holds all of it.

| Export | What it is |
|---|---|
| **Field Guide Pack** | What you know — your spots, species, baits, tactics. Safe to hand to another angler. Never includes your catches. |
| **Log** | What you caught. Yours. |
| **Everything** | Both, for your own backup. |

Import never overwrites blindly: it checks the file, works out exactly what
would change, and tells you before writing anything.

**Community packs** — browse what other anglers have submitted, and submit
your own. No account needed. A person reads every submission before it is
merged.

---

## Privacy, plainly

- No account, no analytics, no advertising.
- Your log, photos, pins and favourites are on your phone.
- Location is used on the device and never transmitted.
- Three things touch the network, all when you ask: the weather, river gauges,
  and community packs.
- Google Drive backup is opt-in and goes to *your* Drive.

Full text in [privacy.html](../london-fishing-companion/privacy.html).
