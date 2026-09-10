/* Cross-reference integrity for the catalogue.

   Records point at each other by id: a tactic names species, baits, rigs and
   knots; gear and handling name anything via see: [[kind, id], ...]. A bad id
   renders a pill with no text rather than failing, which is the same
   silent-omission shape as CATALOG_KEYS counting five of six lists.

   It has earned its place twice already. Adding four fly tactics by hand
   introduced a rigs: ["wire"] that does not exist, and the first gear set
   contained THIRTEEN invented ids - cover-water, hop-jig, still-catfish,
   t-safety - every one of them plausible and none of them real. */
import fs from "fs";

const app = fs.readFileSync("src/App.jsx", "utf8");
const t = fs.readFileSync("src/tactics.js", "utf8");

const between = (src, a, b) => {
  const i = src.indexOf(a);
  if (i < 0) return "";
  const j = src.indexOf(b, i);
  return src.slice(i, j < 0 ? undefined : j);
};

const END = "\n];";
const rigLabels = [...between(t, "export const RIG_LABELS", "};").matchAll(/^\s{2}([a-z0-9]+):/gm)].map((m) => m[1]);
const knotIds = [...between(app, "const KNOTS = [", END).matchAll(/id: "([a-z0-9-]+)", name:/g)].map((m) => m[1]);
const speciesIds = [...between(app, "const SPECIES = [", END).matchAll(/id: "([a-z]+)", name:/g)].map((m) => m[1]);
const baitIds = [...between(app, "const BAITS = [", END).matchAll(/id: "([a-z0-9]+)", name:/g)].map((m) => m[1]);
const tipIds = [...between(app, "const TIPS = [", END).matchAll(/id: "([a-z0-9-]+)", cat:/g)].map((m) => m[1]);
const hookIds = [...between(app, "const HOOK_GUIDE = [", END).matchAll(/art: "([a-z0-9]+)"/g)].map((m) => m[1]);
const tacticIds = [...t.matchAll(/^    id: "([a-z0-9-]+)", name:/gm)].map((m) => m[1]);
const handlingIds = [...between(app, "const HANDLING = [", END).matchAll(/id: "([a-z]+)", title:/g)].map((m) => m[1]);
const gearIds = [...between(app, "const GEAR = [", END).matchAll(/id: "([a-z0-9-]+)", name:/g)].map((m) => m[1]);

let pass = 0, fail = 0;
const bad = (msg) => { fail++; console.log("  FAIL  " + msg); };

/* Every catalogue must be non-empty, or a silent extraction failure would make
   this whole suite pass by having nothing to check. */
for (const [name, list] of Object.entries({
  rigs: rigLabels, knots: knotIds, species: speciesIds, baits: baitIds,
  tips: tipIds, hooks: hookIds, tactics: tacticIds, handling: handlingIds, gear: gearIds,
})) {
  if (!list.length) bad(`no ${name} were extracted — the parser or the source moved`);
  else { pass++; console.log(`  PASS  found ${list.length} ${name}`); }
}

/* ---------- tactics: rigs, knots, targets, baits ---------- */
{
  let n = 0;
  for (const b of t.split(/\n  \{\n/).slice(1)) {
    const id = (b.match(/id: "([a-z0-9-]+)"/) || [])[1];
    if (!id) continue;
    const grab = (k) => {
      const m = b.match(new RegExp(k + ': \\[([^\\]]*)\\]'));
      return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
    };
    for (const [k, known] of [["rigs", rigLabels], ["knots", knotIds], ["targets", speciesIds], ["baits", baitIds]]) {
      for (const v of grab(k)) {
        n++;
        if (!known.includes(v)) bad(`tactic "${id}" ${k} "${v}" does not exist`);
      }
    }
  }
  pass++;
  console.log(`  PASS  ${n} tactic references resolve`);
}

/* ---------- gear and handling: see: [[kind, id]] ---------- */
{
  const KINDS = {
    species: speciesIds, baits: baitIds, knots: knotIds, tips: tipIds,
    hooks: hookIds, tactics: tacticIds, handling: handlingIds, gear: gearIds,
    regs: ["regs"],
  };
  let n = 0;
  for (const blk of [between(app, "const GEAR = [", END), between(app, "const HANDLING = [", END)]) {
    for (const line of blk.split("\n")) {
      if (!/^\s*see:/.test(line)) continue;
      for (const r of line.matchAll(/\["([a-z]+)",\s*"([a-z0-9-]+)"\]/g)) {
        n++;
        const known = KINDS[r[1]];
        if (!known) bad(`see-also names unknown kind "${r[1]}"`);
        else if (!known.includes(r[2])) bad(`see-also ${r[1]} "${r[2]}" does not exist`);
      }
    }
  }
  if (!n) bad("no see-also references found at all — gear and handling should have them");
  else { pass++; console.log(`  PASS  ${n} see-also references resolve`); }
}

/* ---------- every gear group is real, and every group has members ---------- */
{
  const groups = [...between(app, "const GEAR_GROUPS = [", END).matchAll(/\["([a-z]+)",/g)].map((m) => m[1]);
  const used = [...between(app, "const GEAR = [", END).matchAll(/group: "([a-z]+)"/g)].map((m) => m[1]);
  for (const g of new Set(used)) if (!groups.includes(g)) bad(`gear group "${g}" is not in GEAR_GROUPS`);
  for (const g of groups) if (!used.includes(g)) bad(`GEAR_GROUPS has "${g}" but nothing is in it — it renders as nothing`);
  pass++;
  console.log(`  PASS  ${groups.length} gear groups, all populated`);
}

console.log(`\n=== REFS RESULT: ${pass} passed, ${fail} failed ===\n`);
if (fail) process.exit(1);
