#!/usr/bin/env node
/* ============================================================
   icon-contrast.mjs — contrast for GRAPHICS, not text.

   WHY THIS IS SEPARATE FROM contrast-audit.js

   That tool walks every painted TEXT node in a running page, composites the
   ancestors to find the real background, and applies the size- and
   weight-aware WCAG threshold. It is the right tool and it found a literal
   near-black .prose sitting at 1.22:1 on ten screens.

   It cannot see an icon. The encyclopedia tiles put an SVG path inside a span
   whose background comes from a colour on the record, and the glyph took its
   colour from a literal #fff in the stylesheet. There is no text node, so
   there was nothing for a text audit to measure - and in dark mode seven of
   the nine category icons were between 2.09 and 2.82 against their own fill,
   under the 3:1 that WCAG 1.4.11 asks of a meaningful graphic. The Rules
   tile, white on --ink2, was the worst at 2.09.

   It also runs without a browser, because it reads the token blocks out of
   the stylesheet rather than the computed styles out of a page. That means it
   can check all four theme x palette combinations in one pass, which is four
   manual runs of the text audit.

   WHAT IT CHECKS

   Every accent an icon fill can take, against the foreground that icon will
   actually use, in light-deep, light-orchid, dark-deep and dark-orchid.

     node tools/icon-contrast.mjs
   ============================================================ */

import fs from "node:fs";

const SRC = "src/App.jsx";
const NEED = 3;       /* WCAG 1.4.11, non-text contrast */

const src = fs.readFileSync(SRC, "utf8");

const lum = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/* Token values from one CSS block. */
const block = (needle) => {
  const i = src.indexOf(needle);
  if (i < 0) return null;
  const out = {};
  for (const m of src.slice(i, src.indexOf("\n}", i)).matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{3,6})/g)) {
    out[m[1]] = m[2];
  }
  return out;
};

const lightRoot = block("\n:root{");
const darkRoot = block(':root[data-theme="dark"] {');
const lightOrchid = block(':root[data-palette="orchid"]');
const darkOrchid = block(':root[data-theme="dark"][data-palette="orchid"]');

if (!lightRoot || !darkRoot) {
  console.error("  Could not read the token blocks out of " + SRC + " — the stylesheet moved.");
  process.exit(1);
}

const COMBOS = {
  "light · deep": { ...lightRoot },
  "light · orchid": { ...lightRoot, ...(lightOrchid || {}) },
  "dark · deep": { ...lightRoot, ...darkRoot },
  "dark · orchid": { ...lightRoot, ...darkRoot, ...(darkOrchid || {}) },
};

/* ---------------- what actually gets drawn ----------------

   Read from the source rather than listed here, so a new category or a
   changed accent is picked up instead of quietly skipped. A category may
   override the foreground with its own `ink`; otherwise it is --on-accent. */
const cats = [...src.matchAll(
  /\{\s*id: "([a-z]+)", label: "([^"]+)",[^}]*?colour: "var\(--([a-z0-9-]+)\)",(?:\s*ink: "var\(--([a-z0-9-]+)\)",)?/g)]
  .map((m) => ({ id: m[1], label: m[2], bg: m[3], fg: m[4] || "on-accent" }));

if (cats.length < 5) {
  console.error(`  Only ${cats.length} categories parsed — the record shape moved, so this ` +
    "check would pass by having almost nothing to check.");
  process.exit(1);
}

/* The nearby list: two fixed fills, same flipping foreground. */
const nearby = [...src.matchAll(/\.nearicon\.([a-z]+)\{background:var\(--([a-z0-9-]+)\)\}/g)]
  .map((m) => ({ id: "nearby " + m[1], label: "nearby " + m[1], bg: m[2], fg: "on-accent" }));

const targets = [...cats, ...nearby];

let fails = 0, checked = 0;
for (const [combo, tok] of Object.entries(COMBOS)) {
  const rows = [];
  for (const t of targets) {
    const bg = tok[t.bg], fg = tok[t.fg];
    if (!bg) { console.log(`  ${combo}: --${t.bg} is not defined`); fails++; continue; }
    if (!fg) { console.log(`  ${combo}: --${t.fg} is not defined`); fails++; continue; }
    const r = ratio(fg, bg);
    checked++;
    if (r < NEED) { fails++; rows.push(`    FAIL  ${t.label.padEnd(20)} --${t.fg} on --${t.bg}  ${r.toFixed(2)}:1`); }
  }
  if (rows.length) {
    console.log(`\n  ${combo}`);
    rows.forEach((r) => console.log(r));
  }
}

console.log(fails
  ? `\n  ${fails} of ${checked} icon fills are under ${NEED}:1.\n`
  : `\n  clean — all ${checked} icon-on-accent pairs clear ${NEED}:1 across four theme and palette combinations.\n`);
process.exit(fails ? 1 : 0);
