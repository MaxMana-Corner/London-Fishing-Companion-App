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

/* ============================================================
   Sharing to the community.

   Everything below exists to answer one question honestly: what
   exactly leaves this device?

   The answer is an ALLOWLIST, never a denylist. A field nobody
   listed here is not shared. That way a mistake costs a missing
   field - annoying, visible, fixable - instead of leaking a
   licence number or a note about where someone actually fishes.

   Nothing from the log is shareable at all. Trips, catches, catch
   photos, the licence reminder, sync and Drive settings have no
   path through this file.
   ============================================================ */

export const SHARE_FIELDS = {
  spot: [
    "id", "name", "area", "water", "addr", "ll", "blurb", "depth", "hot",
    "density", "access", "accessNote", "bank", "hazards", "best", "tip",
    "maxDepth", "marks",
  ],
  species: [
    "id", "name", "sci", "season", "art", "idKey", "vs", "habits",
    "target", "baits", "where", "size", "sizes",
  ],
  bait: [
    "id", "name", "kind", "colour", "colours", "targets", "hook", "rig",
    "float", "how", "when", "shape", "sizes",
  ],
  knot: ["id", "name", "use", "strength", "steps", "fail", "diff"],
  tip: ["id", "cat", "title", "body"],
  pin: [
    "id", "type", "ll", "title", "note", "createdAt", "updatedAt",
    "spotId", "access",
  ],
};

/* catalog key -> the singular kind its records are */
export const KIND_OF = {
  spots: "spot", species: "species", baits: "bait", knots: "knot", tips: "tip",
};

export const PIN_TYPES = ["pollution", "snag", "hazard", "good-spot", "access-rating"];

/* Deliberately absent from every allowlist, listed here so the
   omission reads as a decision rather than an oversight:
     custom, _v, updatedAt on catalog records - local bookkeeping,
       regenerated on the far side
     source, sourcePackId - re-sharing someone else's contribution
       under your own name is exactly what these prevent
     photoId, notes - belong to the log
     catalog.photos - a person's own pasted pictures. A photo cannot
       be word-scanned, so the only sanctioned photo path is the one
       photo a location may carry, which always goes to human review. */

export function pickShareable(kind, rec) {
  const allow = SHARE_FIELDS[kind];
  if (!allow || !isObj(rec)) return null;
  const out = {};
  for (const field of allow) {
    if (rec[field] !== undefined) out[field] = rec[field];
  }
  if (typeof out.id !== "string" || !out.id) return null;
  return out;
}

/* What the person is about to publish, in their own words, so the
   confirm screen can list it rather than asking them to trust us. */
export function describeSubmission(payload) {
  if (!isObj(payload)) return [];
  if (payload.kind === "pins") {
    return [`${(payload.pins || []).length} map pin${(payload.pins || []).length === 1 ? "" : "s"}`];
  }
  const out = [];
  for (const [key, kind] of Object.entries(KIND_OF)) {
    const n = Array.isArray(payload.catalog?.[key]) ? payload.catalog[key].length : 0;
    if (!n) continue;
    const label = kind === "species" ? "species" : n === 1 ? kind : `${kind}s`;
    out.push(`${n} ${label}`);
  }
  return out;
}

/* Build the file that will be committed. Note what is NOT here:
   no meta block. community.gs stamps that server-side from values it
   validated itself, so a client cannot claim authorship of something
   it did not send. */
export function buildSubmission(type, { records = {}, pins = [], note = "" } = {}) {
  const base = {
    app: "london-fishing-companion",
    exportedAt: new Date().toISOString(),
    note: String(note || "").slice(0, 300),
  };

  if (type === "pins") {
    const clean = (Array.isArray(pins) ? pins : [])
      .map((p) => pickShareable("pin", p))
      .filter((p) => p && PIN_TYPES.includes(p.type) && validCoords(p.ll));
    if (!clean.length) return { ok: false, error: "There are no pins to share." };
    return { ok: true, payload: { ...base, schema: 1, kind: "pins", pins: clean } };
  }

  if (type !== "pack" && type !== "locations") {
    return { ok: false, error: "That cannot be shared." };
  }

  const catalog = {};
  let total = 0;
  for (const [key, kind] of Object.entries(KIND_OF)) {
    /* A locations submission is a pack carrying spots and nothing else.
       Same format, listed separately in the directory. */
    if (type === "locations" && key !== "spots") { catalog[key] = []; continue; }
    const list = Array.isArray(records[key]) ? records[key] : [];
    const clean = list.map((r) => pickShareable(kind, r)).filter(Boolean);
    catalog[key] = clean;
    total += clean.length;
  }
  if (!total) return { ok: false, error: "There is nothing in that to share." };

  /* schema 2 is what the app writes and what the importer on the far
     side reads. Kept in step with SCHEMA_VERSION deliberately. */
  return { ok: true, payload: { ...base, schema: 2, kind: "pack", catalog } };
}

function validCoords(ll) {
  if (!Array.isArray(ll) || ll.length !== 2) return false;
  const [lat, lon] = ll.map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/* ============================================================
   Voting, on the reading side.

   stats.json is regenerated every few hours, so a vote you just cast
   is not in it yet. Adding your own vote to the published score
   locally would fix that - right up until the rebuild lands, at which
   point your vote is counted twice.

   So the client never does arithmetic on the score. The bridge
   returns the authoritative tally at the moment you vote, and that
   is kept with a timestamp. Whichever is newer - your stored tally or
   the published one - wins. No adding, no drift, no double counting.
   ============================================================ */

export const VOTE_UP = 1;
export const VOTE_DOWN = -1;

/* What the app remembers per item after a vote: the direction it
   settled on, plus the tally the server reported at that instant. */
export function rememberVote(myVotes, itemId, res, at) {
  const out = { ...(myVotes || {}) };
  const dir = Number(res && res.yourVote) || 0;
  if (!dir && dir !== 0) return out;
  out[String(itemId)] = {
    dir,
    up: Math.max(0, Math.trunc(Number(res && res.up) || 0)),
    down: Math.max(0, Math.trunc(Number(res && res.down) || 0)),
    score: Math.trunc(Number(res && res.score) || 0),
    at: Number(at) || Date.now(),
  };
  return out;
}

export function mergeMyVotes(entries, myVotes, statsGeneratedAt) {
  const mineAll = myVotes && typeof myVotes === "object" ? myVotes : {};
  const published = Number(statsGeneratedAt) || 0;
  return (entries || []).map((e) => {
    const mine = mineAll[e.id];
    if (!mine || typeof mine !== "object") return { ...e, myVote: 0 };
    const mineIsNewer = (Number(mine.at) || 0) > published;
    if (!mineIsNewer) return { ...e, myVote: Number(mine.dir) || 0 };
    return {
      ...e,
      up: Number(mine.up) || 0,
      down: Number(mine.down) || 0,
      score: Number(mine.score) || 0,
      myVote: Number(mine.dir) || 0,
    };
  });
}

/* Votes for things that have since left the directory are dead weight;
   drop them so the store does not grow forever. */
export function pruneVotes(myVotes, entries) {
  const live = new Set((entries || []).map((e) => e.id));
  const out = {};
  for (const [id, v] of Object.entries(myVotes || {})) {
    if (live.has(id)) out[id] = v;
  }
  return out;
}

export const formatScore = (n) => (Number(n) > 0 ? `+${Math.trunc(n)}` : String(Math.trunc(Number(n) || 0)));
