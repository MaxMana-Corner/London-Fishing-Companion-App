#!/usr/bin/env node
/* ============================================================
   make-pack.mjs — turn a spreadsheet into a pack the app can read,
   and fold other people's packs into one you curate.

   Two jobs, because curating a pack is two jobs:

     1. Content you typed or mined yourself, kept in a spreadsheet.
        Export each sheet as CSV into a folder and point this at it.
     2. Content other people contributed, which arrives as pack JSON
        already. Pass those with --merge and they are folded in by the
        same rule the app itself merges by: union on id, newer
        updatedAt wins.

   The output is validated with the app's OWN validators before it is
   written — validateImport() from portability.js and validatePinSet()
   from community.js, the same functions that run when somebody taps
   Import. If this tool writes a file, the app will read it. If the
   app would reject it, this refuses to write it.

   Usage:
     node tools/make-pack.mjs <folder> --id my-pack --title "..." [options]

   Options:
     --id <slug>          File name and directory id. Required.
     --title "..."        Shown in the community directory. Required.
     --description "..."  One line on what the pack is.
     --author "..."       Who gets the credit.
     --note "..."         Free text stored in the file itself.
     --merge <file.json>  Fold an existing pack in. Repeatable.
     --out <dir>          Where to write. Default: ./out
     --check <file.json>  Validate an existing file and stop.
     --quiet              Only complain.

   See tools/PACK-BUILDING.md.
   ============================================================ */

import fs from "fs";
import path from "path";
import { validateImport, mergeList, SCHEMA_VERSION, APP_ID } from "../src/portability.js";
import { validatePinSet } from "../src/community.js";

/* ---------------- arguments ---------------- */

const argv = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes("--" + name);
const many = (name) => {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--" + name && argv[i + 1] && !argv[i + 1].startsWith("--")) out.push(argv[i + 1]);
  }
  return out;
};

const QUIET = flag("quiet");
const say = (m) => { if (!QUIET) console.log(m); };
const die = (m) => { console.error("\n  " + m + "\n"); process.exit(1); };

/* ---------------- CSV ----------------
   Written out rather than pulled in, because a dependency for this
   would be a dependency for the whole repo. Handles what a spreadsheet
   actually emits: quoted fields, commas and newlines inside them,
   doubled quotes, and Excel's byte-order mark. */

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false, i = 0;
  text = String(text).replace(/^﻿/, "");
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  /* Drop blank lines and the commented rows the templates ship with. */
  return rows.filter((r) => r.some((x) => String(x).trim() !== "") &&
                            !String(r[0]).trim().startsWith("#"));
}

function readTable(file) {
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((r) => {
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = String(r[i] === undefined ? "" : r[i]).trim(); });
    return o;
  });
}

/* ---------------- cell types ----------------
   Lists use "|" rather than a comma or a semicolon. A comma means
   something to CSV, and prose is full of semicolons: "Wet the knot;
   pull it slowly" is one step, not two. A pipe is not. */

const LIST = (v) => String(v || "").split("|").map((s) => s.trim()).filter(Boolean);
const NUMS = (v) => LIST(v).map(Number).filter((n) => Number.isFinite(n));
const NUM = (v) => (String(v || "").trim() === "" ? undefined : Number(v));

/* "smb:3|carp:4" -> { smb: 3, carp: 4 } */
const RATINGS = (v) => {
  const out = {};
  for (const part of LIST(v)) {
    const at = part.indexOf(":");
    if (at < 1) continue;
    const key = part.slice(0, at).trim();
    const n = Number(part.slice(at + 1).trim());
    if (key && Number.isFinite(n)) out[key] = n;
  }
  return Object.keys(out).length ? out : undefined;
};

/* "4:Undercut bank holds carp|8:Gravel bar" -> [{i:4,n:"..."}, ...] */
const FEATURES = (v) => {
  const out = [];
  for (const part of LIST(v)) {
    const at = part.indexOf(":");
    if (at < 1) continue;
    const i = Number(part.slice(0, at).trim());
    const n = part.slice(at + 1).trim();
    if (Number.isFinite(i) && n) out.push({ i, n });
  }
  return out.length ? out : undefined;
};

const TEXT = (v) => {
  const s = String(v || "").trim();
  return s === "" ? undefined : s;
};
const TEXTS = (v) => { const l = LIST(v); return l.length ? l : undefined; };

/* A closed set of values, matched case-insensitively but written back in the
   canonical spelling. Used where the app switches on the value rather than
   displaying it - a tactic's style picks which tile it sits in, so "Lure",
   "lure" and "LURE" must all become "lure", and "spinning" must become
   nothing at all rather than a tactic that belongs to no tile and is
   therefore unreachable. */
const ENUM = (allowed) => (v) => {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return undefined;
  return allowed.find((a) => a.toLowerCase() === s);
};
const STYLE = ENUM(["float", "ledger", "lure", "fly", "ice", "troll"]);
const DIFF = ENUM(["Start here", "Worth learning", "Advanced"]);
const NUMLIST = (v) => { const l = NUMS(v); return l.length ? l : undefined; };

/* ---------------- what each sheet may contain ----------------
   Only fields the app's own sharing allowlist carries. Anything else
   in the spreadsheet is ignored rather than smuggled through. */

const SHEETS = {
  spots: { file: "spots.csv", key: "spots", fields: {
    id: TEXT, name: TEXT, area: TEXT, water: TEXT, addr: TEXT, blurb: TEXT,
    accessNote: TEXT, bank: TEXT, hazards: TEXT, tip: TEXT,
    depth: NUMLIST, best: NUMLIST, maxDepth: NUM,
    density: RATINGS, access: RATINGS, hot: FEATURES, marks: TEXTS,
  } },
  species: { file: "species.csv", key: "species", fields: {
    id: TEXT, name: TEXT, sci: TEXT, season: TEXT, vs: TEXT, habits: TEXT, size: TEXT,
    idKey: TEXTS, target: TEXTS, baits: TEXTS, where: TEXTS, sizes: TEXTS,
  } },
  baits: { file: "baits.csv", key: "baits", fields: {
    id: TEXT, name: TEXT, kind: TEXT, colour: TEXT, hook: TEXT, rig: TEXT,
    float: TEXT, how: TEXT, when: TEXT, shape: TEXT,
    colours: TEXTS, targets: TEXTS, sizes: TEXTS,
  } },
  knots: { file: "knots.csv", key: "knots", fields: {
    id: TEXT, name: TEXT, use: TEXT, strength: TEXT, fail: TEXT, diff: TEXT,
    steps: TEXTS,
  } },
  tips: { file: "tips.csv", key: "tips", fields: {
    id: TEXT, cat: TEXT, title: TEXT, body: TEXT,
  } },
  /* Tactics carry more free prose than any other sheet - gist, gear, tell,
     fail and a list of steps are all sentences somebody wrote. That is why
     the moderation blocklist matters more here than anywhere else, and why
     matching had to be fixed to whole-word before this sheet could exist:
     under the old substring match, a tactic mentioning smallmouth bass was
     flagged by "ass" and could never be submitted.

     targets/baits/rigs/knots are ids, not names - "smb", not "Smallmouth".
     They are what makes a custom tactic reachable from a fish or bait page,
     and a tactic with none of them is only findable by searching for it. */
  tactics: { file: "tactics.csv", key: "tactics", fields: {
    id: TEXT, name: TEXT, style: STYLE, gist: TEXT, water: TEXT, season: TEXT,
    diff: DIFF, gear: TEXT, tell: TEXT, fail: TEXT,
    how: TEXTS, targets: TEXTS, baits: TEXTS, rigs: TEXTS, knots: TEXTS,
  } },
};

const PIN_SHEET = { file: "pins.csv", fields: {
  id: TEXT, type: TEXT, title: TEXT, note: TEXT, author: TEXT, spotId: TEXT,
} };

function buildRecords(rows, spec, stamp, problems, label, isPin) {
  const out = [];
  const seen = new Set();
  rows.forEach((row, n) => {
    const where = `${label} row ${n + 2}`;
    const rec = {};
    for (const [field, coerce] of Object.entries(spec)) {
      const v = coerce(row[field]);
      if (v !== undefined) rec[field] = v;
      /* A cell that had something in it and produced nothing is a value this
         tool refused, and saying nothing about it is how a typo becomes a
         silent hole. It matters most for the closed-set fields: a tactic
         whose style is "spinning" instead of "lure" belongs to no tile and is
         unreachable from the Tactics screen, while the row itself looks fine
         in the spreadsheet and fine in the built pack. */
      else if (String(row[field] ?? "").trim() !== "") {
        problems.push(`${where}: ${field} "${String(row[field]).trim()}" is not a value this field accepts — left empty.`);
      }
    }
    if (!rec.id) { problems.push(`${where}: no id — skipped.`); return; }
    if (seen.has(rec.id)) { problems.push(`${where}: duplicate id "${rec.id}" — skipped.`); return; }
    seen.add(rec.id);

    /* lat/lon are two columns in the sheet because that is what a person
       can sort and eyeball; the app wants one pair. */
    const lat = NUM(row.lat), lon = NUM(row.lon);
    if (lat !== undefined || lon !== undefined) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
          lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        problems.push(`${where}: lat/lon "${row.lat}, ${row.lon}" is not a usable coordinate — skipped.`);
        return;
      }
      rec.ll = [lat, lon];
    }
    /* custom and _v are catalog bookkeeping. A pin has neither in the app's
       own allowlist, and validatePinSet would strip them anyway - writing
       them would only make the file disagree with what the app exports. */
    if (!isPin) {
      rec.custom = true;
      rec._v = SCHEMA_VERSION;
    }
    rec.updatedAt = stamp;
    out.push(rec);
  });
  return out;
}

/* ---------------- --check ---------------- */

function report(name, v) {
  for (const e of v.errors || []) console.error(`  ERROR    ${e}`);
  for (const w of v.warnings || []) say(`  warning  ${w}`);
  say(`  ${v.ok ? "OK" : "REJECTED"}  ${name}`);
  return v.ok;
}

const checkFile = opt("check");
if (checkFile) {
  const text = fs.readFileSync(checkFile, "utf8");
  let raw = null;
  try { raw = JSON.parse(text); } catch { die(`${checkFile} is not valid JSON.`); }
  const v = raw && raw.kind === "pins" ? validatePinSet(text) : validateImport(text);
  const ok = report(path.basename(checkFile), v);
  if (ok) {
    const c = (v.data && v.data.catalog) || {};
    const counts = Object.entries(c)
      .filter(([, list]) => Array.isArray(list) && list.length)
      .map(([k, list]) => `${k}:${list.length}`);
    if (v.pins) counts.push(`pins:${v.pins.length}`);
    say(`  ${counts.join("  ") || "(nothing in it)"}`);
  }
  process.exit(ok ? 0 : 1);
}

/* ---------------- build ---------------- */

/* The first argument that is neither a flag nor a flag's value. Walking the
   list is the only way to tell "out" the folder from "out" the value of
   --out, and getting that wrong writes the pack into the folder you were
   reading from. */
const VALUE_FLAGS = new Set([
  "--id", "--title", "--description", "--author", "--note", "--merge", "--out", "--check",
]);
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    if (VALUE_FLAGS.has(argv[i])) i++;
    continue;
  }
  positional.push(argv[i]);
}
const folder = positional[0] || null;
const id = opt("id");
const title = opt("title");
const mergeFiles = many("merge");
const outDir = opt("out", "out");

if (!id) die("--id is required. It is the file name and the directory id, e.g. --id thames-north-branch");
if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(id)) {
  die(`--id "${id}" is not usable as a file name. Use 2 to 61 characters: lower case letters, digits and hyphens, starting with a letter or digit.`);
}
if (!title) die('--title is required, e.g. --title "Thames north branch"');
if (!folder && !mergeFiles.length) die("Give me a folder of CSVs, or --merge some pack JSON, or both.");
if (folder && !fs.existsSync(folder)) die(`No such folder: ${folder}`);

const stamp = Date.now();
const iso = new Date(stamp).toISOString();
const problems = [];
const catalog = { spots: [], species: [], baits: [], knots: [], tips: [] };
let pins = [];

/* ---- the spreadsheet ---- */
if (folder) {
  say(`\n  Reading ${folder}`);
  for (const [name, spec] of Object.entries(SHEETS)) {
    const file = path.join(folder, spec.file);
    if (!fs.existsSync(file)) continue;
    const rows = readTable(file);
    catalog[spec.key] = buildRecords(rows, spec.fields, stamp, problems, spec.file);
    say(`    ${spec.file.padEnd(13)} ${String(catalog[spec.key].length).padStart(4)} ${name}`);
  }
  const pinFile = path.join(folder, PIN_SHEET.file);
  if (fs.existsSync(pinFile)) {
    pins = buildRecords(readTable(pinFile), PIN_SHEET.fields, stamp, problems, PIN_SHEET.file, true)
      .map((p) => ({ ...p, createdAt: stamp, author: p.author || opt("author", "Anonymous") }));
    say(`    ${PIN_SHEET.file.padEnd(13)} ${String(pins.length).padStart(4)} pins`);
  }
}

/* ---- other people's packs ---- */
for (const file of mergeFiles) {
  if (!fs.existsSync(file)) die(`No such file to merge: ${file}`);
  const text = fs.readFileSync(file, "utf8");
  let raw = null;
  try { raw = JSON.parse(text); } catch { die(`${file} is not valid JSON.`); }

  if (raw && raw.kind === "pins") {
    const v = validatePinSet(text);
    if (!v.ok) { report(path.basename(file), v); die(`${file} is not a pack this app would accept.`); }
    for (const w of v.warnings) say(`    warning  ${path.basename(file)}: ${w}`);
    /* Same rule as the app: union on id, newer updatedAt wins. */
    const before = pins.length;
    const m = mergeList(pins, v.pins);
    pins = m.list;
    say(`  Merged ${path.basename(file)}  +${m.added} new, ${m.updated} updated, ${m.unchanged} already had (pins ${before} -> ${pins.length})`);
    continue;
  }

  const v = validateImport(text);
  if (!v.ok) { report(path.basename(file), v); die(`${file} is not a pack this app would accept.`); }
  for (const w of v.warnings) say(`    warning  ${path.basename(file)}: ${w}`);
  const parts = [];
  for (const key of Object.keys(catalog)) {
    const m = mergeList(catalog[key], (v.data.catalog || {})[key] || []);
    catalog[key] = m.list;
    if (m.added || m.updated) parts.push(`${key} +${m.added}/${m.updated}`);
  }
  say(`  Merged ${path.basename(file)}  ${parts.join("  ") || "(nothing new)"}`);
}

for (const p of problems) console.error(`  ! ${p}`);

/* ---------------- write, but only if the app would read it ---------------- */

fs.mkdirSync(outDir, { recursive: true });
const meta = {
  id,
  title,
  description: opt("description", ""),
  author: opt("author", ""),
  contributedAt: iso,
};
const written = [];

const catalogCount = Object.values(catalog).reduce((n, l) => n + l.length, 0);
if (catalogCount) {
  /* "locations" is a pack whose catalog is only spots. The app treats the two
     the same; the directory lists them apart. */
  const onlySpots = catalog.spots.length === catalogCount;
  const pack = {
    app: APP_ID,
    schema: SCHEMA_VERSION,
    kind: "pack",
    exportedAt: iso,
    note: opt("note", ""),
    meta: { ...meta, type: onlySpots ? "locations" : "pack" },
    catalog,
  };
  const text = JSON.stringify(pack, null, 2);
  const v = validateImport(text);
  say("");
  if (!report(`${id}.json`, v)) die("Refusing to write a file the app would reject.");
  const file = path.join(outDir, `${id}.json`);
  fs.writeFileSync(file, text);
  written.push([file, `${catalogCount} records`, onlySpots ? "locations/" : "packs/"]);
}

if (pins.length) {
  const set = {
    app: APP_ID,
    schema: 1,
    kind: "pins",
    exportedAt: iso,
    note: opt("note", ""),
    meta: { ...meta, id: `${id}-pins`, type: "pins" },
    pins,
  };
  const text = JSON.stringify(set, null, 2);
  const v = validatePinSet(text);
  say("");
  if (!report(`${id}-pins.json`, v)) die("Refusing to write a pin set the app would reject.");
  const file = path.join(outDir, `${id}-pins.json`);
  fs.writeFileSync(file, text);
  written.push([file, `${pins.length} pins`, "pins/"]);
}

if (!written.length) die("Nothing to write — no usable rows in the spreadsheet and nothing merged.");

say("");
for (const [file, what, dest] of written) {
  say(`  wrote ${file}  (${what})`);
  say(`        commit it to ${dest} in the packs repo`);
}
say("");
