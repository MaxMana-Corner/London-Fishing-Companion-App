/* videos.js — a shelf of videos, in an app that works with no signal.
   ============================================================

   THE TENSION THIS HAS TO HOLD. Creel's entire pitch is that it works on a
   riverbank with no bars and sends nothing anywhere. YouTube is the opposite
   of both. So the rule is: the LIBRARY works offline and PLAYING does not.

   When a video is added, its title, channel and thumbnail are fetched once
   and kept on the phone for good. After that the shelf reads, searches and
   browses with the radios off; tapping one leaves the app, and the screen
   says so rather than failing silently in a field.

   WHY THE THUMBNAIL IS STORED AS BYTES rather than as a URL to img.youtube.
   A remote image in an offline app is a grey box on the bank, and a grey box
   is worse than no picture because it reads as broken. mqdefault is about
   12 KB, which is affordable for something a person deliberately added.

   HOW SHELVING WORKS. The owner chose shelves the app defines with videos
   auto-filed. A video added to a fish files itself under Species ID without
   anybody choosing; one added on its own picks its shelf. That way the same
   taxonomy holds both sources and the library has a shape from the first
   video rather than after the fiftieth.

   NOTHING IS PRELOADED. The owner's call - the frame, not the contents.
   ============================================================ */

export const SHELVES = [
  { id: "beginner", name: "Beginner Guides",
    blurb: "Start here. How to cast, what the tackle is called, and what to do with a fish once it is on." },
  { id: "water", name: "Reading Water",
    blurb: "Where fish are and why. Seams, breaks, structure, and what conditions change." },
  { id: "presentation", name: "Casting & Presentation",
    blurb: "Making a lure behave. Retrieves, depth control, and how a bait should look in the water." },
  { id: "knots", name: "Knots & Rigs",
    blurb: "Tying it on and putting it together, at a speed you can follow." },
  { id: "species", name: "Species & ID",
    blurb: "Telling fish apart, and how to target a particular one." },
  { id: "handling", name: "Handling & Cooking",
    blurb: "Unhooking, releasing, killing cleanly, filleting and what to do in the kitchen." },
  { id: "rules", name: "Rules & Licences",
    blurb: "Regulations explained, and the bits people get wrong." },
];

/* A video attached to a record files itself by what kind of record it is.
   Deliberately a small table rather than a field on each record: the mapping
   is a property of the CATEGORY, and putting it on every record would be six
   hundred copies of seven facts. */
export const SHELF_FOR_KIND = {
  species: "species",
  baits: "presentation",
  knots: "knots",
  rigs: "knots",
  hooks: "knots",
  tactics: "water",
  spots: "water",
  handling: "handling",
  regs: "rules",
  gear: "beginner",
  tips: "beginner",
};

export const MAX_VIDEOS = 400;
export const TITLE_MAX = 140;

/* ---------------- what counts as a YouTube link ----------------

   Six shapes people actually paste, including the two that carry a playlist
   or a timestamp on the end. The id is eleven characters of a known alphabet,
   which is strict enough that a mistyped link is refused rather than stored
   as a video that will never load. */
const PATTERNS = [
  /(?:youtube\.com\/watch\?(?:[^&]*&)*v=)([A-Za-z0-9_-]{11})/,
  /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
  /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
  /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  /(?:youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
  /^([A-Za-z0-9_-]{11})$/,
];

export function videoId(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return null;
  for (const re of PATTERNS) {
    const m = re.exec(s);
    if (m) return m[1];
  }
  return null;
}

export const watchUrl = (id) => "https://www.youtube.com/watch?v=" + id;
export const thumbUrl = (id) => "https://img.youtube.com/vi/" + id + "/mqdefault.jpg";

/* ---------------- fetching the details ----------------

   oEmbed, because it needs no API key and no account - this app has neither
   and is not acquiring one. It is the only call this module ever makes, it
   happens once per video at the moment somebody adds it, and it is allowed
   to fail: a video with no title is still a video, and it is better to store
   what was typed than to refuse the addition because the wifi is down.

   The fetcher is injected so this module can be tested without a network and
   without a mock global. */
export async function fetchDetails(id, { fetcher, timeout = 12000 } = {}) {
  const f = fetcher || (typeof fetch === "function" ? fetch : null);
  if (!f) return { ok: false, error: "no network in this environment" };
  const url = "https://www.youtube.com/oembed?format=json&url=" +
    encodeURIComponent(watchUrl(id));
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
  try {
    const res = await f(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res || !res.ok) return { ok: false, error: "that video could not be looked up" };
    const j = await res.json();
    return {
      ok: true,
      title: String(j.title || "").slice(0, TITLE_MAX),
      channel: String(j.author_name || "").slice(0, 80),
    };
  } catch (e) {
    return { ok: false, error: (e && e.name === "AbortError") ? "the lookup timed out" : "no connection" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* The thumbnail as bytes, so the shelf still has pictures on it with the
   radios off. Failure is fine and common - the library falls back to a drawn
   placeholder rather than a broken image. */
export async function fetchThumb(id, { fetcher, timeout = 12000 } = {}) {
  const f = fetcher || (typeof fetch === "function" ? fetch : null);
  if (!f) return null;
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
  try {
    const res = await f(thumbUrl(id), ctrl ? { signal: ctrl.signal } : undefined);
    if (!res || !res.ok) return null;
    const blob = await res.blob();
    /* 60 KB is generous for a 320x180 jpeg and stops a redirect to something
       enormous from being written into storage. */
    if (blob.size > 60 * 1024) return null;
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || "") || null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ---------------- the records ---------------- */

export function makeVideo({ id, title, channel, thumb, shelf, note, ref }) {
  return {
    id,
    title: String(title || "").slice(0, TITLE_MAX) || "Untitled video",
    channel: String(channel || "").slice(0, 80),
    thumb: typeof thumb === "string" && thumb.startsWith("data:image/") ? thumb : null,
    /* An explicit shelf wins; otherwise the record it came from decides; a
       standalone video with neither lands in Beginner Guides, which is where
       somebody browsing with no idea what they want should be sent. */
    shelf: shelf || (ref && SHELF_FOR_KIND[ref.kind]) || "beginner",
    note: String(note || "").slice(0, 200),
    ref: ref && ref.kind && ref.id ? { kind: ref.kind, id: ref.id, name: ref.name || "" } : null,
    addedAt: Date.now(),
  };
}

/* Union by video id. The same video attached to three fish is one video on
   the shelf with three references, not three shelf entries - which is the
   whole reason the library is a view over the records rather than a second
   list somebody has to keep in step. */
export function addVideo(list, rec) {
  const out = Array.isArray(list) ? [...list] : [];
  const at = out.findIndex((v) => v.id === rec.id);
  if (at < 0) return [{ ...rec, refs: rec.ref ? [rec.ref] : [] }, ...out].slice(0, MAX_VIDEOS);
  const have = out[at];
  const refs = [...(have.refs || [])];
  if (rec.ref && !refs.some((r) => r.kind === rec.ref.kind && r.id === rec.ref.id)) refs.push(rec.ref);
  out[at] = {
    ...have, refs,
    /* A later add can only fill gaps, never overwrite - somebody who typed a
       better title than YouTube's should keep it. */
    title: have.title && have.title !== "Untitled video" ? have.title : rec.title,
    channel: have.channel || rec.channel,
    thumb: have.thumb || rec.thumb,
  };
  return out;
}

export function removeVideo(list, id) {
  return (Array.isArray(list) ? list : []).filter((v) => v.id !== id);
}

/* Grouped for the screen. Empty shelves are returned too, with a count of
   zero: a library that hides its empty shelves does not tell somebody what
   the library is FOR, and on a fresh install that is all of them. */
export function shelved(list, query = "") {
  const q = String(query || "").trim().toLowerCase();
  const hit = (v) => !q || [v.title, v.channel, v.note,
    ...(v.refs || []).map((r) => r.name)].some((x) => String(x || "").toLowerCase().includes(q));
  const items = (Array.isArray(list) ? list : []).filter(hit);
  return SHELVES.map((s) => ({
    ...s,
    videos: items.filter((v) => v.shelf === s.id)
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)),
  }));
}
