# Building a pack from a spreadsheet

A **pack** is a JSON file the app downloads and merges into your Field Guide —
spots, species, baits, knots and tips. A **pin set** is the same idea for map
pins. Both are plain files served from the packs repository; there is no
server and nothing to deploy.

This tool exists so you can curate one without hand-writing JSON. It does two
things:

1. Turns a **spreadsheet** into a pack — content you typed, or mined off the
   web and tidied up.
2. Folds **other people's packs** into one you curate — community
   contributions arrive as pack JSON already, and `--merge` combines them.

Before it writes anything it validates the result with the app's own
`validateImport()` and `validatePinSet()` — the same functions that run when
somebody taps Import. **If this tool writes a file, the app will read it.**

---

## The short version

```bash
cp -r tools/pack-template my-pack
# edit the CSVs in my-pack, delete the example rows
node tools/make-pack.mjs my-pack --id thames-north --title "Thames north branch" --author "Your name"
```

That writes `out/thames-north.json`, and `out/thames-north-pins.json` if you
filled in `pins.csv`. Commit them to `packs/` and `pins/` in the
`london-fishing-community-packs` repository.

---

## The spreadsheet

`tools/pack-template/` holds one CSV per kind of record. **Use only the ones
you need** — a pack of nothing but spots is perfectly normal, and the tool
labels it a `locations` pack so the directory lists it apart.

| File | What goes in it |
|---|---|
| `spots.csv` | Places to fish |
| `species.csv` | Fish |
| `baits.csv` | Baits and lures |
| `knots.csv` | Knots |
| `tips.csv` | Short pieces of advice |
| `tactics.csv` | How to fish — a method, its steps, and what it takes |
| `pins.csv` | Map pins — snags, hazards, pollution, good spots, access notes |

If you work in Excel or Google Sheets, keep one sheet per file and use
**Download → CSV** on each. Quoted fields, commas inside a cell, and Excel's
byte-order mark are all handled.

Rows whose first cell starts with `#` are ignored, which is how the templates
carry their own instructions. Delete the example rows before you build.

### Tactics are mostly ids

`tactics.csv` is the one sheet where the columns that matter least look like
the ones that matter most. The prose — `gist`, `gear`, `tell`, `fail`, and the
piped `how` steps — is what a person reads. But `targets`, `baits`, `rigs` and
`knots` are what make the tactic **reachable**: they are ids, and they are why
a custom tactic shows up on the smallmouth page and in a filter for "takes
walleye". Fill them in.

    targets   smb|rock|sucker|carp        NOT  Smallmouth|Rock bass
    rigs      float|splitshot
    knots     uni|clinch

A tactic with no ids is not broken — it is just invisible from everywhere
except a search for its name.

`style` must be one of `float`, `ledger`, `lure`, `fly`, `ice`, `troll`, and
`diff` one of `Start here`, `Worth learning`, `Advanced`. Anything else is
dropped rather than shown, because an unknown style has no tile to sit in.

Because tactics carry more free prose than any other sheet, they get the most
attention from `moderation/blocklist.txt` in the packs repo. That list matches
**whole words**, so ordinary fishing writing passes — `smallmouth bass` and
`crappie` used to be flagged by `ass` and `crap` back when matching was
substring, which is exactly why the list sat empty for so long.

### Rules that matter

- **Every row needs an `id`** — lower case, no spaces, unique within the file.
  It is how the app merges: import the same pack twice and nothing duplicates.
- **Spots, species, baits and knots need a `name`.** Tips do not.
- **Lists use a pipe `|`**, not a comma and not a semicolon. A comma means
  something to CSV, and prose is full of semicolons — *"Wet the knot; pull it
  slowly"* is one step, not two.
- **Coordinates are two columns**, `lat` and `lon`, because that is what you
  can sort and eyeball. The tool pairs them up.
- Anything not listed below is ignored rather than smuggled through. The
  columns are exactly the app's sharing allowlist.

### The awkward columns

| Column | Looks like | Means |
|---|---|---|
| `depth` | `0\|1\|2\|3\|4\|4.5\|4\|3\|2\|1\|0.5\|0` | A cross-section of the swim in metres, bank to bank |
| `hot` | `4:Undercut bank\|8:Gravel bar` | Features, keyed to a position in that cross-section |
| `density` | `smb:3\|carp:4` | Species id, then how many of them, 0–5 |
| `access` | `parking:4\|walk:4\|footing:3\|amenities:2\|cost:5` | All five rated 0–5. `cost:5` means free |
| `best` | `5\|6\|7\|8\|9` | Month numbers, so this is May to September |
| `steps` | `Do this.\|Then this.` | One knot instruction per item |
| `type` (pins) | `snag` | One of `snag`, `hazard`, `pollution`, `good-spot`, `access-rating` |

---

## Curating from community contributions

Contributions land in the packs repo as JSON. To build a curated pack out of
several of them, plus anything of your own:

```bash
node tools/make-pack.mjs my-pack \
  --id best-of-thames --title "Best of the Thames" --author "Your name" \
  --merge contributions/river-forks.json \
  --merge contributions/kilally-snags.json
```

You can drop the folder and merge only:

```bash
node tools/make-pack.mjs --id best-of-thames --title "Best of the Thames" \
  --merge a.json --merge b.json
```

Merging uses **the same rule the app itself merges by**: union on `id`, and
where two records share an id the **newer `updatedAt` wins**. Anything the
app would reject is refused here rather than quietly half-merged, so a broken
contribution stops the build instead of poisoning the pack.

Pin sets and catalog packs are kept separate — merge either or both, and you
get up to two files out.

---

## Options

| Option | |
|---|---|
| `--id <slug>` | **Required.** File name and directory id. Lower case, digits, hyphens |
| `--title "..."` | **Required.** Shown in the community directory |
| `--description "..."` | One line on what the pack is |
| `--author "..."` | Who gets the credit |
| `--note "..."` | Free text stored inside the file |
| `--merge <file>` | Fold in an existing pack. Repeatable |
| `--out <dir>` | Where to write. Default `./out` |
| `--check <file>` | Validate an existing file and stop |
| `--quiet` | Only complain |

`--check` is worth knowing about on its own — point it at anything from the
packs repo and it tells you whether the app would accept it, and what is in
it:

```bash
node tools/make-pack.mjs --check ../london-fishing-community-packs/packs/some-pack.json
```

---

## What it will not do

It writes only the fields the app shares. Notes, licence details, catch
history and your own photos have no path through this tool, the same way they
have no path through the in-app submission flow. That is deliberate: the
allowlist is what makes sharing safe, and a curation tool that quietly went
around it would undo the point of having one.
