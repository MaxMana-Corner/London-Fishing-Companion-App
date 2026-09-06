/* ============================================================
   community.js — shaping the community packs directory.

   Pure functions. NO network in this file, ever: services.js
   fetches, this file makes sense of what came back.

   Everything here treats its input as hostile. The index is a
   file in a public repository that strangers open pull requests
   against, so a malformed or malicious entry must be dropped
   without taking the rest of the directory down with it.
   ============================================================ */

export const COMMUNITY_SOURCE = "community";
export const ENTRY_TYPES = ["pack", "locations", "pins"];

const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x) => (typeof x === "string" ? x.trim() : "");
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/* An ISO date from a JSON file, as epoch ms. Anything unparseable
   becomes null rather than NaN or 1970. */
export function isoToMs(s) {
  if (typeof s !== "string" || !s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/* ---------------- index ----------------
   Returns every entry it could understand, plus a count of what it
   threw away. A directory with one broken entry still opens. */
export function shapeIndex(raw) {
  if (!isObj(raw)) return { ok: false, entries: [], dropped: 0, error: "The directory file is not readable." };
  const list = Array.isArray(raw.entries) ? raw.entries : null;
  if (!list) return { ok: false, entries: [], dropped: 0, error: "The directory file has no entries." };

  const seen = new Set();
  const entries = [];
  let dropped = 0;

  for (const e of list) {
    if (!isObj(e)) { dropped++; continue; }
    const id = str(e.id);
    const type = str(e.type);
    const title = str(e.title);
    const path = str(e.path);
    if (!id || seen.has(id)) { dropped++; continue; }
    if (!ENTRY_TYPES.includes(type)) { dropped++; continue; }
    if (!title || !path) { dropped++; continue; }
    seen.add(id);
    entries.push({
      id, type, title, path,
      description: str(e.description),
      author: str(e.author) || "Anonymous",
      contributedAt: isoToMs(e.contributedAt),
      updatedAt: isoToMs(e.updatedAt),
      schema: num(e.schema) || null,
      counts: isObj(e.counts) ? e.counts : {},
    });
  }
  return { ok: true, entries, dropped, error: null };
}

/* ---------------- stats ----------------
   Vote tallies are a separate file so the directory's own history
   stays clean. Missing stats are normal (they are regenerated on a
   schedule) and must never block the directory rendering. */
export function shapeStats(raw) {
  if (!isObj(raw)) return { generatedAt: null, scores: {} };
  const src = isObj(raw.scores) ? raw.scores : {};
  const scores = {};
  for (const [id, v] of Object.entries(src)) {
    if (!isObj(v)) continue;
    const up = Math.max(0, Math.trunc(num(v.up)));
    const down = Math.max(0, Math.trunc(num(v.down)));
    scores[id] = { up, down, score: Number.isFinite(Number(v.score)) ? Math.trunc(Number(v.score)) : up - down };
  }
  return { generatedAt: isoToMs(raw.generatedAt), scores };
}

export function scoreFor(stats, id) {
  const s = stats && stats.scores ? stats.scores[id] : null;
  return s || { up: 0, down: 0, score: 0 };
}

/* Join tallies onto entries. Entries with no tally sort as 0, not as
   missing — an unvoted pack and a pack at net zero are the same thing
   to a reader. */
export function withScores(entries, stats) {
  return (entries || []).map((e) => ({ ...e, ...scoreFor(stats, e.id) }));
}

/* ---------------- filter & sort ---------------- */

export function filterEntries(entries, { type = "all", query = "", minScore = null } = {}) {
  const q = str(query).toLowerCase();
  return (entries || []).filter((e) => {
    if (type !== "all" && e.type !== type) return false;
    if (minScore !== null && num(e.score) < minScore) return false;
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.author.toLowerCase().includes(q)
    );
  });
}

export function sortEntries(entries, mode = "score") {
  const list = [...(entries || [])];
  if (mode === "newest") {
    return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.title.localeCompare(b.title));
  }
  if (mode === "title") return list.sort((a, b) => a.title.localeCompare(b.title));
  // score: highest first, ties broken by most recent, then title, so the
  // order is stable rather than depending on object key order.
  return list.sort(
    (a, b) =>
      num(b.score) - num(a.score) ||
      (b.updatedAt || 0) - (a.updatedAt || 0) ||
      a.title.localeCompare(b.title)
  );
}

/* ---------------- describing an entry ---------------- */

const COUNT_LABELS = {
  spots: "spot", species: "species", baits: "bait", knots: "knot",
  tips: "tip", pins: "pin",
};

/* "3 spots, 1 bait, 2 tips" — what someone gets if they import it. */
export function describeCounts(counts) {
  const parts = [];
  for (const [k, label] of Object.entries(COUNT_LABELS)) {
    const n = Math.trunc(num(counts && counts[k]));
    if (n <= 0) continue;
    const plural = label === "species" ? "species" : n === 1 ? label : `${label}s`;
    parts.push(`${n} ${plural}`);
  }
  return parts.join(", ") || "nothing listed";
}

/* ---------------- tagging on import ----------------
   Anything that came from the directory is marked, permanently. It
   stays marked through a re-export, so a pack someone shares onward
   never passes another angler's contribution off as their own. */
export function tagCommunityRecords(catalog, packId) {
  const out = {};
  for (const [key, list] of Object.entries(catalog || {})) {
    if (!Array.isArray(list)) { out[key] = list; continue; }
    out[key] = list.map((r) =>
      isObj(r) ? { ...r, custom: true, source: COMMUNITY_SOURCE, sourcePackId: String(packId || "") } : r
    );
  }
  return out;
}

export const isCommunityRecord = (r) => isObj(r) && r.source === COMMUNITY_SOURCE;

/* Sheets sync carries the user's own authored data only. Community
   records are transient and re-downloadable, so they are deliberately
   left out — the same reasoning that keeps built-in content out of a
   Field Guide Pack. */
export function withoutCommunity(list) {
  return (Array.isArray(list) ? list : []).filter((r) => !isCommunityRecord(r));
}
