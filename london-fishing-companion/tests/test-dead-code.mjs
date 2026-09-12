/* Runs tools/dead-code.mjs as part of the suite.

   The tool existed and had found three real things, and it was in no test and
   always exited 0 - so it only ever helped somebody who remembered to run it
   and then read the output. All three of the failures it covers are silent by
   nature, which is exactly the kind that needs a machine rather than a habit:

     orphaned components   StatsCard went in the dashboard rebuild and it was
                           the only route to StatsScreen, so the whole screen
                           became unreachable without anything failing.

     dead props            a parameter accepted and never read. LicenceCard's
                           `compact` meant the dashboard asked for a small
                           card and got the full one inside a no-scroll
                           budget.

     unreachable branches  AppearancePanel and ShareQR nested inside
                           {group === "backup" && ...}, so the Appearance page
                           rendered nothing at all. Put there by a grouping
                           script of mine.
*/
import { spawnSync } from "node:child_process";

console.log("\n=== SCAN 28: dead code ===\n");

const r = spawnSync(process.execPath, ["tools/dead-code.mjs"], { encoding: "utf8" });
process.stdout.write(r.stdout || "");
if (r.stderr) process.stderr.write(r.stderr);

const clean = r.status === 0;
console.log(clean
  ? "  PASS  no orphaned components, no dead props, no unreachable branches\n"
  : "  FAIL  see above\n");
console.log(`=== DEAD CODE RESULT: ${clean ? 1 : 0} passed, ${clean ? 0 : 1} failed ===\n`);
process.exit(clean ? 0 : 1);
