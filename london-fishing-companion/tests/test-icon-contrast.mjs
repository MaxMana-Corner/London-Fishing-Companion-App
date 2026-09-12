/* Runs tools/icon-contrast.mjs as part of the suite.

   tools/contrast-audit.js needs a browser, a person to drive it, and four
   separate runs for the four theme and palette combinations. That is why the
   icon regression sat there: it was never going to be caught by a check
   somebody has to remember to perform four times.

   This one reads the token blocks straight out of the stylesheet, so it costs
   nothing and covers all four combinations every run. It found white glyphs
   at 1.88:1 to 2.87:1 on seven of the nine encyclopedia tiles in dark mode
   and on the Gear tile in light.
*/
import { spawnSync } from "node:child_process";

console.log("\n=== SCAN 26: icon contrast on accent fills ===\n");

const r = spawnSync(process.execPath, ["tools/icon-contrast.mjs"], { encoding: "utf8" });
process.stdout.write(r.stdout || "");
if (r.stderr) process.stderr.write(r.stderr);

const clean = r.status === 0;
console.log(clean
  ? "  PASS  every icon clears 3:1 against its own fill, in all four combinations\n"
  : "  FAIL  see above — a graphic under 3:1 fails WCAG 1.4.11\n");
console.log(`=== ICON CONTRAST RESULT: ${clean ? 1 : 0} passed, ${clean ? 0 : 1} failed ===\n`);
process.exit(clean ? 0 : 1);
