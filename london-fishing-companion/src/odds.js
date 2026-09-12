/* ============================================================
   HOOK RATE — a modelled estimate, not a measurement.

   The owner chose modelled over measured: it has to work on the first
   day, in a region nobody has fished yet, with an empty log. So it is
   built only from things the app already knows offline:

     density        how much of this species the water holds, 0-5
     seasonOpen     whether you may legally target it today
     rating         the conditions score the app already computes, 0-100
     inBestMonths   whether today falls in the species' good window

   WHAT IT IS NOT: a probability. It does not say "84% of anglers catch
   one". It is a relative score for comparing your options - this fish
   against that fish, here against there, today against tomorrow - and
   the UI has to say so, which is why there is a HELP entry beside every
   place it appears.

   Three deliberate constraints:

   A closed season is zero, not a low number. You may not target the fish
   at all, and a 12% next to a closed species invites exactly the wrong
   reading.

   Absent is zero. Density 0 means the species is not in that water; no
   amount of good weather changes that.

   The top is capped below 90. A model built from four coarse inputs has
   no business claiming near-certainty, and a number that reads 97% will
   be believed more than it deserves.
   ============================================================ */

export const HOOK_MIN = 3;
export const HOOK_MAX = 88;

/* NaN has to be caught BEFORE clamping, not after. Every comparison
   involving NaN is false, so Math.min(hi, Math.max(lo, NaN)) hands NaN
   straight back and the caller's arithmetic quietly becomes NaN too - which
   reached the dashboard as "NaN%" rather than as anything anybody could act
   on. `density` was already guarded this way; `rating` was not, and it is
   computed from sun times, a moon phase and any weather that has been
   fetched, so one bad number anywhere in that chain landed here. */
const clamp = (v, lo, hi) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
};

/* Each factor is a multiplier so they compose without one of them being
   able to rescue a zero. Ranges are chosen so that conditions and season
   can move the answer meaningfully without ever outweighing whether the
   fish is actually there. */
export function hookRate({ density = 0, seasonOpen = true, rating = 50, inBestMonths = false } = {}) {
  const d = Number(density) || 0;
  if (!seasonOpen) return 0;
  if (d <= 0) return 0;

  const base = clamp(d, 0, 5) / 5;                       // 0.2 .. 1.0
  const cond = 0.55 + (clamp(rating, 0, 100) / 100) * 0.55; // 0.55 .. 1.10
  const month = inBestMonths ? 1.15 : 0.82;

  return Math.round(clamp(base * cond * month * 100, HOOK_MIN, HOOK_MAX));
}

/* The band a number falls in, so the UI colours it the same way everywhere
   and the thresholds live in one place rather than in a ternary per screen. */
export function hookBand(v) {
  if (v <= 0) return "shut";
  if (v >= 60) return "good";
  if (v >= 35) return "fair";
  return "slim";
}

export const HOOK_WORDS = {
  shut: "Closed or absent",
  good: "Good odds",
  fair: "Worth a go",
  slim: "Long shot",
};

/* HOW A SPECIES LOOKS ACROSS A WHOLE REGION.

   The first version of this took the single best density in the region and
   scored that. On the London set every species has a 4 or a 5 somewhere in
   twelve spots, so every species came out at exactly the same number - a
   picker where fifteen fish all read 66% tells you nothing at all.

   So it blends the best spot with how WIDESPREAD the fish is: a species in
   ten of twelve waters is genuinely easier to go and catch than one that is
   abundant in a single pond, even though both have a 5 in them. The mean is
   taken over every spot in the region, zeros included, because a fish absent
   from most of the region should be pulled down by that.

   The month factor comes from the SPOT's best months, not the species' - the
   species records carry no month data at all, which is why the first version
   silently contributed nothing from it. Spots do carry it, and "is this a
   good month at that place" is the more useful question anyway. */
export const BEST_WEIGHT = 0.65;

export function regionalRate(speciesId, spots, { seasonOpen = true, rating = 50, month = 0 } = {}) {
  const list = spots || [];
  let best = null;
  let sum = 0, holders = 0, considered = 0;

  for (const sp of list) {
    /* A null or a non-object gets skipped rather than read. Reading .density
       off a null threw, and this runs on the dashboard - so one bad record in
       an imported backup took the whole home screen down. */
    if (!sp || typeof sp !== "object") continue;
    considered++;
    const d = ((sp.density || {})[speciesId]) || 0;
    if (d <= 0) continue;
    holders++;
    sum += d;
    const inBest = Array.isArray(sp.best) && sp.best.includes(month);
    const rate = hookRate({ density: d, seasonOpen, rating, inBestMonths: inBest });
    if (!best || rate > best.rate || (rate === best.rate && d > best.density)) {
      best = { rate, spot: sp, density: d, inBest };
    }
  }
  if (!best) return null;

  /* Divided by every spot in the region rather than by the holders, so being
     in two waters out of twelve reads differently from being in ten.

     By what was actually considered, not by the raw list length: the loop
     above skips anything that is not a record, and dividing by the full
     length would let one junk entry in an imported backup quietly lower
     every rate in the region. */
  const mean = considered ? sum / considered : 0;
  const blended = BEST_WEIGHT * best.density + (1 - BEST_WEIGHT) * mean;

  return {
    rate: hookRate({ density: blended, seasonOpen, rating, inBestMonths: best.inBest }),
    spot: best.spot,
    spotRate: best.rate,
    density: best.density,
    holders,
  };
}

/* Every species ranked for right now, for the preferred-catch picker. Ordered
   by the number, then by name so the list is stable when several tie - an
   unstable order in a picker makes the list feel broken. */
export function rankSpecies(species, spots, ctx = {}) {
  const month = ctx.month || 0;
  const rows = (species || []).map((s) => {
    const open = ctx.isOpen ? !!ctx.isOpen(s.id) : true;
    const r = regionalRate(s.id, spots, { seasonOpen: open, rating: ctx.rating ?? 50, month });
    return {
      species: s,
      rate: r ? r.rate : 0,
      spot: r ? r.spot : null,
      spotRate: r ? r.spotRate : 0,
      holders: r ? r.holders : 0,
      open,
    };
  });
  return rows.sort((a, b) => b.rate - a.rate || String(a.species.name).localeCompare(String(b.species.name)));
}
