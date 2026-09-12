/* Runs tools/result-check.mjs as part of the suite.

   Two failure shapes, both of which this project's own conventions invite.

   THE WRAPPER READ AS THE PAYLOAD. Every function here returns
   { ok, ... } rather than throwing, which is a good rule and a trap:
   capOnePerCatch did `for (const p of all)` where `all` was the
   `{ ok, photos }` wrapper, so it threw "all is not iterable" on its first
   line. Every load, for its entire life.

   THE SILENT CATCH. The call site was `PH.capOnePerCatch().catch(() => {})`,
   so that TypeError was discarded and nobody could have known the photo cap
   had never once run. Fire-and-forget is the right call for an optional
   tidy-up; saying nothing at all was never the intention, and the two got
   conflated. Four of them now log.
*/
import { spawnSync } from "node:child_process";

console.log("\n=== SCAN 33: result wrappers and silent catches ===\n");

const r = spawnSync(process.execPath, ["tools/result-check.mjs"], { encoding: "utf8" });
process.stdout.write(r.stdout || "");
if (r.stderr) process.stderr.write(r.stderr);

/* The tool prints rather than exits non-zero, so the verdict is read off its
   summary line - and a missing summary is itself a failure, not a pass. */
const out = r.stdout || "";
const m = out.match(/(\d+) wrapper misuse[s]?, (\d+) silent catch(?:es)?/);
let pass = 0, fail = 0;
if (!m) {
  fail++;
  console.log("  FAIL  the tool printed no summary line — it did not run properly");
} else {
  const [, misuse, silent] = m.map(Number);
  if (Number(misuse) === 0) { pass++; console.log("  PASS  no result wrapper is used as its own payload"); }
  else { fail++; console.log(`  FAIL  ${misuse} result wrapper(s) used as a payload — see above`); }
  if (Number(silent) === 0) { pass++; console.log("  PASS  no rejection is discarded without a word"); }
  else { fail++; console.log(`  FAIL  ${silent} silent catch(es) — a discarded rejection is a bug nobody can find`); }
}

console.log(`\n=== RESULTS RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
