/* Asserts every id a tactic references actually exists.

   The Tactics table is nothing but links. A typo in one of them does not throw
   and does not warn - it renders as a row that quietly is not there, which is
   how you end up shipping a walleye page that never mentions bottom bouncing.
   So the ids get scraped out of the real sources and checked, rather than
   trusted. */

import fs from "node:fs";
import { checkTactics, TACTICS, TACTIC_STYLES, tacticsFor, RIG_LABELS } from "../src/tactics.js";

const app = fs.readFileSync("src/App.jsx", "utf8");
const hookart = fs.readFileSync("src/hookart.jsx", "utf8");
const lines = app.split("\n");

/* Scrape ids out of a top-level const array by finding where it starts and
   where the next top-level const begins. Crude, but it reads the actual file
   rather than a list I typed out here, which is the entire point. */
function idsOf(name) {
  const start = lines.findIndex((l) => l.startsWith(`const ${name} =`));
  if (start < 0) throw new Error(`${name} not found in App.jsx`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^const [A-Z_]+ ?=/.test(lines[i])) { end = i; break; }
  }
  return [...lines.slice(start, end).join("\n").matchAll(/\bid: "([a-z0-9-]+)"/g)].map((m) => m[1]);
}

const species = idsOf("SPECIES");
const baits = idsOf("BAITS");
const knots = idsOf("KNOTS");
const rigs = [...hookart.slice(hookart.indexOf("const RIGS = {")).matchAll(/^ {2}([a-zA-Z0-9_]+): \(/gm)].map((m) => m[1]);

for (const [n, v] of Object.entries({ species, baits, knots, rigs })) {
  if (!v.length) { console.error(`ABORTED: scraped zero ${n} ids - the scraper is broken, not the data.`); process.exit(1); }
}

console.log(`sources   ${species.length} species · ${baits.length} baits · ${knots.length} knots · ${rigs.length} rigs`);
console.log(`tactics   ${TACTICS.length} across ${TACTIC_STYLES.length} styles`);

/* A rig with no label renders as its raw id - "slipfloat" in a picker the
   owner is meant to hand to strangers. The drawings carry no names of their
   own, so nothing else would catch a new rig being added without one. */
const unlabelled = rigs.filter((r) => !RIG_LABELS[r]);
const orphanLabels = Object.keys(RIG_LABELS).filter((r) => !rigs.includes(r));

const problems = checkTactics({ species, baits, knots, rigs });
for (const r of unlabelled) problems.push(`rig "${r}" has no entry in RIG_LABELS — it would show as its raw id`);
for (const r of orphanLabels) problems.push(`RIG_LABELS has "${r}" but no such rig exists in hookart.jsx`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}

/* Coverage is the other half. A link that resolves is not much use if half the
   species have no tactic pointing at them - that is a dead end on a record
   page, and the owner asked specifically for two-way navigation everywhere. */
const orphanSpecies = species.filter((s) => !tacticsFor("species", s).length);
const orphanBaits = baits.filter((b) => !tacticsFor("bait", b).length);
console.log(`\nall references resolve`);
console.log(`coverage  species ${species.length - orphanSpecies.length}/${species.length} · baits ${baits.length - orphanBaits.length}/${baits.length}`);
if (orphanSpecies.length) console.log(`  species with no tactic: ${orphanSpecies.join(" ")}`);
if (orphanBaits.length) console.log(`  baits with no tactic:   ${orphanBaits.join(" ")}`);

for (const s of TACTIC_STYLES) {
  const t = TACTICS.filter((x) => x.style === s.id);
  console.log(`  ${s.id.padEnd(7)} ${String(t.length).padStart(2)}  ${t.map((x) => x.id).join(", ")}`);
}
