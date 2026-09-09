/* tiles.js — the encyclopedia home laid out like a Start menu.

   Three sizes, on a four-column grid:

     small  2 cols  half width - two to a row
     wide   4 cols  full width, short
     large  4 cols  full width, tall, showing a preview

   Pure functions again, for the same reason as favourites.js: the rules worth
   getting right are the ones about what happens to somebody's saved layout
   when the app changes underneath it, and those are much easier to be sure of
   as tests than as a component.

   A layout is an ordered list of { id, size }, plus a set of ids the person
   has removed. Both are stored; neither is the source of truth for WHICH
   categories exist - that is the caller's list, which is the whole point of
   reconcile() below. */

export const SIZES = ["small", "wide", "large"];

/* Small is HALF of wide, not a quarter. At one column of four a tile was too
   narrow to hold its own name, so the label wrapped or clipped and the row of
   four read as a strip of icons rather than a set of categories.

   The rows are recorded but not used by the CSS - height comes from
   aspect-ratio, because a grid row height cannot be derived from the column
   width in CSS and every attempt to fake it leaves gaps. */
export const SPAN = {
  small: { cols: 2, rows: 1 },
  wide:  { cols: 4, rows: 2 },
  large: { cols: 4, rows: 4 },
};

export const SIZE_LABEL = { small: "Small", wide: "Wide", large: "Large" };

/* Kept for completeness. The UI no longer cycles - a single button that
   showed the CURRENT size but SET the next one read as a state label and
   behaved as an action, so people tapped "L" expecting large and got small,
   and concluded they could not get back to small at all. */
export function nextSize(size) {
  const i = SIZES.indexOf(size);
  return SIZES[(i + 1) % SIZES.length];
}

/* The starting arrangement. Not all-small: a grid of seven identical squares
   tells you nothing about which of them you will actually open, and the
   default layout is the one most people will never change. */
export function defaultLayout(catIds, defaults = {}) {
  return catIds.map((id) => ({ id, size: defaults[id] || "small" }));
}

/* Reconcile a SAVED layout against the categories that exist NOW.

   This is the function that matters. A layout saved today will be loaded by a
   build that has categories today's build has never heard of, and the failure
   mode is silent: a new category simply never appears, for exactly the people
   who have used the app longest. So:

     - ids in the saved layout that no longer exist are dropped
     - ids that exist but are not in the saved layout are APPENDED, unless the
       person removed them on purpose
     - removals are remembered separately, so "I hid Rules" and "Rules did not
       exist when I saved this" stay different things

   The same bug in a different coat has already been fixed twice in this
   project - CATALOG_KEYS in Options counting five of six lists, and
   sparsePlaces not travelling into the region file. */
export function reconcile(saved, catIds, removed = [], defaults = {}) {
  const exists = new Set(catIds);
  const gone = new Set(removed);

  const kept = (Array.isArray(saved) ? saved : [])
    .filter((t) => t && exists.has(t.id) && !gone.has(t.id))
    .map((t) => ({ id: t.id, size: SIZES.includes(t.size) ? t.size : "small" }));

  const seen = new Set(kept.map((t) => t.id));
  const added = catIds
    .filter((id) => !seen.has(id) && !gone.has(id))
    .map((id) => ({ id, size: defaults[id] || "small" }));

  return [...kept, ...added];
}

export function resizeTile(layout, id, size) {
  return layout.map((t) => (t.id === id ? { ...t, size } : t));
}

export function cycleTile(layout, id) {
  return layout.map((t) => (t.id === id ? { ...t, size: nextSize(t.size) } : t));
}

/* Removing hides a category from the home page. It never touches records -
   the category is still reachable from search, and can be put back. */
export function removeTile(layout, removed, id) {
  return {
    layout: layout.filter((t) => t.id !== id),
    removed: removed.includes(id) ? removed : [...removed, id],
  };
}

export function restoreTile(layout, removed, id, size = "small") {
  if (layout.some((t) => t.id === id)) return { layout, removed: removed.filter((x) => x !== id) };
  return {
    layout: [...layout, { id, size }],
    removed: removed.filter((x) => x !== id),
  };
}

/* Move the tile at `from` so it sits at `to`, shifting the rest along rather
   than swapping. Swapping is the easier implementation and the wrong feel:
   dragging a tile three places to the left should not fling whatever was
   there back to where you started. */
export function moveTile(layout, from, to) {
  const n = layout.length;
  if (from === to || from < 0 || from >= n) return layout;
  const clamped = Math.max(0, Math.min(n - 1, to));
  const next = layout.slice();
  const [moved] = next.splice(from, 1);
  next.splice(clamped, 0, moved);
  return next;
}

export const indexOfTile = (layout, id) => layout.findIndex((t) => t.id === id);
