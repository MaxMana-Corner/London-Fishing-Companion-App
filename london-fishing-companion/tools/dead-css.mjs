/* CSS FOR THINGS THAT ARE NOT THERE ANY MORE.
       node tools/dead-css.mjs

   Every class styled in the CSS block, checked against every class that can
   actually reach the DOM. Dead CSS is quieter than dead JS — nothing renders
   wrong — so it accumulates through restructures and then lies to the next
   reader, who finds `.wxtile` and goes looking for a weather tile that has
   not existed for weeks. This found nineteen on its first run: a whole
   weather tile, a nearest-spot row, stat cards, and the plural `.encytiles`
   container left over from the encyclopedia rebuild.

   THIS TOOL'S FIRST VERSION DELETED LIVE CSS.

   It searched the JSX for each class name as a word and reported forty dead
   classes — including every `.r-good`, `.b-fair`, `.t-prime` and `.k-moon`,
   which are as live as anything in the app. They appear nowhere as a literal
   because the app writes

       className={"readtile r-" + r.tone}

   and builds the modifier at runtime. A class reaches the DOM three ways, and
   a checker that only knows the first will confidently delete the other two:

       written whole      className="readtile"
       concatenated       className={"readtile r-" + tone}
       interpolated       className={`readtile r-${tone}`}

   So this reports and never edits, and it treats any class beginning with a
   prefix that appears before a `+` or a `${` as reachable. That is deliberately
   generous: a false "clean" costs a few dead rules, a false "dead" costs a
   working feature. If you add a fourth way to build a class name, teach it
   here before trusting the output. */
import fs from "fs";

const s = fs.readFileSync("src/App.jsx", "utf8");
const i = s.indexOf("const CSS =");
const st = s.indexOf("`", i);
const en = s.indexOf("`", st + 1);
if (i < 0 || st < 0 || en < 0) {
  console.log("ABORT: could not find the CSS template literal — the scanner is broken, not the file.");
  process.exit(1);
}

/* Comments blanked to spaces so offsets still line up: a class named inside a
   comment is documentation, not a rule. */
const css = s.slice(st + 1, en).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const jsx = s.slice(0, st) + s.slice(en);

const prefixes = [...new Set([
  ...[...jsx.matchAll(/"[^"]*?([a-z][a-z0-9_-]*-)"\s*\+/g)].map((m) => m[1]),
  ...[...jsx.matchAll(/([a-z][a-z0-9_-]*-)\$\{/g)].map((m) => m[1]),
])];

const defined = [...new Set([...css.matchAll(/\.([a-z][a-z0-9_-]*)/g)].map((m) => m[1]))];

/* A scanner that finds nothing passes by doing nothing. */
if (defined.length < 100) {
  console.log(`ABORT: only ${defined.length} classes found in the CSS block — the scanner is broken.`);
  process.exit(1);
}

const dead = defined.filter((c) =>
  !new RegExp("(?<![-\\w])" + c + "(?![-\\w])").test(jsx) && !prefixes.some((p) => c.startsWith(p)));

/* Where each dead class is styled, so the finding is actionable. */
const lineOf = (c) => {
  const at = css.search(new RegExp("\\." + c + "(?![-\\w])"));
  return at < 0 ? "?" : s.slice(0, st + 1 + at).split("\n").length;
};

console.log(`${defined.length} classes styled · ${prefixes.length} runtime prefixes (${prefixes.join(" ")})`);
if (!dead.length) {
  console.log("\n  clean — every styled class can reach the DOM.\n");
  process.exit(0);
}
console.log(`\n${dead.length} styled but unreachable:`);
for (const c of dead) console.log(`  src/App.jsx:${lineOf(c)}  .${c}`);
console.log("\nCheck each one by hand before deleting. See this file's header for why.\n");
process.exit(1);
