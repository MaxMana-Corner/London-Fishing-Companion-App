/* Tactics - how you actually fish, as opposed to what you fish with.

   The rest of the encyclopedia answers "what is this thing". Species, baits,
   knots and rigs are all nouns. A beginner holding a rod does not have a noun
   problem, they have a verb problem: they own a jig and a river and no idea
   what to do with either. This section is the verbs.

   Every tactic points at records that already exist by id - species from
   SPECIES, baits from BAITS, knots from KNOTS, rigs from the RIGS drawings in
   hookart.jsx. Nothing here invents a reference. The links are what make the
   encyclopedia navigable in both directions: a tactic lists the fish it takes,
   and a fish can list the tactics that take it, from this one table.

   checkTactics() below asserts every reference resolves. Run it in the build,
   not just in your head - a dangling id renders as a silently missing row,
   which is the same class of bug as an empty map layer. */

export const TACTIC_STYLES = [
  { id: "float",  name: "Float",     blurb: "A bait suspended under a float, at a depth you choose." },
  { id: "ledger", name: "Ledgering", blurb: "Bait on the bottom, weight on the line, waiting them out." },
  { id: "lure",   name: "Lure",      blurb: "Something artificial, moving, that you make look alive." },
  { id: "fly",    name: "Fly",       blurb: "Casting the line rather than the lure. Lighter than it looks." },
  { id: "ice",    name: "Ice",       blurb: "Through a hole, in winter, straight down." },
  { id: "troll",  name: "Trolling",  blurb: "Dragging lures behind a moving boat to find scattered fish." },
];

/* The rigs are drawings in hookart.jsx, keyed by id and carrying no display
   name of their own - fine while the only thing that rendered them was the
   drawing itself, not fine the moment a tactic has to say which rig it uses in
   a sentence or offer it in a picker. Named here rather than in the component
   so the wizard, the record page and the pack tool all say the same words. */
export const RIG_LABELS = {
  float: "Fixed float",
  slipfloat: "Slip float",
  running: "Running ledger",
  weightless: "Weightless",
  splitshot: "Split shot",
  swivel: "Swivel",
  leader: "Leader or trace",
};

/* What each knot is for, as ids. rigs are the RIGS keys in hookart.jsx and
   baits are BAITS ids - checked by tools/check-tactics.mjs like everything
   else here, so a typo fails the build rather than rendering an empty row. */
export const KNOT_USES = {
  clinch:  { rigs: ["float", "splitshot", "swivel"],
             baits: ["worm", "crawler", "corn", "minnow"],
             note: "The everyday knot for mono and fluorocarbon - a hook, a swivel, a small lure." },
  palomar: { rigs: ["weightless", "splitshot", "leader"],
             baits: ["tube", "grub", "senko", "texas", "crank", "spoon"],
             note: "Braid to anything. The strongest simple knot, and the one to use on a jig or a lure." },
  uni:     { rigs: ["slipfloat", "running", "swivel", "leader"],
             baits: ["shiner", "minnow", "liver", "cutbait"],
             note: "One knot for hooks, spool arbors and joining two lines. Learn it if you learn one." },
  loop:    { rigs: ["weightless", "leader"],
             baits: ["popper", "frog", "jerkbait", "crank", "spinnerbait"],
             note: "Leaves the lure free to swing. Worth it on anything whose action you would otherwise choke." },
  surgeon: { rigs: ["leader"],
             baits: [],
             note: "Joining two lines of different thickness - main line to a leader." },
  hair:    { rigs: ["running", "swivel"],
             baits: ["corn", "bread"],
             note: "The bait hangs off the hook rather than sitting on it. Carp gear." },
};

/* Which knots suit a given rig or bait - the same table read backwards, so
   the two directions cannot disagree. */
export function knotsFor(kind, id) {
  const field = kind === "rig" ? "rigs" : kind === "bait" ? "baits" : null;
  if (!field) return [];
  return Object.entries(KNOT_USES)
    .filter(([, v]) => (v[field] || []).includes(id))
    .map(([k]) => k);
}

export const DIFFICULTIES = ["Start here", "Worth learning", "Advanced"];

export const TACTICS = [
  /* ---------------------------------------------------------------- FLOAT */
  {
    id: "trotting", name: "Trotting a float", style: "float",
    gist: "Let a float run downstream at the speed of the current, with the bait just off the bottom.",
    water: "Rivers with steady, walking-pace flow", season: "April to November", diff: "Start here",
    targets: ["smb", "rock", "sucker", "carp", "wall", "perch"],
    baits: ["worm", "crawler", "corn", "bread"],
    rigs: ["float", "splitshot"], knots: ["uni", "clinch"],
    gear: "A long rod helps more than an expensive one - it lets you keep line off the water. 6 lb line, a 4 g float, size 10 hook.",
    how: [
      "Find the depth first. Set the float over-deep, trot it through, and shorten until it stops dragging under.",
      "Cast slightly upstream and let the float settle before it reaches you.",
      "Let it travel at the speed of the surface, no faster. If the float is outrunning the foam and leaves, your line is pulling it.",
      "Hold a little line back every few seconds so the bait swings up and then falls again. Most takes happen on that fall.",
      "Strike downstream, not up - you are pulling the hook into the corner of the mouth rather than out of it.",
    ],
    tell: "The float does not just vanish. It lifts, holds under, or slides sideways against the current. Any of those is a fish.",
    fail: "Fishing too shallow. The bait should be ticking bottom occasionally; if you never touch, you are fishing above them.",
  },
  {
    id: "laying-on", name: "Laying on in still water", style: "float",
    gist: "Float set deeper than the water, so the bait rests on the bottom and the float sits at an angle.",
    water: "Ponds, canals, slow backwaters", season: "Year round, best May to September", diff: "Start here",
    targets: ["bluegill", "pump", "crappie", "perch", "carp", "sucker"],
    baits: ["worm", "corn", "bread", "waxworm"],
    rigs: ["float", "splitshot"], knots: ["clinch", "uni"],
    gear: "Light float, two or three small shot, size 12 to 16 hook. This is the cheapest way to catch fish there is.",
    how: [
      "Plumb the depth with a heavy shot on the hook until the float sits flat, then shorten by an inch or two so only the tip shows.",
      "Feed a small pinch of bait in the same spot every few minutes. Little and often beats one big helping.",
      "Cast to the same place each time. You are building a pile of interest, not searching.",
      "Sit on your hands. The bites will come to you.",
    ],
    tell: "The float lifts flat and lies down - that is a fish taking the bait and lifting the shot. Strike on the lift, not after it goes under.",
    fail: "Moving every ten minutes. This tactic works by drawing fish to you, and it needs twenty minutes before it starts.",
  },
  {
    id: "slip-float", name: "Slip float for deep water", style: "float",
    gist: "A float that slides on the line, so you can fish twelve feet deep with a rod you can still cast.",
    water: "Deep holes, harbour walls, drop-offs, off piers", season: "Year round", diff: "Worth learning",
    targets: ["wall", "crappie", "perch", "wbass", "pike"],
    baits: ["minnow", "shiner", "microjig", "jigminnow"],
    rigs: ["slipfloat", "swivel"], knots: ["uni", "palomar"],
    gear: "A slip float, a bobber stop, a bead, and a swivel. The stop knot sets the depth and reels through the guides.",
    how: [
      "Thread the stop knot, then the bead, then the float, then tie on a swivel. The bead is what stops the float passing the knot.",
      "Set the stop so the bait sits a foot above whatever the fish are holding on - a weed bed, a ledge, the bottom.",
      "Cast and wait for the float to stand up. It lies flat until the weight has pulled the line through, then cocks.",
      "In current, let it drift the length of the structure, then reel in and repeat rather than dragging it back through.",
    ],
    tell: "A walleye takes a minnow and moves off slowly. Give it three or four seconds before you tighten - striking instantly pulls it away.",
    fail: "No bead. Without it the stop knot jams into the float and you cannot reel in.",
  },

  /* -------------------------------------------------------------- LEDGER */
  {
    id: "running-ledger", name: "Ledgering with a running rig", style: "ledger",
    gist: "Weight sliding freely on the line, so a fish taking the bait feels the hook before it feels the lead.",
    water: "Rivers and lakes, any depth", season: "May to October", diff: "Start here",
    targets: ["carp", "cat", "drum", "sucker", "smb"],
    baits: ["corn", "bread", "worm", "crawler", "liver"],
    rigs: ["running", "swivel"], knots: ["palomar", "hair"],
    gear: "A running lead or feeder above a swivel, a 12 inch hooklength below it. Rod pointed at the bait, line just tight.",
    how: [
      "Cast, let everything settle, then tighten until the line is straight but not pulling the lead.",
      "Put the rod on a rest with the tip low. You are watching the line or the tip, not holding it.",
      "Recast every twenty minutes even if nothing happens - it refreshes the bait and drops more scent in the same spot.",
      "When it goes, it goes properly. Carp and catfish do not nibble a bottom bait.",
    ],
    tell: "The tip pulls round and stays round, or slack line suddenly appears because the fish swam towards you. Both are takes.",
    fail: "A hooklength longer than about 18 inches on a running rig tangles on the cast. Keep it short.",
  },
  {
    id: "night-cats", name: "Still bait for catfish after dark", style: "ledger",
    gist: "Smelly bait on the bottom, in the dark, in the deepest slow water you can reach.",
    water: "River holes below bridges and weirs", season: "June to September, after sunset", diff: "Start here",
    targets: ["cat", "drum"],
    baits: ["liver", "cutbait", "crawler"],
    rigs: ["running", "leader"], knots: ["palomar", "uni"],
    gear: "Heavier than you think - 15 to 20 lb line, a 2/0 to 4/0 hook, and enough lead to hold in the current.",
    how: [
      "Get there in daylight and find the deep slow water. Set up before you need a torch.",
      "Fish two rods if the rules allow it, at different distances, until one of them tells you where the fish are.",
      "Keep the bait fresh. Liver washes out in fifteen minutes and after that you are fishing an empty hook.",
      "Bank the rods properly. A channel cat can take an unsecured rod into the river, and this happens to somebody every summer.",
    ],
    tell: "A slow heavy pull that keeps going. Let it develop for a second, then lean into it - do not snatch.",
    fail: "White light everywhere. Use a red head torch and point it at your hands, not the water.",
  },
  {
    id: "drift-bottom", name: "Drifting bait along the bottom", style: "ledger",
    gist: "Just enough weight to trundle downstream, so the bait moves the way real food moves.",
    water: "Rivers with clean gravel or sand bottom", season: "May to October", diff: "Worth learning",
    targets: ["smb", "wall", "rock", "sucker", "drum"],
    baits: ["crawler", "crayfish", "minnow", "worm"],
    rigs: ["splitshot", "swivel"], knots: ["clinch", "uni"],
    gear: "Two or three split shot 18 inches above the hook. Adjust the shot, not the retrieve.",
    how: [
      "Cast up and across, and follow the line with the rod tip as it comes down.",
      "You want it touching bottom every couple of seconds. Constant contact means too much weight; never touching means too little.",
      "Take one step downstream after every two or three drifts, and work the whole run.",
      "When it stops, it is either a rock or a fish. Lift gently - a rock stays put and a fish moves.",
    ],
    tell: "A tap-tap that is sharper than the rhythm of the bottom. Smallmouth hit a drifted crayfish hard.",
    fail: "Too much lead. The single most common mistake in river fishing, and it kills the presentation stone dead.",
  },

  /* ---------------------------------------------------------------- LURE */
  {
    id: "search-cranking", name: "Covering water to find them", style: "lure",
    gist: "Fan-cast a fast lure across a lot of water until something answers, then slow down and work that spot.",
    water: "Anywhere new to you", season: "May to October", diff: "Start here",
    targets: ["smb", "lmb", "pike", "wall", "wbass"],
    baits: ["crank", "spinnerbait", "chatterbait", "spinner", "shadrap"],
    rigs: ["swivel"], knots: ["loop", "palomar"],
    gear: "One rod, one fast-moving lure, and a willingness to keep walking.",
    how: [
      "Cast in a fan from one bank position - left, centre, right - then move twenty paces and repeat.",
      "Retrieve steadily. You are asking a question, not making a presentation.",
      "The moment you get a follow, a knock or a fish, stop searching and work that spot properly with something slower.",
      "Mark it. That is what the pin drop is for, and it is worth more than the fish you just caught.",
    ],
    tell: "Follows count as information. A fish that tracks the lure and turns away is telling you it is there and that you are going too fast.",
    fail: "Falling in love with one spot. Searching only works if you actually keep moving.",
  },
  {
    id: "jig-hopping", name: "Hopping a jig on the bottom", style: "lure",
    gist: "Lift, let it fall on a semi-slack line, and watch the line rather than the rod.",
    water: "Rocky rivers, drop-offs, bridge pilings", season: "April to November", diff: "Start here",
    targets: ["smb", "wall", "rock", "crappie", "drum", "perch"],
    baits: ["tube", "grub", "jigminnow", "microjig"],
    rigs: ["splitshot"], knots: ["palomar", "clinch"],
    gear: "The lightest head that still reaches bottom. In the Thames that is usually 1/8 oz, heavier below a weir.",
    how: [
      "Cast up at forty-five degrees and let it sink on a controlled line - not slack, not tight.",
      "Lift the rod tip a foot, then lower it and let the jig fall back with the current.",
      "Watch where the line enters the water. Almost every take happens on the fall and you will see it before you feel it.",
      "If you are never ticking bottom, go heavier. If you are constantly snagged, go lighter.",
    ],
    tell: "The line twitches, jumps, or simply stops falling. Reel down until you feel weight and then set the hook.",
    fail: "Waiting to feel the bite. On a falling jig there is nothing to feel - by the time there is, it has gone.",
  },
  {
    id: "topwater-window", name: "Topwater in the first and last hour", style: "lure",
    gist: "A lure on the surface, in low light, over shallow cover. The most exciting bite in fishing.",
    water: "Weedy shallows, pads, calm bays", season: "June to September", diff: "Worth learning",
    targets: ["lmb", "smb", "pike"],
    baits: ["popper", "frog"],
    rigs: ["weightless"], knots: ["loop", "palomar"],
    gear: "A loop knot. It matters more here than anywhere - a tight knot kills the side-to-side action.",
    how: [
      "Be on the water before first light or stay past sunset. The window is about an hour and it is not negotiable.",
      "Cast past the cover and bring the lure to it, not into it.",
      "Work it in bursts with real pauses. The pause is the part that gets bitten.",
      "Wait until you feel the weight of the fish before you strike. Striking at the splash pulls it away.",
    ],
    tell: "You will hear it before you understand it. Count to one, then lean into it.",
    fail: "Setting the hook on sight. Everyone does it once, and it costs the best fish of the morning.",
  },
  {
    id: "finesse-slow", name: "Finesse when they have shut down", style: "lure",
    gist: "Small, light and slow, for bright flat days and pressured water when nothing normal works.",
    water: "Clear ponds and rivers, high sun, no wind", season: "Any time it is tough", diff: "Worth learning",
    targets: ["smb", "lmb", "crappie", "perch", "rock"],
    baits: ["senko", "texas", "microjig", "grub"],
    rigs: ["weightless", "splitshot"], knots: ["palomar", "uni"],
    gear: "Lighter line than you are comfortable with. 6 lb fluorocarbon changes the number of bites on a hard day.",
    how: [
      "Halve the size of whatever you were using and remove as much weight as you can still cast.",
      "Cast to a specific thing - a shadow, a rock, a dock post - not to open water.",
      "Let it sink all the way on a slack line, then do almost nothing. Shake it in place rather than moving it along.",
      "Give each cast twice as long as feels sensible.",
    ],
    tell: "The line moves sideways. That is the whole bite.",
    fail: "Impatience. This tactic is slow by design, and rushing it turns it back into the tactic that was not working.",
  },
  {
    id: "pike-casting", name: "Casting big lures for pike", style: "lure",
    gist: "Large, flashy, and always on a trace. Pike will bite through anything else.",
    water: "Weed edges, bays, slow deep water", season: "Best October to December, and again in spring", diff: "Worth learning",
    targets: ["pike"],
    baits: ["spoon", "spinnerbait", "jerkbait", "crank"],
    rigs: ["leader", "swivel"], knots: ["palomar", "uni"],
    gear: "A wire or heavy fluorocarbon trace, long forceps, and a knotless landing net. Bring all three or do not fish for pike.",
    how: [
      "Work the edges of weed rather than the middle of open water.",
      "Vary the retrieve until something answers - pike often want a pause or a change of direction rather than a change of speed.",
      "Do a figure of eight with the rod tip at the end of every retrieve. A following pike frequently takes right at your feet.",
      "Unhook in the water where you can. Support the fish horizontally and never hold one vertically by the jaw.",
    ],
    tell: "Often no take at all, just sudden heavy weight. Sometimes you see the fish before you feel it.",
    fail: "No trace. You will lose the fish and leave a lure in its mouth, which is the one outcome actually worth avoiding.",
  },

  /* ----------------------------------------------------------------- FLY */
  {
    id: "fly-swing", name: "Swinging a wet fly or streamer", style: "fly",
    gist: "Cast across the current and let the line swing the fly around below you. The current does the work.",
    water: "Rivers with steady flow", season: "April to October", diff: "Worth learning",
    targets: ["trout", "smb", "rock"],
    baits: [], rigs: ["leader"], knots: ["surgeon", "loop"],
    gear: "A 5 or 6 weight outfit covers almost everything in southern Ontario. Nine foot leader.",
    how: [
      "Cast across and slightly downstream, then let the line come under tension and swing.",
      "Follow the line around with the rod tip and let it hang directly below you for a few seconds before recasting.",
      "Take two steps downstream after each swing. You are covering the run methodically, not casting at a spot.",
      "Do not strike upwards. Let the fish turn and tighten on its own, then lift.",
    ],
    tell: "A solid pull mid-swing, or a pluck that does not connect - if you get plucked, swing it through again slower.",
    fail: "Striking like a spin fisherman. On the swing the fish hooks itself, and a hard strike pulls the fly clear.",
  },
  {
    id: "fly-dry", name: "Dry fly to a rising fish", style: "fly",
    gist: "Put a floating fly a little upstream of a fish you have actually seen, and let it drift with no drag.",
    water: "Clear streams and river tails", season: "May to September, evenings", diff: "Advanced",
    targets: ["trout"],
    baits: [], rigs: ["leader"], knots: ["surgeon", "clinch"],
    gear: "Long fine leader - twelve foot down to 5x. The leader matters more than the fly.",
    how: [
      "Watch first. Find one fish rising in a rhythm before you make a single cast.",
      "Get below it and cast upstream so the fly reaches it before the line does.",
      "Throw a little slack into the cast so the fly drifts at the speed of the water. Any wake at all and the fish is done.",
      "If it refuses twice, change the fly or rest the fish. A third refusal usually ends the opportunity.",
    ],
    tell: "The rise happens where your fly is. Pause, then lift smoothly - a fast strike breaks fine tippet.",
    fail: "Drag. A fly moving faster or slower than the surface around it is the single reason most dry fly casts fail.",
  },

  /* ----------------------------------------------------------------- ICE */
  {
    id: "ice-jigging", name: "Jigging a hole", style: "ice",
    gist: "A small bait straight down, lifted and dropped, in a hole you drilled over structure.",
    water: "Hard water on lakes and bays", season: "January to early March", diff: "Worth learning",
    targets: ["perch", "crappie", "bluegill", "wall", "pike"],
    baits: ["microjig", "waxworm", "minnow", "jigminnow"],
    rigs: ["splitshot"], knots: ["palomar", "clinch"],
    gear: "Short rod, 4 lb line, and a spoon or small jig. A flasher earns its money here more than any other piece of tackle.",
    how: [
      "Drill several holes over different depths before you fish any of them, so you can move later without making noise.",
      "Drop to the bottom, then lift a foot. Most winter fish sit just off the bottom, not on it.",
      "Lift sharply and let it fall on a slack line, then hold dead still for several seconds. The hold is what gets bitten.",
      "Give a hole ten minutes. If nothing, move - in winter you go to the fish, they do not come to you.",
    ],
    tell: "The line goes slack early on the drop, or the rod tip loads up on the lift.",
    fail: "Ice thickness taken on somebody else's word. Check it yourself, and never fish new ice alone.",
  },
  {
    id: "tip-up", name: "Tip-ups for pike and walleye", style: "ice",
    gist: "A live bait set at depth on a flagged trap, so you can cover several holes while you jig another.",
    water: "Weed edges and drop-offs on hard water", season: "January to early March", diff: "Worth learning",
    targets: ["pike", "wall"],
    baits: ["shiner", "minnow"],
    rigs: ["leader", "swivel"], knots: ["palomar", "uni"],
    gear: "A wire trace for pike. Check the local limit on how many lines you may set - it varies and it is enforced.",
    how: [
      "Set the bait a foot or two above the weed or the bottom, not down in it.",
      "Spread the tip-ups across different depths until a flag tells you which depth is right, then move the others to match.",
      "When a flag goes, walk over - do not run, and do not grab the line until the spool has stopped turning.",
      "Pull hand over hand, keeping steady pressure. Slack line is how you lose them.",
    ],
    tell: "The flag is only half of it. Watch whether the spool is still turning - a stopped spool means the fish has dropped it.",
    fail: "Striking while the spool is running. Let the fish turn the bait first.",
  },

  /* --------------------------------------------------------------- TROLL */
  {
    id: "flatline-troll", name: "Flatline trolling", style: "troll",
    gist: "Lures behind a slow-moving boat, no downrigger, covering water until you find the depth they are at.",
    water: "Open lake, bays, large rivers", season: "May to October", diff: "Start here",
    targets: ["wall", "pike", "trout", "wbass", "smb"],
    baits: ["crank", "shadrap", "spoon"],
    rigs: ["swivel", "leader"], knots: ["palomar", "loop"],
    gear: "Line counter reels if you have them. If not, count passes of the handle - you need to be able to repeat what worked.",
    how: [
      "Start around 2 mph and let out different amounts of line on each rod so they run at different depths.",
      "Note exactly what was out when a fish takes, then put the other rods on the same setting.",
      "Turn regularly. The lures on the outside speed up and the inside ones slow and drop, and takes often come on the turn.",
      "Follow a contour rather than crossing open water at random.",
    ],
    tell: "The rod loads and stays loaded. Most trolled fish hook themselves.",
    fail: "Every rod set identically. Then you learn nothing when one of them gets a fish.",
  },
  {
    id: "bottom-bounce", name: "Bottom bouncing a worm harness", style: "troll",
    gist: "A weighted arm trundling along the bottom, dragging a spinner and a crawler behind it.",
    water: "Lake flats and river drifts with clean bottom", season: "June to September", diff: "Worth learning",
    targets: ["wall", "drum", "sucker"],
    baits: ["crawler", "worm"],
    rigs: ["swivel", "leader"], knots: ["uni", "palomar"],
    gear: "A bottom bouncer heavy enough to hold roughly a forty-five degree line angle at your trolling speed.",
    how: [
      "Let out line until you feel the bouncer tick bottom, then hold it just there.",
      "Aim for a line angle of about forty-five degrees. Straight down means too slow; way out behind means too little weight.",
      "Go slowly - around 1 mph. The spinner blade needs to turn, not fly.",
      "Drop the rod tip when you feel a take, count to two, then lift into it.",
    ],
    tell: "A distinctly different weight from the rhythm of the bouncer ticking. It feels like the bottom got soft.",
    fail: "Too fast. The harness rides up off the bottom and you troll over the fish all afternoon.",
  },
];

/* Reverse lookup. This is what makes the links bidirectional without storing
   them twice - a species page asks "which tactics list me" rather than keeping
   its own list that can fall out of step with this one. */
export function tacticsFor(kind, id) {
  const field = { species: "targets", bait: "baits", rig: "rigs", knot: "knots" }[kind];
  if (!field) return [];
  return TACTICS.filter((t) => (t[field] || []).includes(id));
}

export function tacticsByStyle(styleId) {
  return TACTICS.filter((t) => t.style === styleId);
}

/* Every id here must resolve against a real record. A dangling reference
   renders as a missing row that nobody notices, and the links are the whole
   point of this table - so this runs as a check, not as a comment. */
export function checkTactics({ species, baits, knots, rigs }) {
  /* The knot cross-reference table is checked here too, so a knot that names
     a rig or bait which does not exist fails the same way a tactic would. */
  const problems = [];
  const styleIds = new Set(TACTIC_STYLES.map((s) => s.id));
  const seen = new Set();

  for (const t of TACTICS) {
    if (seen.has(t.id)) problems.push(`duplicate tactic id "${t.id}"`);
    seen.add(t.id);
    if (!styleIds.has(t.style)) problems.push(`${t.id}: unknown style "${t.style}"`);

    const check = (list, pool, label) => {
      for (const ref of t[list] || []) {
        if (!pool.includes(ref)) problems.push(`${t.id}: ${label} "${ref}" does not exist`);
      }
    };
    check("targets", species, "species");
    check("baits", baits, "bait");
    check("knots", knots, "knot");
    check("rigs", rigs, "rig");

    if (!t.how || t.how.length < 3) problems.push(`${t.id}: needs at least 3 steps`);
    for (const f of ["gist", "tell", "fail", "gear", "water", "season", "diff"]) {
      if (!t[f]) problems.push(`${t.id}: missing ${f}`);
    }
  }

  for (const [kid, use] of Object.entries(KNOT_USES)) {
    if (!knots.includes(kid)) problems.push(`KNOT_USES has "${kid}" but no such knot exists`);
    for (const r of use.rigs || []) if (!rigs.includes(r)) problems.push(`knot ${kid}: rig "${r}" does not exist`);
    for (const b of use.baits || []) if (!baits.includes(b)) problems.push(`knot ${kid}: bait "${b}" does not exist`);
    if (!use.note) problems.push(`knot ${kid}: missing note`);
  }
  for (const k of knots) {
    if (!KNOT_USES[k]) problems.push(`knot "${k}" has no entry in KNOT_USES - it would link to nothing`);
  }

  /* A style with no tactics renders as an empty tile, which reads as broken
     rather than as a section still being written. */
  for (const s of TACTIC_STYLES) {
    if (!TACTICS.some((t) => t.style === s.id)) problems.push(`style "${s.id}" has no tactics`);
  }
  return problems;
}
