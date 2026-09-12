/* Runs tools/props-check.mjs as part of the suite.

   The recurring failure in this project is not a crash. It is something that
   works, something else that quietly stops pointing at it, and nothing that
   fails - the stats screen reachable from nowhere, AppearancePanel nested
   inside an unreachable branch, StatsScreen orphaned by a card that was
   removed. A prop that is passed and not accepted is the same shape: the
   caller believes it is configuring something, the component never receives
   it, and there is no error either way.

   Three were found the first time this ran. BarList took a `unit` nobody had
   ever passed, so every bar in the stats screen printed a bare number from a
   parameter that looked configurable. The dashboard asked SpotsScreen to add
   a spot after SpotsScreen stopped accepting the handler. And GuideScreen was
   still being handed onOpenRecord after the parameter was removed.
*/
import { spawnSync } from "node:child_process";

console.log("\n=== SCAN 27: props handshake ===\n");

const r = spawnSync(process.execPath, ["tools/props-check.mjs"], { encoding: "utf8" });
process.stdout.write(r.stdout || "");
if (r.stderr) process.stderr.write(r.stderr);

const clean = r.status === 0;
console.log(clean
  ? "  PASS  every prop passed is accepted, and every prop accepted is passed\n"
  : "  FAIL  see above\n");
console.log(`=== PROPS RESULT: ${clean ? 1 : 0} passed, ${clean ? 0 : 1} failed ===\n`);
process.exit(clean ? 0 : 1);
