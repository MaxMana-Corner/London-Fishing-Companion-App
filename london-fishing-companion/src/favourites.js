/* favourites.js — what you starred, what you actually use, and the order
   things appear in because of it.

   Five separate things in the design need this and none of them existed:
   the five favourite slots on the encyclopedia home, the favourites bar on a
   category page, filter-by-favourites, the shortcut to everything starred,
   and "most used / last used" sorting. So it is one module rather than five
   half-implementations.

   No storage in here on purpose. App.jsx owns persistence through its
   loadValue/saveKey shim, and these are pure functions over the values it
   holds - which is what makes the ordering rules testable, and the ordering
   rules are the part with actual judgement in them.

   Shapes:
     favs   ["species:smb", "tactic:jig-hopping", ...]   order = most recently starred first
     usage  { "species:smb": { n: 12, last: 1725840000000 }, ... }
*/

export const refOf = (kind, id) => `${kind}:${id}`;

/* ---------------- favourites ---------------- */

export function isFavourite(favs, kind, id) {
  return (favs || []).includes(refOf(kind, id));
}

/* Newly starred goes to the FRONT. The home page shows the first five, and
   the thing you just starred is the thing you are most likely to want there -
   if it were appended, the five slots would be permanently occupied by
   whatever you happened to star first and never change again. */
export function toggleFavourite(favs, kind, id) {
  const ref = refOf(kind, id);
  const list = Array.isArray(favs) ? favs : [];
  return list.includes(ref) ? list.filter((x) => x !== ref) : [ref, ...list];
}

/* Resolve refs back to records, dropping any that no longer exist - a
   favourited custom bait that was later deleted, or one that arrived in a
   pack that has since been removed. A dangling star must not render as a
   blank tile. */
export function resolveFavourites(favs, lookup, limit = Infinity) {
  const out = [];
  for (const ref of favs || []) {
    const at = ref.indexOf(":");
    if (at < 1) continue;
    const kind = ref.slice(0, at);
    const id = ref.slice(at + 1);
    const rec = lookup(kind, id);
    if (rec) out.push({ kind, id, rec });
    if (out.length >= limit) break;
  }
  return out;
}

/* Stars pointing at records that are gone stay in storage for ever otherwise,
   and the five home slots silently become four. */
export function pruneFavourites(favs, lookup) {
  return (favs || []).filter((ref) => {
    const at = ref.indexOf(":");
    if (at < 1) return false;
    return !!lookup(ref.slice(0, at), ref.slice(at + 1));
  });
}

/* ---------------- usage ---------------- */

/* "Most used" has to mean actually used - opened, or logged against - not
   merely present. Called from the places where a record is genuinely put to
   work, never from a list render, or scrolling a list would make everything
   equally "used" and the sort would be noise. */
export function recordUse(usage, kind, id, at = Date.now()) {
  const ref = refOf(kind, id);
  const prev = (usage || {})[ref] || { n: 0, last: 0 };
  return { ...(usage || {}), [ref]: { n: prev.n + 1, last: at } };
}

export const useCount = (usage, kind, id) => ((usage || {})[refOf(kind, id)] || {}).n || 0;
export const lastUsed = (usage, kind, id) => ((usage || {})[refOf(kind, id)] || {}).last || 0;

/* ---------------- ordering ---------------- */

export const SORTS = [
  { id: "default", label: "Default" },
  { id: "most", label: "Most used" },
  { id: "last", label: "Last used" },
  { id: "az", label: "A–Z" },
];

const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));

/* Your own records pin to the top by default - that was the explicit ask, and
   it is right: something you wrote yourself is something you went to the
   trouble of writing.

   But a long list of your own then buries everything built in, which was the
   other half of the same note. So this returns TWO lists rather than one
   concatenated one, and caps the pinned section. The caller renders the cap
   as "and 7 more of yours", so nothing is hidden, it just stops pushing the
   encyclopedia off the screen.

   Every sort other than "default" applies across both groups equally - once
   you have asked for "most used", your own records have no special claim on
   the top, because you asked a question about usage and not about ownership. */
export function orderRecords(records, {
  kind,
  sort = "default",
  usage = {},
  favs = [],
  favsOnly = false,
  pinnedCap = 6,
} = {}) {
  let list = (records || []).slice();

  if (favsOnly) list = list.filter((r) => isFavourite(favs, kind, r.id));

  if (sort === "az") return { pinned: [], rest: list.sort(byName), hiddenPinned: 0 };

  if (sort === "most") {
    return {
      pinned: [],
      hiddenPinned: 0,
      rest: list.sort((a, b) =>
        (useCount(usage, kind, b.id) - useCount(usage, kind, a.id)) || byName(a, b)),
    };
  }

  if (sort === "last") {
    return {
      pinned: [],
      hiddenPinned: 0,
      rest: list.sort((a, b) =>
        (lastUsed(usage, kind, b.id) - lastUsed(usage, kind, a.id)) || byName(a, b)),
    };
  }

  /* default: your own first, newest first, capped - then everything else in
     the order the encyclopedia already puts it, which is deliberate and not
     alphabetical. */
  const mine = list.filter((r) => r.custom)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const built = list.filter((r) => !r.custom);
  return {
    pinned: mine.slice(0, pinnedCap),
    hiddenPinned: Math.max(0, mine.length - pinnedCap),
    rest: built,
  };
}

/* ---------------- search ---------------- */

/* One search across every category, because the encyclopedia home has one box
   and somebody typing "walleye" does not know or care whether that is a fish,
   a tactic or a bait. Matches name first, then the descriptive fields each
   kind happens to carry - deliberately a small set, so a search does not
   match on the body of every step of every tactic and return everything. */
const SEARCH_FIELDS = ["name", "title", "gist", "kind", "use", "cat", "blurb", "water", "area"];

export function searchAll(groups, query, limit = 40) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) return [];
  const out = [];
  for (const { kind, label, records } of groups) {
    for (const r of records || []) {
      const name = String(r.name || r.title || "");
      const hay = SEARCH_FIELDS.map((f) => String(r[f] || "")).join(" ").toLowerCase();
      const at = hay.indexOf(q);
      if (at < 0) continue;
      /* A name match beats a match buried in a description, and a name that
         STARTS with what you typed beats one that merely contains it. */
      const lower = name.toLowerCase();
      const rank = lower.startsWith(q) ? 0 : lower.includes(q) ? 1 : 2;
      out.push({ kind, label, rec: r, rank });
    }
  }
  return out.sort((a, b) => a.rank - b.rank || byName(a.rec, b.rec)).slice(0, limit);
}
