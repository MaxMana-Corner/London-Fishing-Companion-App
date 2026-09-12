/* Every function in this project returns { ok, ... } rather than throwing.
   capOnePerCatch read the WRAPPER as if it were the payload - `for (const p
   of all)` where `all` was `{ ok, photos }` - and threw on its first line for
   its entire life, silently, because the call site swallowed the error.

   That is a mistake the shape of the convention invites, so this looks for
   every other instance of it: a result awaited from an ok-returning function
   and then used as a collection or a record without going through a field. */
import fs from "node:fs";

/* Comments out first. Without this the scanner matched the comments that
   describe the bug it was written to find - the same way an earlier
   unreachable-code check matched its own note about the Appearance page. */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/([^:])\/\/[^\n]*/g, "$1");

const FILES = [
  "src/photos.js", "src/services.js", "src/community.js",
  "src/portability.js", "src/gdrive.js", "src/map.js", "src/App.jsx",
];

/* Which functions return a wrapper, and what the payload field is called. */
const wrapper = new Map();
for (const f of FILES) {
  const s = strip(fs.readFileSync(f, "utf8"));
  for (const m of s.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
    const start = m.index;
    const next = s.indexOf("\nexport ", start + 10);
    const body = s.slice(start, next < 0 ? undefined : next);
    const ret = body.match(/return\s*\{\s*ok:\s*true\s*,\s*([A-Za-z_$][\w$]*)/);
    if (ret) wrapper.set(m[1], ret[1]);
    else if (/return\s*\{\s*ok:\s*true/.test(body)) wrapper.set(m[1], null);
  }
}
console.log(`\n  ${wrapper.size} functions return an { ok } wrapper\n`);

let suspects = 0;
for (const f of FILES) {
  const s = strip(fs.readFileSync(f, "utf8"));
  for (const [fn, field] of wrapper) {
    const call = new RegExp(
      "(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*await\\s+(?:[A-Za-z_$][\\w$]*\\.)?" + fn + "\\s*\\(",
      "g");
    for (const c of s.matchAll(call)) {
      const v = c[1];
      /* Look at the next few hundred characters - the same statement block. */
      const after = s.slice(c.index, c.index + 800);
      const usedAsCollection = new RegExp(
        "for\\s*\\(\\s*const\\s+\\w+\\s+of\\s+" + v + "\\b" +
        "|\\b" + v + "\\.map\\(" +
        "|\\b" + v + "\\.filter\\(" +
        "|\\b" + v + "\\.forEach\\(" +
        "|\\[\\s*\\.\\.\\." + v + "\\s*\\]" +
        "|\\b" + v + "\\.length\\b").test(after);
      if (!usedAsCollection) continue;
      /* If the wrapper is unpacked anywhere nearby, it is being used right. */
      const unpacked = new RegExp("\\b" + v + "\\.(ok|error" + (field ? "|" + field : "") + ")\\b").test(after);
      if (unpacked) continue;
      const line = s.slice(0, c.index).split("\n").length;
      suspects++;
      console.log(`  ! ${f}:${line}  ${v} = await ${fn}() then used as a collection, ` +
        `never through .${field || "ok"}`);
    }
  }
}

/* And the other half of the same problem: a fire-and-forget promise whose
   rejection is discarded, which is what made the capOnePerCatch bug
   invisible for its whole life. */
console.log("");
let silent = 0;
for (const f of FILES) {
  const s = strip(fs.readFileSync(f, "utf8"));
  for (const m of s.matchAll(/\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/g)) {
    const line = s.slice(0, m.index).split("\n").length;
    const context = s.slice(Math.max(0, m.index - 90), m.index).split("\n").pop().trim();
    silent++;
    console.log(`  . ${f}:${line}  silent catch after: ${context.slice(-70)}`);
  }
}
console.log(`\n  ${suspects} wrapper misuse${suspects === 1 ? "" : "s"}, ${silent} silent catches\n`);

/* IT PRINTED AND ALWAYS EXITED 0.

   The other four tools in this set - scope-check, props-check,
   icon-contrast, dead-code - all exit non-zero on a finding, and this one did
   not. So anything driving them as a group got a pass from this one whatever
   it found, which is exactly the failure mode dead-code.mjs had before it was
   given an exit code: a check that reports and is never read.

   Caught by the regression harness reintroducing a silent catch and being
   told nothing was wrong. */
process.exit(suspects || silent ? 1 : 0);
