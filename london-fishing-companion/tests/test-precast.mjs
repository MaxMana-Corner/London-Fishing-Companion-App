/* SCAN 37: the pre-cast wizard's engine.
 *
 * This is the one feature in the app that gives ADVICE rather than
 * information. Everything else says what a lure is; this says which one to
 * use. That makes being wrong a different kind of wrong — somebody acts on it
 * — so the engine is a separate module from the screen and the reasoning it
 * prints is required to be the actual cause of the pick rather than a
 * plausible sentence written afterwards.
 *
 * THE TEST THAT MATTERS MOST is "the reasoning matches the pick": if the
 * engine recommends a crankbait to somebody watching bait shower at the
 * surface, the explanation will not mention the bait, and that is how the
 * mis-weighting was caught. It was recommending a crank in exactly that case
 * because "open water" plus "cover water" outvoted the single strongest
 * signal in fishing.
 */
import { PRECAST, recommend, summarise } from "../src/precast.js";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 37: reading the water ===\n");

/* Every bait and tactic id the app ships, so the engine is tested against
   what it will actually be given. */
const BAITS = ["tube", "grub", "senko", "texas", "frog", "spinnerbait", "chatterbait",
  "spinner", "jerkbait", "crank", "shadrap", "popper", "spoon", "jigminnow", "minnow",
  "shiner", "crawler", "worm", "waxworm", "microjig", "corn", "bread", "liver", "cutbait",
  "crayfish", "bugger", "pheasanttail", "hareear", "elkcaddis", "adams", "clouser",
  "eggfly", "flypopper"].map((id) => ({ id }));
const TACTICS = ["trotting", "laying-on", "slip-float", "running-ledger", "drift-bottom",
  "search-cranking", "jig-hopping", "finesse-slow", "fly-nymph", "fly-still-panfish",
  "fly-swing", "fly-dry", "flatline-troll"].map((id) => ({ id }));
const ctx = { baits: BAITS, tactics: TACTICS };

console.log("-- the survey itself --");
{
  chk("there are questions", PRECAST.length >= 8, PRECAST.length);
  chk("every question has a 'not sure'",
      PRECAST.every((q) => q.options.some((o) => o.v === "?")),
      "a wizard that punishes honesty gets lied to");
  chk("every question has a hint", PRECAST.every((q) => q.hint && q.hint.length > 20));
  const ids = PRECAST.map((q) => q.id);
  chk("question ids are unique", new Set(ids).size === ids.length, ids.join(", "));
  for (const q of PRECAST) {
    const vs = q.options.map((o) => o.v);
    if (new Set(vs).size !== vs.length) chk(`"${q.id}" has duplicate option values`, false, vs.join(","));
  }
  chk("no duplicate option values", true);
}

console.log("");
console.log("-- it answers, and the answer is defensible --");
const CASES = [
  { name: "muddy water, wind, wants to cover ground",
    a: { clarity: "muddy", surface: "ripple", cover: "open", depth: "current", bait: "none", plan: "find" },
    expectBait: ["spinnerbait", "chatterbait"], mustSay: /muddy|feel and smell/i },
  { name: "clear, flat, bright, rock, working a spot",
    a: { clarity: "clear", surface: "glass", cover: "rock", depth: "break", light: "bright", plan: "slow" },
    expectBait: ["tube", "senko"], mustSay: /rock|crayfish/i },
  { name: "fish rising to a hatch",
    a: { clarity: "clear", surface: "glass", bugs: "rising", light: "low", depth: "shallow" },
    expectBait: ["adams", "elkcaddis"], mustSay: /rising|surface/i },
  { name: "bait showering, birds working",
    a: { bait: "breaking", birds: "diving", surface: "ripple", cover: "open", plan: "find" },
    expectBait: ["jerkbait", "clouser"], mustSay: /chased at the surface|bait/i },
  { name: "weedy shallow bay at dusk",
    a: { cover: "weed", depth: "shallow", light: "low", clarity: "stain" },
    expectBait: ["spinnerbait", "frog"], mustSay: /weed/i },
  { name: "deep cold lake, nothing showing",
    a: { depth: "deep", bait: "none", surface: "waves", clarity: "clear" },
    expectBait: ["jigminnow", "spoon", "shadrap"], mustSay: /deep|wind/i },
];

for (const c of CASES) {
  const r = recommend(c.a, ctx);
  chk(`${c.name}: recommends something sensible`,
      r && c.expectBait.includes(r.baitId),
      r ? r.baitId + " / " + r.tacticId : "nothing");
  /* THE ONE THAT CAUGHT THE BUG. If the reasoning does not mention the
     strongest observation, the pick was driven by something else. */
  chk(`${c.name}: ...and says why, for the right reason`,
      r && r.why.some((w) => c.mustSay.test(w)),
      r && r.why.length ? r.why[0].slice(0, 70) : "no reasoning");
  chk(`${c.name}: ...and names a tactic`, !!(r && r.tacticId), r && r.tacticId);
}

console.log("");
console.log("-- it never recommends what the region does not have --");
{
  /* A Rawdon phone has no bass lures showing that Rawdon has no bass for, and
     more to the point the bait list is province-filtered. The engine must
     pick from what it is given, not from its own table. */
  const thin = { baits: [{ id: "worm" }, { id: "spinner" }], tactics: [{ id: "trotting" }] };
  const r = recommend({ cover: "rock", clarity: "clear", plan: "slow" }, thin);
  chk("with two baits available it picks one of those two",
      r && ["worm", "spinner"].includes(r.baitId), r && r.baitId);
  /* Trotting a float scores nothing for clear rock water worked slowly, so
     the engine names NO tactic rather than the only one it was handed.
     Recommending a tactic that fits nothing you observed, purely because it
     was the only one in the list, would be worse than staying quiet. */
  chk("...and names no tactic when none of them fits", r && r.tacticId === null,
      r && String(r.tacticId));
  const fits = recommend({ depth: "current", bait: "none" }, { baits: [{ id: "crawler" }], tactics: [{ id: "trotting" }] });
  chk("...but names one when it does fit", fits && fits.tacticId === "trotting", fits && fits.tacticId);

  const none = recommend({ cover: "rock" }, { baits: [], tactics: [] });
  chk("with nothing available it says so rather than inventing one",
      none && none.none === true, JSON.stringify(none));
}

console.log("");
console.log("-- honesty about how much it is resting on --");
{
  chk("no answers is no recommendation", recommend({}, ctx) === null,
      "not a default pick presented as an answer");
  chk("only 'not sure' is no recommendation",
      recommend({ clarity: "?", cover: "?", plan: "?" }, ctx) === null);

  const thin = recommend({ clarity: "clear", plan: "slow" }, ctx);
  chk("two answers is flagged thin", thin && thin.confidence === "thin", thin && thin.confidence);

  const full = {};
  for (const q of PRECAST) full[q.id] = q.options[0].v;
  const all = recommend(full, ctx);
  chk("a full survey is flagged high", all && all.confidence === "high", all && all.confidence);
  chk("...and still only gives three reasons", all && all.why.length <= 3, all && all.why.length,
      "past three it stops being an explanation and becomes a transcript");
  chk("...with no reason repeated", all && new Set(all.why).size === all.why.length);
}

console.log("");
console.log("-- a second choice, and a summary to keep --");
{
  const r = recommend({ clarity: "stain", cover: "weed", plan: "find", light: "low" }, ctx);
  chk("there is a second choice", !!(r && r.secondId), r && r.secondId);
  chk("...and it is not the first one", r && r.secondId !== r.baitId);

  const sum = summarise({ clarity: "muddy", cover: "weed", plan: "find", bugs: "?" });
  chk("a survey summarises to one line", sum.length > 10 && sum.split("·").length >= 3, sum);
  chk("...leaving out what was not answered", !/not sure/i.test(sum), sum);
  chk("an empty survey summarises to nothing", summarise({}) === "");
}

console.log(`\n=== PRECAST RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
