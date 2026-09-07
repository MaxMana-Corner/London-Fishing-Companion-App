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

/* ============================================================
   Pin sets.

   Pins are not catalog records - they have no name, they carry
   coordinates, and they are never part of a Field Guide Pack. So they
   get their own small validate-and-merge path rather than being forced
   through portability.js, which would mean teaching it a sixth content
   type it has no other use for.
   ============================================================ */

export const PIN_KINDS = ["pollution", "snag", "hazard", "good-spot", "access-rating"];

/* "personal" is a catch-all for the thing worth marking that is none of the
   five - a gate code, where you left the car, the branch you always catch on
   the back cast. It is deliberately NOT in PIN_KINDS, which is the shareable
   set, for two reasons:

     - A free-text marker with no agreed meaning is the hardest thing to
       moderate and the least use to a stranger. "Check here" tells somebody
       else nothing.
     - Leaving it out means validatePinSet rejects an incoming one and
       buildSubmission drops an outgoing one, with no change needed to the
       bridge or the packs repository. The privacy is structural rather than
       a rule somebody has to remember to apply.

   So: yours, on your device. */
export const PERSONAL_PIN = "personal";
export const LOCAL_PIN_KINDS = [...PIN_KINDS, PERSONAL_PIN];
export const isShareablePinType = (t) => PIN_KINDS.includes(t);
export const countPersonal = (pins) =>
  (Array.isArray(pins) ? pins : []).filter((p) => p && p.type === PERSONAL_PIN).length;

const validLl = (ll) =>
  Array.isArray(ll) && ll.length === 2 &&
  Number.isFinite(Number(ll[0])) && Number.isFinite(Number(ll[1])) &&
  Number(ll[0]) >= -90 && Number(ll[0]) <= 90 &&
  Number(ll[1]) >= -180 && Number(ll[1]) <= 180;

/* Same posture as the pack validator: reject the file whole rather than
   merging half of something malformed, but drop individual bad pins with
   a warning instead of failing over one typo. */
export function validatePinSet(text) {
  const errors = [], warnings = [];
  let raw;
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, errors: ["That file is empty."], warnings, pins: [] };
  }
  try { raw = JSON.parse(text); }
  catch { return { ok: false, errors: ["That file isn't valid JSON."], warnings, pins: [] }; }

  if (!isObj(raw)) return { ok: false, errors: ["That file doesn't contain an object."], warnings, pins: [] };
  if (raw.app !== "london-fishing-companion") {
    return { ok: false, errors: ["That file wasn't made by this app."], warnings, pins: [] };
  }
  if (raw.kind !== "pins") {
    return { ok: false, errors: ["That file isn't a set of map pins."], warnings, pins: [] };
  }
  if (!Array.isArray(raw.pins)) {
    return { ok: false, errors: ['"pins" should be a list.'], warnings, pins: [] };
  }

  const seen = new Set();
  const pins = [];
  let dropped = 0;
  for (const p of raw.pins) {
    if (!isObj(p) || typeof p.id !== "string" || !p.id || seen.has(p.id)) { dropped++; continue; }
    if (!PIN_KINDS.includes(p.type) || !validLl(p.ll)) { dropped++; continue; }
    seen.add(p.id);
    pins.push({
      id: p.id,
      type: p.type,
      ll: [Number(p.ll[0]), Number(p.ll[1])],
      title: str(p.title).slice(0, 120),
      note: str(p.note).slice(0, 600),
      author: str(p.author) || "Anonymous",
      spotId: str(p.spotId) || null,
      access: isObj(p.access) ? p.access : null,
      createdAt: num(p.createdAt) || 0,
      updatedAt: num(p.updatedAt) || num(p.createdAt) || 0,
    });
  }
  if (dropped) warnings.push(`${dropped} unusable pin${dropped === 1 ? " was" : "s were"} skipped.`);
  if (!pins.length) errors.push("That file has no usable pins in it.");
  return { ok: errors.length === 0, errors, warnings, pins };
}

/* Merge by id, newer updatedAt wins - the same rule everything else in
   the app reconciles by, so the two never disagree. */
export function mergePins(existing, incoming, packId) {
  const map = new Map();
  for (const p of Array.isArray(existing) ? existing : []) if (p && p.id) map.set(p.id, p);

  let added = 0, updated = 0, unchanged = 0;
  for (const p of Array.isArray(incoming) ? incoming : []) {
    if (!p || !p.id) continue;
    const tagged = { ...p, source: COMMUNITY_SOURCE, sourcePackId: String(packId || "") };
    const have = map.get(p.id);
    if (!have) { map.set(p.id, tagged); added++; continue; }
    if ((Number(p.updatedAt) || 0) > (Number(have.updatedAt) || 0)) { map.set(p.id, tagged); updated++; }
    else unchanged++;
  }
  return { pins: [...map.values()], added, updated, unchanged };
}

export function describePinMerge(summary) {
  const bits = [];
  if (summary.added) bits.push(`${summary.added} new pin${summary.added === 1 ? "" : "s"}`);
  if (summary.updated) bits.push(`${summary.updated} updated`);
  if (summary.unchanged) bits.push(`${summary.unchanged} unchanged`);
  return bits.join(", ") || "nothing new";
}

/* ============================================================
   Owning your pins.

   Three different things a person means by "get rid of this pin":
     - I made a mistake, delete mine
     - I do not want this whole pack any more
     - I do not trust that one pin, but the rest of the pack is fine

   The third is the one that is easy to get wrong. Deleting a single
   imported pin cannot work by removing the record, because the next
   time that pack is imported it comes straight back. So a hidden pin
   is remembered by id, separately from the pins themselves, and the
   filter is applied on the way to the map.
   ============================================================ */

export const MY_PINS = "mine";

export function makePin({ type, ll, title, note, author, spotId }) {
  if (!LOCAL_PIN_KINDS.includes(type)) return null;
  if (!validLl(ll)) return null;
  const now = Date.now();
  return {
    id: "p_" + now.toString(36) + Math.random().toString(36).slice(2, 8),
    type,
    ll: [Number(ll[0]), Number(ll[1])],
    title: str(title).slice(0, 120) || defaultTitleFor(type),
    note: str(note).slice(0, 600),
    author: str(author).slice(0, 60) || "You",
    /* Which location this sits inside, if any. A good spot is a place WITHIN
       a location - the gravel bar below the riffle, not the park it is in -
       and the two are different things. Unattached is a real answer: not
       every mark worth making is inside somewhere you have saved. */
    spotId: str(spotId) || null,
    source: MY_PINS,
    sourcePackId: "",
    createdAt: now,
    updatedAt: now,
  };
}

const DEFAULT_TITLES = {
  snag: "Snag", hazard: "Hazard", pollution: "Pollution",
  "good-spot": "Good spot", "access-rating": "Access", personal: "Note",
};
const defaultTitleFor = (type) => DEFAULT_TITLES[type] || "Pin";

export const isMyPin = (p) => !!p && p.source === MY_PINS;

/* Deleting one of your own is a real delete - nothing will bring it back. */
export function removePin(pins, id) {
  return (Array.isArray(pins) ? pins : []).filter((p) => p && p.id !== id);
}

/* Removing a pack takes its pins and nothing else. Your own pins and other
   packs are untouched. */
export function removePack(pins, packId) {
  return (Array.isArray(pins) ? pins : []).filter(
    (p) => p && !(p.source === COMMUNITY_SOURCE && p.sourcePackId === packId)
  );
}

/* What is installed, so it can be listed and removed. */
export function pinPacks(pins) {
  const packs = new Map();
  let mine = 0;
  for (const p of Array.isArray(pins) ? pins : []) {
    if (!p) continue;
    if (isMyPin(p)) { mine++; continue; }
    const id = p.sourcePackId || "unknown";
    const got = packs.get(id) || { id, count: 0, authors: new Set() };
    got.count++;
    if (p.author) got.authors.add(p.author);
    packs.set(id, got);
  }
  return {
    mine,
    packs: [...packs.values()]
      .map((p) => ({ id: p.id, count: p.count, authors: [...p.authors] }))
      .sort((a, b) => b.count - a.count),
  };
}

/* Hiding is by id and survives re-importing the pack, which is the whole
   point - otherwise a pin you rejected reappears the next time the pack
   updates. */
export function hidePin(hidden, id) {
  const set = new Set(Array.isArray(hidden) ? hidden : []);
  set.add(String(id));
  return [...set];
}

export function unhidePin(hidden, id) {
  return (Array.isArray(hidden) ? hidden : []).filter((h) => h !== String(id));
}

export function visiblePins(pins, hidden) {
  const set = new Set(Array.isArray(hidden) ? hidden : []);
  return (Array.isArray(pins) ? pins : []).filter((p) => p && !set.has(p.id));
}

/* Hidden ids for pins that are no longer installed are dead weight. */
export function pruneHidden(hidden, pins) {
  const live = new Set((Array.isArray(pins) ? pins : []).map((p) => p && p.id));
  return (Array.isArray(hidden) ? hidden : []).filter((h) => live.has(h));
}
