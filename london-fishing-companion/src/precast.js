/* precast.js — read the water, then decide what to tie on.
   ============================================================

   WHAT THIS IS FOR. Somebody stands on a bank and has to pick one lure out of
   a box of thirty. The guide in this app can already tell them what every
   lure does; what it could not do was look at the water in front of them and
   say "that one, because of this". That is a different question and it is the
   one people actually have.

   THE OWNER'S CALL WAS ONE ANSWER WITH THE REASONING SHOWN, not a ranked
   shortlist: three options is not an answer when you are standing on a bank
   deciding what to tie on. So this commits — a lure and a tactic — and then
   says which observations drove it, so you can disagree with the reasoning
   rather than just with the result. A second choice is offered underneath,
   because the first one having been tried for twenty minutes is itself a
   condition the wizard cannot see.

   HOW IT SCORES. Every answer contributes weight to bait ids and tactic ids,
   and carries the sentence that explains that weight. The recommendation is
   the highest-scoring bait that exists in the region you are in, and the
   reasons printed are the answers that contributed most to it — so the
   explanation is genuinely the cause rather than a plausible story written
   afterwards. An observation that pushed nothing is not mentioned.

   WHAT IT DOES NOT DO. It has no idea what is in the water today, it cannot
   see the fish, and it does not know that the far bank has been hammered all
   week. It is a structured way of looking at water and a defensible first
   choice, which is what a beginner lacks and what an experienced angler does
   in their head without noticing. It says so on screen.
   ============================================================ */

/* ---------------- the survey ----------------

   Nine questions, ordered the way somebody actually looks at water: the
   surface first because it is what you see from the car, then what is in it,
   then what is happening on it, then what you intend to do about it.

   Every question has a "not sure" that scores nothing rather than scoring an
   average. A wizard that punishes honesty gets lied to. */
export const PRECAST = [
  {
    id: "clarity", q: "How clear is the water?",
    hint: "Look at the depth a pale stone disappears at, not at the colour from the bank.",
    options: [
      { v: "clear", l: "Clear — you can see the bottom in a metre or more" },
      { v: "stain", l: "Stained — tea-coloured, bottom gone by half a metre" },
      { v: "muddy", l: "Muddy — you cannot see your boots in the shallows" },
      { v: "?", l: "Not sure" },
    ],
  },
  {
    id: "surface", q: "What is the surface doing?",
    hint: "Wind is the single thing most likely to decide where you should stand.",
    options: [
      { v: "glass", l: "Dead flat" },
      { v: "ripple", l: "A ripple or light chop" },
      { v: "waves", l: "Whitecaps — hard going" },
      { v: "?", l: "Not sure" },
    ],
  },
  {
    id: "cover", q: "What is in the water where you can reach?",
    hint: "The thing fish are holding against. If there are several, pick the one nearest you.",
    options: [
      { v: "weed", l: "Weed, pads or reeds" },
      { v: "wood", l: "Timber — laydowns, stumps, docks" },
      { v: "rock", l: "Rock, rubble or a hard bottom" },
      { v: "open", l: "Nothing — open water or a bare bottom" },
      { v: "?", l: "Not sure" },
    ],
  },
  {
    id: "depth", q: "What is the water doing underfoot?",
    hint: "Where the bottom changes is where fish feed. Flat water all the way out is the hardest kind to fish.",
    options: [
      { v: "shallow", l: "Shallow flat — knee to waist all the way out" },
      { v: "break", l: "A break — it shelves off within casting range" },
      { v: "deep", l: "Deep — no bottom you can reach or see" },
      { v: "current", l: "Moving water with seams and slack" },
      { v: "?", l: "Not sure" },
    ],
  },
  {
    id: "bait", q: "Can you see bait fish?",
    hint: "Look into the margins for fry, and at the surface further out for anything flicking.",
    options: [
      { v: "breaking", l: "Yes — being chased, showering at the surface" },
      { v: "some", l: "Some about, nothing panicking" },
      { v: "none", l: "None that I can see" },
      { v: "?", l: "Not sure" },
    ],
  },
  {
    id: "bugs", q: "Are there insects on or over the water?",
    hint: "And are fish rising to them — a rise is a dimple, not a splash.",
    options: [
      { v: "rising", l: "Yes, and fish are rising to them" },
      { v: "bugs", l: "Insects about, no rises" },
      { v: "none", l: "Nothing moving" },
      { v: "?", l: "Not sure" },
    ],
  },
  {
    id: "birds", q: "What are the birds doing?",
    hint: "Birds fish for a living and they are better at it than you. Worth thirty seconds of looking.",
    options: [
      { v: "diving", l: "Terns, gulls or mergansers working the water" },
      { v: "wading", l: "Herons or kingfishers on the margins" },
      { v: "nothing", l: "Nothing much" },
      { v: "?", l: "Not sure" },
    ],
  },
  {
    id: "light", q: "What is the light like?",
    hint: "Low light moves fish shallow and makes them bolder. It is worth more than most people give it.",
    options: [
      { v: "low", l: "Low — dawn, dusk, or heavy overcast" },
      { v: "bright", l: "Bright sun, high in the sky" },
      { v: "flat", l: "Flat grey daylight" },
      { v: "?", l: "Not sure" },
    ],
  },
  {
    id: "plan", q: "What do you want to do?",
    hint: "This is the only question about you rather than the water, and it changes the answer more than any of them.",
    options: [
      { v: "find", l: "Cover water and find them" },
      { v: "slow", l: "Slow down and work a spot properly" },
      { v: "?", l: "No preference" },
    ],
  },
];

/* ---------------- the weights ----------------

   b: bait ids, t: tactic ids, why: the sentence, and rank: how strongly this
   observation should be allowed to speak. A bait scoring 3 from one strong
   answer beats one scoring 1 from three weak ones, which is right - clarity
   and cover decide more than what the birds are doing. */
const W = {
  clarity: {
    clear: { b: { senko: 3, tube: 3, jerkbait: 2, microjig: 2, grub: 2, adams: 2, pheasanttail: 2 },
             t: { "finesse-slow": 3, "fly-dry": 2, "jig-hopping": 1 },
             why: "Clear water means they can see it properly, so a natural bait fished slowly beats anything loud." },
    stain: { b: { spinnerbait: 3, chatterbait: 3, crank: 2, spinner: 2, grub: 2 },
             t: { "search-cranking": 3, "jig-hopping": 1 },
             why: "Stained water shortens how far they can see, so give them something with flash and vibration to find." },
    muddy: { b: { chatterbait: 4, spinnerbait: 3, texas: 2, crawler: 2, liver: 2 },
             t: { "search-cranking": 2, "running-ledger": 2, "drift-bottom": 2 },
             why: "In muddy water sight barely helps them — they will find a bait by feel and smell before they see it." },
  },
  surface: {
    glass: { b: { senko: 2, microjig: 2, adams: 2, popper: 1 },
             t: { "finesse-slow": 3, "fly-dry": 2 },
             why: "Dead flat water shows them everything, including your line — go lighter and quieter than feels necessary." },
    ripple: { b: { spinnerbait: 2, crank: 2, jerkbait: 2, shadrap: 1 },
              t: { "search-cranking": 2, "flatline-troll": 1 },
              why: "A ripple breaks up the light and makes fish bolder. This is the surface you want." },
    waves: { b: { spoon: 2, shadrap: 2, jigminnow: 2, crawler: 1 },
             t: { "jig-hopping": 2, "drift-bottom": 2 },
             why: "In a hard wind, fish the sheltered bank rather than fighting it, and use enough weight to stay in touch." },
  },
  cover: {
    weed: { b: { frog: 3, texas: 3, spinnerbait: 3, chatterbait: 2, senko: 1 },
            t: { "search-cranking": 2 },
            why: "Weed means weedless. Anything with an exposed treble will spend the day collecting salad." },
    wood: { b: { senko: 3, texas: 3, tube: 2, crank: 1 },
            t: { "finesse-slow": 3 },
            why: "Timber holds fish tight to it, so the cast has to land against the wood and fall beside it." },
    rock: { b: { tube: 4, crayfish: 3, crank: 2, grub: 2, jig: 1 },
            t: { "jig-hopping": 3 },
            why: "Rock means crayfish, and a bait bumping along the bottom is imitating the thing they are actually eating." },
    open: { b: { crank: 3, shadrap: 3, spinner: 2, spinnerbait: 2, clouser: 1 },
            t: { "search-cranking": 3, "flatline-troll": 2 },
            why: "With no cover to aim at, the job is covering water until you find them rather than working one spot." },
  },
  depth: {
    shallow: { b: { popper: 3, frog: 2, senko: 2, spinnerbait: 2, flypopper: 2 },
               t: { "search-cranking": 1, "fly-still-panfish": 2 },
               why: "Shallow water means they are catchable but spooky — stay back and cast further than you want to." },
    break: { b: { tube: 3, jigminnow: 3, shadrap: 2, grub: 2, crank: 2 },
             t: { "jig-hopping": 3, "slip-float": 2 },
             why: "The break is the edge they feed along. Fish it parallel rather than casting across it." },
    deep: { b: { jigminnow: 3, spoon: 3, shadrap: 2, minnow: 2 },
            t: { "slip-float": 3, "flatline-troll": 2, "drift-bottom": 2 },
            why: "Deep water needs the bait taken down to them — nothing on or near the surface is in the game." },
    current: { b: { jigminnow: 2, grub: 2, tube: 2, crawler: 2, spinner: 2, eggfly: 2 },
               t: { trotting: 3, "drift-bottom": 3, "fly-swing": 2 },
               why: "In current, the bait has to move at the speed of the water. Anything dragging against it looks wrong." },
  },
  bait: {
    breaking: { b: { jerkbait: 5, clouser: 4, spinner: 3, shadrap: 3, spoon: 2, crank: 1 },
                t: { "search-cranking": 3, "fly-swing": 2 },
                why: "Bait being chased at the surface is the clearest signal there is — match the size and get it in front of them now." },
    some: { b: { jerkbait: 2, minnow: 2, jigminnow: 2, shadrap: 1 },
            t: { "slip-float": 1, "search-cranking": 1 },
            why: "Bait fish about means something is eating them, or is about to." },
    none: { b: { crawler: 2, tube: 2, crayfish: 2, worm: 2, texas: 1 },
            t: { "drift-bottom": 2, "jig-hopping": 2, "running-ledger": 2 },
            why: "With no bait fish showing, they are more likely feeding on the bottom than chasing anything." },
  },
  bugs: {
    rising: { b: { adams: 4, elkcaddis: 4, flypopper: 2, microjig: 1 },
              t: { "fly-dry": 4, "fly-still-panfish": 2 },
              why: "Rising fish are eating off the surface. Nothing sunk will beat something floating while that lasts." },
    bugs: { b: { pheasanttail: 3, hareear: 3, microjig: 2, waxworm: 1 },
            t: { "fly-nymph": 3 },
            why: "Insects about with no rises usually means they are taking them under the surface rather than on it." },
    none: { b: {}, t: {}, why: null },
  },
  birds: {
    diving: { b: { jerkbait: 2, spinner: 2, clouser: 2, spoon: 1 },
              t: { "search-cranking": 2 },
              why: "Working birds are on bait fish, and so is everything else. Fish under them." },
    wading: { b: { worm: 1, microjig: 1, senko: 1, popper: 1 },
              t: { "fly-still-panfish": 1, "finesse-slow": 1 },
              why: "Herons and kingfishers work the shallow margins, which tells you there are small fish in close." },
    nothing: { b: {}, t: {}, why: null },
  },
  light: {
    low: { b: { popper: 3, spinnerbait: 2, jerkbait: 2, jigminnow: 2, frog: 1 },
           t: { "search-cranking": 2 },
           why: "Low light is the best hour of the day. They move shallow, they lose their caution, and they chase." },
    bright: { b: { tube: 2, senko: 2, texas: 2, microjig: 2, dropshot: 1 },
              t: { "finesse-slow": 3, "jig-hopping": 2 },
              why: "Bright sun pushes them into shade and off the feed — go smaller, slower, and closer to cover." },
    flat: { b: { crank: 1, spinnerbait: 1, grub: 1 }, t: { "search-cranking": 1 },
            why: null },
  },
  plan: {
    find: { b: { spinnerbait: 3, crank: 2, shadrap: 2, spinner: 2, chatterbait: 2 },
            t: { "search-cranking": 4, "flatline-troll": 1 },
            why: "You said you want to find them, so the bait has to cover water — keep moving and do not work one spot." },
    slow: { b: { senko: 3, tube: 3, microjig: 2, crawler: 2, worm: 2 },
            t: { "finesse-slow": 4, "jig-hopping": 2, "laying-on": 1 },
            why: "You said you want to work a spot, so slow down properly — most people think they are fishing slowly and are not." },
  },
};

/* ---------------- the recommendation ---------------- */

const EMPTY = { b: {}, t: {}, why: null };

/* `baits` and `tactics` are the lists the app is showing for this region, so
   a recommendation can never name something that is not in the guide the
   person is holding. */
export function recommend(answers = {}, { baits = [], tactics = [] } = {}) {
  const bScore = new Map(), tScore = new Map();
  /* Which answers contributed to which bait, so the reasons given are the
     actual cause rather than a story written after the fact. */
  const bFrom = new Map();
  const answered = [];

  for (const q of PRECAST) {
    const v = answers[q.id];
    if (!v || v === "?") continue;
    const w = (W[q.id] || {})[v] || EMPTY;
    answered.push(q.id);
    for (const [id, n] of Object.entries(w.b || {})) {
      bScore.set(id, (bScore.get(id) || 0) + n);
      if (!bFrom.has(id)) bFrom.set(id, []);
      if (w.why) bFrom.get(id).push({ q: q.id, n, why: w.why });
    }
    for (const [id, n] of Object.entries(w.t || {})) tScore.set(id, (tScore.get(id) || 0) + n);
  }

  if (!answered.length) return null;

  const have = new Set(baits.map((b) => b.id));
  const haveT = new Set(tactics.map((t) => t.id));

  const rank = (score, present) => [...score.entries()]
    .filter(([id]) => present.has(id))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const bRank = rank(bScore, have);
  const tRank = rank(tScore, haveT);
  if (!bRank.length) return { answered: answered.length, none: true };

  const pick = bRank[0];
  const second = bRank[1] || null;
  const tactic = tRank.length ? tRank[0] : null;

  /* The reasons, strongest first, deduplicated — several answers can push the
     same bait for the same underlying reason and saying it twice reads as
     padding. Capped at three: past that it stops being an explanation and
     starts being a transcript. */
  const seen = new Set();
  const why = (bFrom.get(pick[0]) || [])
    .sort((a, b) => b.n - a.n)
    .filter((r) => (seen.has(r.why) ? false : (seen.add(r.why), true)))
    .slice(0, 3)
    .map((r) => r.why);

  return {
    answered: answered.length,
    baitId: pick[0], score: pick[1],
    tacticId: tactic ? tactic[0] : null,
    secondId: second ? second[0] : null,
    why,
    /* How much of the survey was filled in. A recommendation off two answers
       is a guess wearing a lab coat, and the screen says so rather than
       presenting it with the same confidence as one off nine. */
    confidence: answered.length >= 7 ? "high" : answered.length >= 4 ? "fair" : "thin",
  };
}

/* A one-line summary for the trip record and the spot, so an attached survey
   reads without having to re-render the whole wizard. */
export function summarise(answers = {}) {
  const parts = [];
  for (const q of PRECAST) {
    const v = answers[q.id];
    if (!v || v === "?") continue;
    const opt = q.options.find((o) => o.v === v);
    if (opt) parts.push(opt.l.split("—")[0].trim());
  }
  return parts.join(" · ");
}
