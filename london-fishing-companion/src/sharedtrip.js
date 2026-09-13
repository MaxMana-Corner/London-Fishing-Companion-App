/* sharedtrip.js — two phones agreeing they are on the same trip, and the
   handoff at the end of the day.
   ============================================================

   WHY THIS SHAPE. The design note ruled out a live session: WebRTC needs a
   signalling server to introduce the peers, which is the server this app
   deliberately does not have, and Web Bluetooth is absent from iOS entirely.
   Both fail in exactly the conditions this feature exists for — a riverbank
   with no signal. So: agree on the trip at the start, fish independently all
   day with no contact between the phones, hand the catches over at the end.

   THE CAMERA PROBLEM, AND WHY THE CODE IS A URL. This app has a QR encoder
   and no decoder, and no camera access. The guest therefore cannot scan
   anything with Creel. What every modern phone CAN do is scan a QR with its
   own camera app and open the URL inside it — so the code is a link back to
   this app with the join payload in the fragment. The guest's phone opens
   the app it already has, offline, and reads the payload out of the URL.
   Nothing is fetched and no decoder is needed.

   THE BUDGET IS IN BYTES AND IT IS TIGHT. qr.js is byte mode, EC level M,
   versions 1 to 10: 213 bytes, and not one more. An accented character costs
   two of them, which matters immediately — "Rivière de l'Achigan" and "Lac
   Maskinongé" are both real spot names in this app. So the payload is
   base64url'd (pure ASCII out, whatever went in) and then MEASURED, and the
   spot name and host name are truncated until the whole URL fits. Guessing a
   character budget would have shipped a code that works in London and fails
   in Rawdon.
   ============================================================ */

/* qr.js, byte mode, EC M, versions 1-10. Measured, not quoted from a table:
   tests/test-sharedtrip.mjs asserts this number against the encoder itself,
   so a change to qr.js cannot silently invalidate it. */
export const QR_MAX_BYTES = 213;

export const JOIN_VERSION = "1";
export const JOIN_PREFIX = "#j=";

/* Names are truncated to fit the code, not rejected. A party member called
   something long is not an error, it is a person. */
export const HOST_NAME_MAX = 24;
export const SPOT_NAME_MAX = 40;

const utf8Len = (s) => {
  /* TextEncoder is present everywhere this runs, but this file is also read
     by the standalone build and by tests, so the fallback is real rather
     than defensive dressing. */
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
  return unescape(encodeURIComponent(s)).length;
};

/* ---------------- base64url ----------------

   Not for secrecy — this is a join code, not a password, and anybody who can
   see the QR is standing next to you. It is here because the payload has to
   survive a URL fragment, a text message and a messaging app's link
   detection without being mangled, and because percent-encoding a spot name
   full of spaces costs three bytes per space against a 213-byte budget. */

const b64 = (bytes) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const raw = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const unb64 = (text) => {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = typeof atob === "function"
    ? atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))
    : Buffer.from(padded, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const toBytes = (s) => (typeof TextEncoder !== "undefined"
  ? new TextEncoder().encode(s)
  : Uint8Array.from(unescape(encodeURIComponent(s)), (c) => c.charCodeAt(0)));

const fromBytes = (b) => (typeof TextDecoder !== "undefined"
  ? new TextDecoder().decode(b)
  : decodeURIComponent(escape(String.fromCharCode(...b))));

/* ---------------- the payload ----------------

   Pipe-delimited rather than JSON, because JSON spends a quarter of the
   budget on quotes and braces for six fields. The pipe is stripped from
   names on the way in — a person called "Dave|" would otherwise shift every
   field after them by one. */

const clean = (v, max) =>
  String(v == null ? "" : v).replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

const FIELDS = ["tripId", "date", "hostId", "hostName", "spotId", "spotName"];

function pack(d) {
  return [JOIN_VERSION, d.tripId, d.date, d.hostId, d.hostName, d.spotId, d.spotName].join("|");
}

/* ---------------- encode ----------------

   Returns the code, the URL that carries it, and whether it fits in a QR.
   `fits: false` is not a failure — the code is still valid and can be sent
   as text — it means the screen must offer the code rather than the square. */
export function encodeJoin(trip, opts = {}) {
  const base = String(opts.origin || "").replace(/[#?].*$/, "");
  let hostName = clean(trip.hostName, HOST_NAME_MAX);
  let spotName = clean(trip.spotName, SPOT_NAME_MAX);

  const build = () => {
    const code = b64(toBytes(pack({
      tripId: clean(trip.tripId, 24),
      date: clean(trip.date, 10),
      hostId: clean(trip.hostId, 24),
      hostName, spotId: clean(trip.spotId, 32), spotName,
    })));
    return { code, url: base ? base + JOIN_PREFIX + code : "" };
  };

  /* MEASURED, NOT ESTIMATED. Trim the spot name first - it is the field the
     guest needs least, because the trip itself arrives with the handoff and
     carries the full name. Then the host's name. The ids and the date are
     never touched: they are what the code is FOR. */
  let out = build();
  const tooBig = () => utf8Len(out.url || out.code) > QR_MAX_BYTES;

  while (tooBig() && spotName.length > 0) {
    spotName = spotName.slice(0, Math.max(0, spotName.length - 4)).trim();
    out = build();
  }
  while (tooBig() && hostName.length > 3) {
    hostName = hostName.slice(0, hostName.length - 2).trim();
    out = build();
  }

  return { ...out, fits: !tooBig(), spotName, hostName };
}

/* ---------------- decode ----------------

   Accepts whatever somebody actually pastes: the whole URL, just the
   fragment, or the bare code. All three happen — a camera app hands over a
   URL, a text message may arrive with the link stripped to its tail, and a
   person copying off a screen copies the code. Refusing two of the three
   would be refusing the two that need the most help. */
export function decodeJoin(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw) return { ok: false, error: "Nothing to join — paste the code you were sent." };

  const at = raw.indexOf(JOIN_PREFIX);
  const code = at >= 0 ? raw.slice(at + JOIN_PREFIX.length) : raw.replace(/^#/, "");
  if (!/^[A-Za-z0-9_-]+$/.test(code)) {
    return { ok: false, error: "That does not look like a trip code. It should be one unbroken run of letters and numbers." };
  }

  let text;
  try { text = fromBytes(unb64(code)); }
  catch { return { ok: false, error: "That code could not be read. It may have been cut short." }; }

  const parts = text.split("|");
  if (parts[0] !== JOIN_VERSION) {
    return { ok: false, error: `That code was made by a different version of the app (${parts[0] || "unreadable"}).` };
  }
  if (parts.length !== FIELDS.length + 1) {
    return { ok: false, error: "That code is incomplete — it may have been cut short when it was sent." };
  }
  const data = {};
  FIELDS.forEach((k, i) => { data[k] = parts[i + 1]; });

  /* The three fields without which the code means nothing. A missing spot
     name is survivable; a missing trip id is not a trip. */
  if (!data.tripId || !data.hostId || !data.date) {
    return { ok: false, error: "That code is missing the trip it refers to." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return { ok: false, error: "That code has an unreadable date on it." };
  }
  return { ok: true, data };
}

/* ---------------- matching people across two phones ----------------

   THE PROBLEM THIS SOLVES. Angler ids are minted locally, so my record for
   you and your record for you are different objects with different ids. A
   bundle carrying `by: "a9f3k2p1"` means nothing on the phone receiving it.

   So a bundle carries its own angler table and this maps it onto the local
   one BY NAME, folded — which is what two people typing the same name on two
   phones will produce. Anyone unmatched is adopted with their own id, which
   is safe because that id came from a device that has never met this one.

   `self` is stripped on the way in. The record that is "me" on the sending
   phone is emphatically not me on the receiving one, and letting that flag
   travel would give the importing phone two selves - after which every
   "whose fish is this" answer is a coin toss. */
export function mapAnglers(incoming = [], local = []) {
  const fold = (n) => String(n == null ? "" : n).replace(/\s+/g, " ").trim().toLowerCase();
  const byName = new Map();
  for (const a of local) if (a && a.id) byName.set(fold(a.name), a);

  const map = new Map();
  const adopt = [];
  const matched = [];

  for (const a of incoming) {
    if (!a || !a.id) continue;
    const hit = byName.get(fold(a.name));
    if (hit) { map.set(a.id, hit.id); matched.push({ from: a, to: hit }); continue; }
    const { self, ...rest } = a;          /* never import somebody else's "me" */
    map.set(a.id, a.id);
    adopt.push({ ...rest, updatedAt: Number(a.updatedAt) || Date.now() });
  }
  return { map, adopt, matched };
}

/* Rewrite every angler reference in a bundle through that map, so the records
   that land are pointing at people this phone knows about. */
export function applyAnglerMap(bundle, map) {
  const to = (id) => (id && map.has(id) ? map.get(id) : id);
  return {
    ...bundle,
    trips: (bundle.trips || []).map((t) => ({
      ...t,
      hostBy: to(t.hostBy),
      party: Array.isArray(t.party) ? [...new Set(t.party.map(to))] : t.party,
    })),
    catches: (bundle.catches || []).map((c) => (c.by ? { ...c, by: to(c.by) } : c)),
  };
}

/* ---------------- the handoff bundle ----------------

   BUILT BY NAMING WHAT GOES IN, never by filtering a full export down. This
   app has already shipped the bug where buildExport's default branch sent
   the entire log for an unrecognised kind, and this is the feature where
   that would matter most - the whole point is that it carries one trip and
   nothing else about your fishing.

   Photos are excluded and that is not an oversight: they are the largest
   thing in the log and the most personal, and a bundle that quietly carried
   them would be both a size problem and a surprise. */
export function buildTripBundle({ trip, catches = [], anglers = [], by = null, note = "" }) {
  if (!trip || !trip.id) return null;

  /* A GUEST'S COPY OF A TRIP IS IDENTITY, NOT A READING.

     The host owns the conditions. On screen that is a disabled field; here it
     has to be an authority rule, because the merge is last-write-wins on the
     whole record and a guest's copy is newer and emptier than the host's. It
     carried undefined where the host had a water temperature, and won.

     So a guest sends which trip, when, where and with whom - and stamps it
     updatedAt 0 so the host's record always survives the merge. */
  const fromGuest = !!(trip.hostBy && by && by !== trip.hostBy);

  /* Only this trip's catches, and only the ones belonging to the person
     sending them. You hand over YOUR fish; theirs are already theirs. */
  const mine = catches.filter((c) =>
    c && c.tripId === trip.id && (by ? (c.by || by) === by : true));

  /* Only the people these records actually reference. A bundle has no
     business carrying the rest of your address book. */
  const need = new Set();
  if (trip.hostBy) need.add(trip.hostBy);
  for (const id of Array.isArray(trip.party) ? trip.party : []) need.add(id);
  for (const c of mine) if (c.by) need.add(c.by);

  /* Identity: true for both, and all a guest sends. */
  const identity = {
    id: trip.id, date: trip.date, spotId: trip.spotId, spotName: trip.spotName || "",
    party: Array.isArray(trip.party) ? trip.party : [],
    hostBy: trip.hostBy, ll: trip.ll,
  };
  /* The host's readings, which are the host's to give. */
  const readings = {
    start: trip.start, end: trip.end,
    sky: trip.sky, wind: trip.wind, clarity: trip.clarity, level: trip.level,
    airTemp: trip.airTemp, waterTemp: trip.waterTemp, moon: trip.moon, notes: trip.notes,
  };

  return {
    trip: fromGuest
      /* updatedAt 0 loses every comparison in mergeList, which is the point:
         the host's own record wins, and this one only lands if they have no
         record for the trip at all. */
      ? { ...identity, updatedAt: 0 }
      : { ...identity, ...readings, updatedAt: Number(trip.updatedAt) || Date.now() },
    catches: mine,
    /* `self` stripped here too, at the point of leaving. mapAnglers strips it
       again on the way in: two guards, because one of them being removed by
       a future refactor must not be enough to break it. */
    anglers: anglers.filter((a) => a && need.has(a.id)).map(({ self, ...rest }) => rest),
    note: String(note || "").slice(0, 280),
  };
}
