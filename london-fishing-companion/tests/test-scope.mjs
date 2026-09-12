/* Runs tools/scope-check.mjs as part of the suite.

   The tool is in tools/ because it is useful on its own while working. It is
   here as well because the bug it looks for - a component reading a name that
   nothing declares - shipped in committed code for six waves with the suite
   green, and a check you have to remember to run is a check that stops being
   run.

   Both defects it has found so far were the same shape and neither failed any
   other test: SpeciesDetail read `zone`, which whited out the app on every
   tap on a fish, and MapPanel called `setMsg`, which meant saving a dropped
   pin wrote the pin and then threw on the line that was meant to confirm it.
*/
import { spawnSync } from "node:child_process";

console.log("\n=== SCAN 25: undeclared identifiers ===\n");

const r = spawnSync(process.execPath, ["tools/scope-check.mjs"], { encoding: "utf8" });
process.stdout.write(r.stdout || "");
if (r.stderr) process.stderr.write(r.stderr);

const clean = r.status === 0;
console.log(clean
  ? "  PASS  no component reads a name that nothing declares\n"
  : "  FAIL  see above — each one is a ReferenceError waiting for somebody to open that screen\n");
console.log(`=== SCOPE RESULT: ${clean ? 1 : 0} passed, ${clean ? 0 : 1} failed ===\n`);
process.exit(clean ? 0 : 1);
