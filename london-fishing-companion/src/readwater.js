/* readwater.js — where the fish is, and what to do about it.
   ============================================================

   THE GAP THIS FILLS. The guide could tell you what every lure does and the
   tactics could tell you how to fish each one. Neither could answer the
   question somebody actually has when they arrive: I am looking at THIS, what
   now. A weed edge, a seam, a drop-off, an overhanging tree — each of those is
   a different problem with a different answer, and knowing the answers is most
   of what separates somebody who catches from somebody who casts.

   The pre-cast wizard answers the same question by survey. This answers it by
   recognition, which is the way it is actually learned: you see the thing, you
   remember what it means. The two are deliberately complementary and share
   their vocabulary — every lure named here is a bait id and every tactic a
   tactic id, checked by test-refs like every other cross-reference.

   EACH ENTRY IS FOUR THINGS, in the order somebody needs them:

     see      what you are looking at, described so it can be recognised
     means    why fish are there, which is the part that transfers
     where    the cast, precisely — the commonest mistake is fishing the
              feature instead of the edge of it
     present  how the bait should behave, which is the half of lure fishing
              that nobody writes down

   `present` is the reason this file exists rather than a list of lures. A
   spinnerbait is not a technique. "Slow-rolled so the blade just ticks the
   weed tops" is.
   ============================================================ */

export const WATER_READS = [
  /* ---------------- moving water ---------------- */
  {
    id: "seam", group: "Moving water", name: "A current seam",
    see: "A line on the surface where fast water runs against slow. Often a faint crease, sometimes a line of foam or bubbles holding its shape as it moves downstream.",
    means: "This is the single most reliable thing to find in a river. Fish sit in the slow side and feed on what the fast side brings them — they get a conveyor belt of food for almost no effort, and they will hold there all day.",
    where: "Cast into the FAST side, upstream of where you think the fish is, and let the current swing the bait across the seam. The take almost always comes as it crosses the line. Fishing the slow side only is the commonest mistake here.",
    present: "Nothing dragging. The bait has to move at the speed of the water — anything held against the current looks wrong to a fish that has spent its life watching real food drift past. Mend the line upstream to buy a longer drift.",
    baits: ["jigminnow", "grub", "spinner", "crawler", "eggfly"],
    tactics: ["trotting", "drift-bottom", "fly-swing"],
    also: "In a strong seam the fish are often right at the head of it, where the two flows first split.",
  },
  {
    id: "eddy", group: "Moving water", name: "A back eddy",
    see: "Water turning the wrong way behind an obstruction — a rock, a point, a bridge pier. Foam and leaves collect in it and go round rather than down.",
    means: "A rest stop and a food trap at once. Everything drifting downstream that gets caught in the rotation stays there, so a fish can hold in still water with food circling past it.",
    where: "The EDGE of the rotation, not the middle. Fish sit where the eddy meets the main flow and face into the turn, so a bait entering on the outside and being pulled round is coming at them the right way.",
    present: "Let the eddy do the work. Cast in, leave the bail open enough to follow the rotation, and resist retrieving — an eddy fished with a steady retrieve is an eddy fished wrong.",
    baits: ["jigminnow", "crawler", "tube", "grub"],
    tactics: ["drift-bottom", "jig-hopping", "trotting"],
    also: "Small eddies behind single rocks hold single fish. Big ones behind points hold several.",
  },
  {
    id: "riffle", group: "Moving water", name: "The head and tail of a riffle",
    see: "Shallow broken water running over gravel or rubble, with a deeper pool above it and below it.",
    means: "Riffles are where the oxygen and the insects are. Fish feed in the shallow water at the TAIL of the pool above and hold in the deeper water at the HEAD of the pool below, moving up into the riffle itself in low light.",
    where: "The first two metres of the pool below a riffle is the best water in most small rivers, and it is walked past constantly because it looks featureless. Cast up into the broken water and let it come down into the pool.",
    present: "Short drifts, high rod, and stay in touch. The water is fast and shallow, so a bait that takes ten seconds to sink has already gone past.",
    baits: ["spinner", "grub", "pheasanttail", "hareear", "worm"],
    tactics: ["fly-nymph", "trotting", "drift-bottom"],
    also: "Fish the tail of a pool BEFORE you wade through it, not after. It is the part people ruin first.",
  },
  {
    id: "undercut", group: "Moving water", name: "An undercut bank",
    see: "The outside of a bend where the current has eaten under the bank. Often with roots or grass hanging into the water and no beach at all.",
    means: "Deep water, shade, and a roof. This is the best cover a small river has, and the biggest fish in a stretch is usually under one.",
    where: "Tight, and from downstream. You want the bait to arrive at the undercut before the fish knows you exist, which means approaching from below and casting up along the bank rather than across at it.",
    present: "One good cast beats ten. Get it within a few centimetres of the bank and let it come back with the flow. If the first drift does not produce, move up rather than repeating.",
    baits: ["spinner", "grub", "senko", "crawler", "bugger"],
    tactics: ["drift-bottom", "finesse-slow", "fly-swing"],
    also: "If you can see a fish under an undercut, it has already seen you.",
  },
  {
    id: "confluence", group: "Moving water", name: "Where two waters meet",
    see: "A tributary entering a river, or a river entering a lake. Often a visible colour or temperature line where the two mix.",
    means: "Two of everything — two food supplies, two temperatures, two current speeds — which is why confluences hold more fish than either water does alone. In summer the smaller water is usually colder; in spring it is usually warmer.",
    where: "The mixing line itself, and the slack immediately downstream of the point. Fish sit in the calm and intercept what comes out of the tributary.",
    present: "Work the line rather than either side. A bait that crosses from one water to the other is covering the exact metre that matters.",
    baits: ["spinner", "jerkbait", "jigminnow", "crawler"],
    tactics: ["drift-bottom", "search-cranking", "fly-swing"],
    also: "After rain, a clear tributary entering a muddy river is worth everything. So is the reverse in a drought.",
  },

  /* ---------------- still water ---------------- */
  {
    id: "weededge", group: "Still water", name: "The outside edge of a weed bed",
    see: "Where visible weed stops and open water starts, usually a fairly clean line following a depth contour.",
    means: "A wall with a corridor along it. Prey lives in the weed, predators patrol the edge, and the edge follows the depth change — so it is structure, ambush cover and a travel route at once.",
    where: "PARALLEL to the edge, not across it. Casting from open water into the weed puts the bait in the productive zone for one second per cast; casting along the line keeps it there for the whole retrieve.",
    present: "Just deep enough to tick the tops. A spinnerbait slow-rolled so the blade occasionally catches weed and is pulled free is imitating a fish bolting from cover, and that pull-free is the moment most takes happen.",
    baits: ["spinnerbait", "chatterbait", "texas", "senko", "frog"],
    tactics: ["search-cranking", "finesse-slow"],
    also: "Points and gaps in the weed edge are better than straight sections. Fish the irregularities first.",
  },
  {
    id: "break", group: "Still water", name: "A drop-off",
    see: "Where the bottom falls away. You will feel it before you see it — the lead stops ticking and the line takes longer to go slack.",
    means: "The edge fish feed along. They sit in the deeper water and move up onto the shallow shelf to feed, which means the break is the boundary they cross twice a day.",
    where: "Along the break, working the bait from deep to shallow and back. A cast straight out and retrieved straight in crosses it once; a fan of casts along it stays on it.",
    present: "Bottom contact, always. A jig hopped up the slope is fishing the break; the same jig swum above it is fishing nothing. If you are not occasionally ticking bottom, go heavier.",
    baits: ["tube", "jigminnow", "grub", "shadrap", "crank"],
    tactics: ["jig-hopping", "slip-float", "drift-bottom"],
    also: "The sharper the drop, the tighter the fish hold to it. A gradual slope spreads them out.",
  },
  {
    id: "point", group: "Still water", name: "A point",
    see: "Land running out into the water, usually with the underwater shape continuing further than the visible one.",
    means: "The commonest holding spot in any lake, because it interrupts everything moving along the shore. Fish travelling the bank have to go round it, and fish feeding use the deep water at its end.",
    where: "The END of the underwater point, which is usually further out than the visible land suggests. Fish it from the side rather than standing on it — walking to the tip puts you on top of the best water.",
    present: "Start deep at the tip and work shallower along both sides. The two sides of a point can fish completely differently depending on which way the wind is pushing.",
    baits: ["tube", "crank", "spinnerbait", "jigminnow", "grub"],
    tactics: ["search-cranking", "jig-hopping"],
    also: "A point with weed on one side and rock on the other is two spots, not one.",
  },
  {
    id: "windbank", group: "Still water", name: "The wind-blown bank",
    see: "The shore the wind is pushing into, with waves hitting it and often a line of foam or debris along it.",
    means: "Plankton gets pushed there, bait follows the plankton, predators follow the bait. The uncomfortable bank is almost always the better bank, which is why it is usually empty of anglers.",
    where: "Right in the coloured, churned-up water close in. Fish move much shallower on a wind-blown shore than they would on a calm one, and casting far out over them is the standard mistake.",
    present: "Something with vibration they can feel in the disturbed water, moved steadily. Finesse is wasted here — the fish are hunting rather than inspecting.",
    baits: ["spinnerbait", "chatterbait", "crank", "shadrap", "spoon"],
    tactics: ["search-cranking"],
    also: "Fishing with the wind at your back is easier and usually wrong. The far bank is where the food went.",
  },
  {
    id: "shade", group: "Still water", name: "Overhanging trees and shade lines",
    see: "Branches out over the water, a dock, a moored boat, or the hard shadow edge any of them throws on a bright day.",
    means: "Shade is cover a fish can sit in and see out of. On a bright day the shade line is as real a piece of structure as a rock, and fish hold on the dark side of it looking into the light.",
    where: "The deepest part of the shade, and as far back under the overhang as you can get. The fish holding at the front edge is the small one.",
    present: "A low flat cast that skips under rather than an arc that drops in front. What lands quietly and falls slowly gets eaten; what slaps down clears the swim.",
    baits: ["senko", "texas", "tube", "flypopper", "popper"],
    tactics: ["finesse-slow", "fly-still-panfish"],
    also: "Shade moves through the day. The bank that was dead this morning can be the one at four o'clock.",
  },
  {
    id: "wood", group: "Still water", name: "Laydowns and standing timber",
    see: "A fallen tree in the water, stumps, or timber left standing when a reservoir was flooded.",
    means: "Vertical structure with cover at every depth, which is rare. One laydown can hold fish at the trunk, in the branches and on the bottom around it, and they will be different fish.",
    where: "Work it in sections: the shallow end, the middle, then the deep tip. Most people cast at the visible branches and never fish the trunk where it meets the bottom, which is where the best fish is.",
    present: "Slow and vertical. A weightless bait falling beside the wood is the single most effective presentation there is, and the fall is when it gets taken — watch the line, not the lure.",
    baits: ["senko", "texas", "tube", "jigminnow"],
    tactics: ["finesse-slow", "jig-hopping"],
    also: "Heavier line than feels sporting. A hooked fish goes straight into the branches and light line loses it there.",
  },
  {
    id: "flat", group: "Still water", name: "A featureless flat",
    see: "Shallow water going out a long way with nothing visible in it — no weed, no rock, no change.",
    means: "The hardest water to fish and worth knowing how, because it is what most shorelines are. Fish cross flats rather than living on them, usually in low light and usually on a route.",
    where: "Find the one thing that is different: a slight depression, a single rock, a patch of harder bottom, the edge of a wind lane. On a truly featureless flat, fish it fast and leave.",
    present: "Cover water. This is a searching situation and the correct response is to spend fifteen minutes finding out there is nothing here rather than an hour hoping.",
    baits: ["crank", "spinnerbait", "shadrap", "spinner"],
    tactics: ["search-cranking", "flatline-troll"],
    also: "If a flat produces at all, it produces at dawn and dusk and almost never in between.",
  },

  /* ---------------- what the water is doing ---------------- */
  {
    id: "rising", group: "Conditions", name: "Water that is rising and colouring",
    see: "The level up on yesterday, the colour going brown, debris coming down.",
    means: "Rising water pushes fish to the margins and out of the main flow, and brings food in with it. It is not bad water — it is different water — but it changes where they are completely.",
    where: "The edges, the slack behind anything, and any water that was dry yesterday. Fish move in tight to banks in a flood because that is the only place they can hold.",
    present: "Bigger, louder, slower and closer in. They cannot see far, so give them something they can feel, and put it where they are rather than where they were.",
    baits: ["chatterbait", "spinnerbait", "crawler", "liver", "cutbait"],
    tactics: ["running-ledger", "search-cranking", "drift-bottom"],
    also: "Falling and clearing is better than rising and colouring. If you can choose your day, fish the day after.",
  },
  {
    id: "lowclear", group: "Conditions", name: "Low, clear and bright",
    see: "The river down on its bones, every stone visible, and fish spooking before you get near.",
    means: "The hardest conditions there are. Fish can see everything including you, they are crowded into the few deep spots, and they have been looked at all week.",
    where: "The deepest water you can find and anything with a roof on it. Then approach it from downstream, keep low, and accept that where you stand matters more than what you tie on.",
    present: "Smaller and lighter than feels right, longer leader, and one cast per spot. In this water the presentation IS the tactic — a perfect lure fished clumsily catches nothing.",
    baits: ["microjig", "senko", "adams", "pheasanttail", "worm"],
    tactics: ["finesse-slow", "fly-dry", "fly-nymph"],
    also: "First light and last light, and genuinely nothing in between. Go early or do not go.",
  },
  {
    id: "cold", group: "Conditions", name: "Cold water",
    see: "Early spring or late autumn, water cold enough that your hands hurt after unhooking one.",
    means: "Everything slows down. Fish still feed but they will not move far to do it, and a bait that has to be chased will be ignored by fish that would take the same bait in July.",
    where: "The deepest water in the area, and the first places that warm — a shallow dark-bottomed bay on a sunny afternoon can be several degrees up on the main lake and hold everything.",
    present: "Slower than you think, then slower again. A pause of ten seconds between movements is normal in cold water and feels absurd. Most people fish twice as fast as they should and blame the fish.",
    baits: ["jigminnow", "tube", "shadrap", "microjig", "minnow"],
    tactics: ["jig-hopping", "slip-float", "finesse-slow"],
    also: "The afternoon is better than the morning in cold water, which is the opposite of the rest of the year.",
  },
];

/* Every group, in the order the list uses them. Derived rather than declared,
   so a new entry in a new group cannot be invisible because somebody forgot
   to add the heading. */
export function waterGroups() {
  const out = [];
  for (const w of WATER_READS) if (!out.includes(w.group)) out.push(w.group);
  return out;
}

export function findRead(id) {
  return WATER_READS.find((w) => w.id === id) || null;
}
