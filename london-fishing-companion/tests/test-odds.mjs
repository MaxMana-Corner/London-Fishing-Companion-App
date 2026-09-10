/* The hook-rate model.

   It is shown as a percentage next to a fish, which people will read as a
   promise whatever the label says. So the parts that stop it over-claiming -
   the closed-season zero, the absent-species zero, and the cap - are the
   assertions that matter most here. */
import { hookRate, hookBand, HOOK_MIN, HOOK_MAX, regionalRate, rankSpecies } from "../src/odds.js";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n-- the two zeroes --");
chk("a closed season is zero, not a low number",
    hookRate({ density: 5, seasonOpen: false, rating: 95, inBestMonths: true }) === 0,
    hookRate({ density: 5, seasonOpen: false, rating: 95, inBestMonths: true }));
chk("a species that is not in the water is zero",
    hookRate({ density: 0, seasonOpen: true, rating: 95, inBestMonths: true }) === 0,
    hookRate({ density: 0, seasonOpen: true, rating: 95, inBestMonths: true }));
chk("perfect conditions cannot rescue an absent fish",
    hookRate({ density: 0, rating: 100, inBestMonths: true }) === 0);

console.log("\n-- the cap --");
const top = hookRate({ density: 5, seasonOpen: true, rating: 100, inBestMonths: true });
chk("the best possible case is capped below 90", top <= HOOK_MAX && top === HOOK_MAX, top);
chk("a present fish is never rounded away to zero",
    hookRate({ density: 1, seasonOpen: true, rating: 0, inBestMonths: false }) >= HOOK_MIN,
    hookRate({ density: 1, seasonOpen: true, rating: 0, inBestMonths: false }));

console.log("\n-- the factors actually move it --");
const bare = { density: 3, seasonOpen: true, rating: 50, inBestMonths: false };
chk("more of the fish raises it",
    hookRate({ ...bare, density: 5 }) > hookRate({ ...bare, density: 2 }),
    `${hookRate({ ...bare, density: 5 })} vs ${hookRate({ ...bare, density: 2 })}`);
chk("better conditions raise it",
    hookRate({ ...bare, rating: 90 }) > hookRate({ ...bare, rating: 20 }),
    `${hookRate({ ...bare, rating: 90 })} vs ${hookRate({ ...bare, rating: 20 })}`);
chk("being in the species' months raises it",
    hookRate({ ...bare, inBestMonths: true }) > hookRate({ ...bare, inBestMonths: false }),
    `${hookRate({ ...bare, inBestMonths: true })} vs ${hookRate({ ...bare, inBestMonths: false })}`);
chk("density outweighs conditions — a scarce fish in perfect weather stays below an abundant one in poor weather",
    hookRate({ density: 1, rating: 100, inBestMonths: true }) < hookRate({ density: 5, rating: 10, inBestMonths: false }),
    `${hookRate({ density: 1, rating: 100, inBestMonths: true })} vs ${hookRate({ density: 5, rating: 10, inBestMonths: false })}`);

console.log("\n-- always a sane number --");
let bad = null;
for (const d of [0, 1, 2, 3, 4, 5]) {
  for (const r of [0, 25, 50, 75, 100]) {
    for (const m of [true, false]) {
      for (const o of [true, false]) {
        const v = hookRate({ density: d, rating: r, inBestMonths: m, seasonOpen: o });
        if (!Number.isInteger(v) || v < 0 || v > HOOK_MAX) bad = { d, r, m, o, v };
      }
    }
  }
}
chk("every combination gives a whole number between 0 and the cap", bad === null, bad && JSON.stringify(bad));
chk("garbage input does not throw or produce NaN",
    hookRate() === 0 && hookRate({ density: "x", rating: null }) === 0,
    `${hookRate()} / ${hookRate({ density: "x", rating: null })}`);

console.log("\n-- bands --");
chk("zero is its own band, not a low one", hookBand(0) === "shut", hookBand(0));
chk("60 and up is good", hookBand(60) === "good" && hookBand(88) === "good");
chk("35 to 59 is fair", hookBand(35) === "fair" && hookBand(59) === "fair");
chk("below 35 is slim", hookBand(34) === "slim" && hookBand(3) === "slim");

console.log("\n-- across a region --");
/* The bug this section exists for: scoring only the single best spot made
   every species on the London set come out identical, because they all have
   a 4 or a 5 somewhere in twelve waters. Fifteen fish all reading 66% in a
   picker tells you nothing. */
const wide = [];
for (let i = 0; i < 12; i++) wide.push({ id: "w" + i, name: "W" + i, density: { spread: 4 }, best: [] });
wide.push({ id: "p", name: "Pond", density: { local: 5 }, best: [] });

const spread = regionalRate("spread", wide, { rating: 50 });
const local = regionalRate("local", wide, { rating: 50 });
chk("a widespread fish beats one abundant in a single water",
    spread.rate > local.rate, `spread ${spread.rate} vs local ${local.rate}`);
chk("the single-water fish still names that water as its best spot",
    local.spot.id === "p", local.spot.id);
chk("holders counts the waters that hold it",
    spread.holders === 12 && local.holders === 1, `${spread.holders} / ${local.holders}`);
chk("a species in no water returns null", regionalRate("nope", wide, {}) === null);

/* The month factor comes off the SPOT, because species carry no month data
   at all - which is why the first version contributed nothing from it. */
const seasonal = [{ id: "a", name: "A", density: { f: 4 }, best: [6] }];
chk("a spot in its good month scores above the same spot out of it",
    regionalRate("f", seasonal, { month: 6 }).rate > regionalRate("f", seasonal, { month: 1 }).rate,
    `${regionalRate("f", seasonal, { month: 6 }).rate} vs ${regionalRate("f", seasonal, { month: 1 }).rate}`);

console.log("\n-- ranking --");
const ranked = rankSpecies(
  [{ id: "spread", name: "Spread" }, { id: "local", name: "Local" }, { id: "none", name: "Absent" }],
  wide, { rating: 60, isOpen: (id) => id !== "local", month: 1 });
chk("a closed species reads zero", ranked.find((r) => r.species.id === "local").rate === 0);
chk("an absent species reads zero", ranked.find((r) => r.species.id === "none").rate === 0);
chk("the list is sorted high to low",
    ranked.every((r, i) => i === 0 || ranked[i - 1].rate >= r.rate), ranked.map((r) => r.rate).join(","));
chk("the ranking spreads out rather than flattening",
    new Set(rankSpecies([{ id: "spread", name: "S" }, { id: "local", name: "L" }], wide, { rating: 60, month: 1 }).map((r) => r.rate)).size === 2,
    "distinct rates");

console.log(`\n=== ODDS RESULT: ${pass} passed, ${fail} failed ===\n`);
if (fail) process.exit(1);
