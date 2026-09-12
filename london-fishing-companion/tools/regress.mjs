#!/usr/bin/env node
/* ============================================================
   regress.mjs - do the checks still catch the bugs they were written for?

     node tools/regress.mjs

   NOT in the test suite, deliberately: it rebuilds the bundle a dozen times
   and takes minutes. Run it after changing a checker, or before a release,
   or whenever a tool has been quiet for a suspiciously long time.

   WHY

   Twelve real defects have been found in this project, and for each one a
   check now exists. A check that has quietly stopped working is worse than no
   check: it reports clean and nobody looks again. So each bug is reintroduced
   into a COPY of the tree, the relevant check is run against it, and the
   check must fail. Then the copy is thrown away.

   Nothing here touches the real source files - every edit is made to a copy
   in a temp directory, which is deleted at the end.
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "creel-regress-"));

/* Copy what the checks read. node_modules is symlinked rather than copied. */
for (const d of ["src", "tests", "tools", "map"]) {
  fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
}
for (const f of ["app.js", "sw.js", "package.json", "index.html", "manifest.webmanifest"]) {
  if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
}
fs.mkdirSync(path.join(tmp, "standalone"), { recursive: true });
if (fs.existsSync(path.join(ROOT, "standalone/Creel.html"))) {
  fs.copyFileSync(path.join(ROOT, "standalone/Creel.html"), path.join(tmp, "standalone/Creel.html"));
}
try { fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules"), "junction"); }
catch { fs.cpSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules"), { recursive: true }); }

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

const read = (rel) => fs.readFileSync(path.join(tmp, rel), "utf8");
const write = (rel, s) => fs.writeFileSync(path.join(tmp, rel), s);
const run = (rel) => {
  const r = spawnSync(process.execPath, [rel], { cwd: tmp, encoding: "utf8", timeout: 180000 });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
};
const rebuild = () => run("tools/build.mjs");

/* Break something, run a check, expect it to fail, put it back. */
const BUGS = [];
const bug = (name, file, from, to, checks, opts = {}) =>
  BUGS.push({ name, file, from, to, checks, needsBuild: opts.needsBuild !== false });

/* ---------------- the twelve ---------------- */

bug("SpeciesDetail loses its regs prop (white screen on every fish)",
  "src/App.jsx",
  "onOpenTactic, onOpenSpot, regs = regsOf(HAVE_REGS) }) {",
  "onOpenTactic, onOpenSpot }) {",
  ["tools/scope-check.mjs", "tests/test-sheets.mjs"]);

bug("MapPanel calls setPinMsg without declaring it",
  "src/App.jsx",
  "  const [pinMsg, setPinMsg] = useState(null);",
  "",
  ["tools/scope-check.mjs"]);

bug("a prop is passed that the component does not accept",
  "src/App.jsx",
  "        <SpotsScreen spots={allSpots} allSpecies={allSpecies} region={region} regs={regs}",
  "        <SpotsScreen spots={allSpots} allSpecies={allSpecies} region={region} regs={regs} onAdd={() => {}}",
  ["tools/props-check.mjs"]);

bug("white icons on the accent again (2.09:1 in dark)",
  "src/App.jsx",
  "  --on-accent:#12211A;\n  --on-brass:#23180A;",
  "  --on-accent:#F1F4EF;\n  --on-brass:#23180A;",
  ["tools/icon-contrast.mjs"], { needsBuild: false });

bug("the photo cap iterates its result wrapper",
  "src/photos.js",
  "  const r = await allPhotos();\n  if (!r.ok) return 0;\n  const all = r.photos || [];",
  "  const all = await allPhotos();",
  ["tools/result-check.mjs", "tests/test-results.mjs", "tests/test-photos.mjs"], { needsBuild: false });

bug("a rejection is discarded without a word",
  "src/App.jsx",
  '        .catch((e) => console.error("background sync push failed", e));',
  "        .catch(() => {});",
  ["tools/result-check.mjs", "tests/test-results.mjs"], { needsBuild: false });

bug("clamp lets NaN through and the rating prints NaN%",
  "src/odds.js",
  "const clamp = (v, lo, hi) => {\n  const n = Number(v);\n  if (!Number.isFinite(n)) return lo;\n  return Math.min(hi, Math.max(lo, n));\n};",
  "const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));",
  ["tests/test-edges.mjs"], { needsBuild: false });

bug("resolveFavourites throws on a non-string entry",
  "src/favourites.js",
  '    if (typeof ref !== "string") continue;\n    const at = ref.indexOf(":");',
  '    const at = ref.indexOf(":");',
  ["tests/test-edges.mjs"], { needsBuild: false });

bug("a pill prints a bare id when the lookup misses",
  "src/App.jsx",
  "    const shown = (ids || []).filter((id) => !list || list.some((x) => x.id === id));",
  "    const shown = ids || [];",
  ["tests/test-matrix.mjs"]);

bug("the bass opener stops landing on a Saturday",
  "src/App.jsx",
  "  bass: (y) => [[nthWeekday(y, 5, SAT, 4), D(y, 10, 30)]],",
  "  bass: (y) => [[nthWeekday(y, 5, 4, 4), D(y, 10, 30)]],",
  ["tests/test-dates.mjs"], { needsBuild: false });

bug("an unknown export kind falls through to a full log again",
  "src/portability.js",
  "  if (kind !== KIND.FULL) return null;",
  "",
  ["tests/test-roundtrip.mjs"], { needsBuild: false });

bug("a spot pack loses its region tag",
  "map/langley-bc-spots.json",
  '"region": "langley-bc",\n      "unverified": true,\n      "id": "bc-derbyreach"',
  '"region": "windsor-on",\n      "unverified": true,\n      "id": "bc-derbyreach"',
  ["tests/test-spot-packs.mjs", "tests/test-refs.mjs"], { needsBuild: false });

/* ---------------- run them ---------------- */
console.log(`\n=== PASS 3: ${BUGS.length} known bugs, reintroduced ===\n`);

for (const b of BUGS) {
  const original = read(b.file);
  if (original.split(b.from).length !== 2) {
    chk(`[setup] "${b.name}" — the anchor still exists`, false,
        `found ${original.split(b.from).length - 1} occurrences`);
    continue;
  }
  write(b.file, original.replace(b.from, b.to));
  if (b.needsBuild) rebuild();

  const caughtBy = [];
  for (const c of b.checks) {
    const r = run(c);
    if (r.code !== 0) caughtBy.push(path.basename(c));
  }
  chk(`${b.name}`, caughtBy.length > 0,
      caughtBy.length ? "caught by " + caughtBy.join(", ") : "NOT CAUGHT by " + b.checks.map((x) => path.basename(x)).join(", "));

  write(b.file, original);
  if (b.needsBuild) rebuild();
}

/* And with everything restored, the same checks must all pass again - or the
   restore is what is broken rather than the code. */
console.log("\n-- restored --");
rebuild();
for (const c of ["tools/scope-check.mjs", "tools/props-check.mjs", "tools/icon-contrast.mjs",
                 "tools/dead-code.mjs", "tools/result-check.mjs"]) {
  const r = run(c);
  chk(`${path.basename(c)} is clean again`, r.code === 0, r.out.split("\n").slice(-4).join(" ").slice(0, 100));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
