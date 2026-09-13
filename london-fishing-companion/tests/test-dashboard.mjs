/* SCAN 35: the dashboard's height budget, as CSS invariants.
 *
 * The dashboard is deliberately a single non-scrolling page, which is the
 * owner's call and a good one. It was implemented as a max-height, and a
 * max-height with no overflow rule does not compress content - it HIDES it.
 * Reported as "writing in the expanded season gets cut off", and that is
 * exactly what it was.
 *
 * The fix had two halves and the first one alone did nothing:
 *
 *   1. overflow-y on the column, so exceeding the budget scrolls.
 *   2. flex:0 0 auto on the cards, so they keep their natural height. Without
 *      this they SHRANK under the budget instead and their own contents
 *      spilled out of a box that was not scrollable, so the column's
 *      scrollHeight never grew and there was nothing to scroll.
 *
 * Measured in a browser at 320x568 with the season open, before and after:
 *   before: scrollHeight 430 === clientHeight 430, last line at y=496 vs a
 *           container ending at y=473 — drawn nowhere, reachable never
 *   after:  scrollHeight 876 vs clientHeight 430, last line fully visible
 *
 * JSDOM does no layout, so this cannot be a render test. It asserts the two
 * CSS facts the fix rests on, which is what would actually be lost if someone
 * simplified the rules later.
 */
import fs from "fs";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 35: the dashboard height budget ===\n");

const src = fs.readFileSync("src/App.jsx", "utf8");
/* The stylesheet is a template literal inside the source. Whitespace is
   stripped so the assertions do not depend on how the rules are wrapped. */
const css = src.replace(/\s+/g, "");

console.log("-- the budget --");
chk("the dashboard column still has a height budget",
    /\.lfc\.dashpad\{[^}]*max-height:calc\(100vh/.test(css),
    "the no-scroll dashboard is the owner's call and must not be lost by accident");

console.log("");
console.log("-- and cannot clip --");
chk("the column scrolls rather than hiding what overflows",
    /\.lfc\.dashpad\{[^}]*overflow-y:auto/.test(css),
    "a max-height with no overflow rule hides content, it does not compress it");

chk("its cards keep their natural height",
    /\.dashpad>\*\{flex:00auto\}/.test(css),
    "flex children shrink by default, and a shrunken card spills its contents " +
    "out of a box that is not scrollable — which is why overflow-y alone fixed nothing");

chk("the favourites strip is still the one thing that takes what is left",
    /\.dashfavs\{flex:11auto;min-height:0;overflow-y:auto/.test(css),
    "declared after the blanket rule, so it wins");

console.log("");
console.log("-- the cards that were asked to match --");
chk("where-you-are is a card, not a bare line",
    /\.placecard\{display:flex/.test(css) && !/className="nearline"/.test(src),
    "the owner asked for it to match the conditions card");
chk("...with the same shell as the card under it",
    /\.placecard\{[^}]*background:var\(--card\)/.test(css) &&
    /\.placecard\{[^}]*border-radius:11px/.test(css));
chk("...and the green strip", /\.placecard\{[^}]*border-left:3pxsolidvar\(--moss\)/.test(css));

console.log("");
console.log("-- the readings the owner asked for --");
for (const [what, re] of [
  ["barometer", /label:"Barometer"/],
  ["wind", /label:"Wind"/],
  ["light", /label:"Light"/],
]) {
  chk(`${what} is a reading on the conditions card`, re.test(src.replace(/\s+/g, "")));
}
chk("light needs no weather fetch",
    /st\.sunrise&&st\.sunset/.test(css),
    "it comes from the sun times, so it shows on a phone that has never fetched weather");
chk("the strip fits three across on a 320px phone",
    /\.readstrip\{[^}]*grid-template-columns:repeat\(3,1fr\)/.test(css));

console.log("");
console.log("-- the banner icon follows Options --");
chk("the dashboard mark is not hard-coded",
    !/<AppMarkmark="creel"size=\{24\}/.test(css) && /dashmark"><AppMarkmark=\{mark\}/.test(css),
    "it was pinned to the creel, so choosing the fish changed every icon but this one");

console.log(`\n=== DASHBOARD RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
