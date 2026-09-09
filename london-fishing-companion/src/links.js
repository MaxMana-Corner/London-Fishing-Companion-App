/* links.js — reference links on a record.

   Any record can carry up to three: an article, a video, a regulation page.
   They travel in community packs, which is what makes the rules here matter
   more than they look.

   WHERE THE SAFETY CHECK LIVES, AND WHY IT IS NOT ALL IN HERE

   The owner asked for a list of words that stop a url being shared. That list
   exists - moderation/url-blocklist.txt in the packs repository, 95 terms -
   and it deliberately stays there rather than being bundled into the app:

     - it is tunable by pull request, without shipping a new app build
     - both gates that can actually refuse a submission already read it: the
       Apps Script bridge and the GitHub Action on the pull request
     - a copy in the bundle would drift from it, and the copy people would be
       relying on is whichever one is older

   So this module does the STRUCTURAL check, which is the part that must work
   offline and cannot be tuned away: is this a real http(s) address, and is it
   a link whose destination can be known at all. A url shortener is refused
   outright here for that second reason - the whole point of one is that the
   address does not tell you where it goes, so no word list can ever screen it.

   The word check then runs at submission time, where the list lives, and a
   human reads every submission after that. Three gates, none pretending to be
   the others. */

export const MAX_LINKS = 3;

/* Shorteners hide their destination by design, so nothing downstream can
   judge them. Not exhaustive and not meant to be - it is the common ones,
   and anything missed is caught by a person. */
const SHORTENERS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
  "adf.ly", "shorte.st", "cutt.ly", "rb.gy", "rebrand.ly", "tiny.cc",
  "shorturl.at", "s.id", "t.ly", "lnkd.in",
];

export function normaliseUrl(raw) {
  const t = String(raw || "").trim();
  if (!t) return null;
  /* A bare "example.com/page" is what people actually type. Assume https
     rather than rejecting it - but only when it looks like a host, so that
     "javascript:alert(1)" cannot be rescued into "https://javascript:...". */
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : "https://" + t;
  let u;
  try { u = new URL(withScheme); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || !u.hostname.includes(".")) return null;
  return u.toString();
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export function isShortener(url) {
  const h = hostOf(url);
  return SHORTENERS.some((s) => h === s || h.endsWith("." + s));
}

/* Structural verdict. Returns { ok } or { ok:false, reason } where the reason
   is written to be shown to a person, not logged. */
export function checkLink(raw) {
  const url = normaliseUrl(raw);
  if (!url) return { ok: false, reason: "That does not look like a web address." };
  if (isShortener(url)) {
    return {
      ok: false,
      reason: "Shortened links cannot be shared, because there is no way to tell where they go. Paste the full address instead.",
      url,
    };
  }
  return { ok: true, url };
}

/* The owner's call: show the label, not the address. A raw url is noise in a
   sentence, and a long one wrecks the layout of a card. If somebody does not
   name it, name it after the site - "youtube.com" tells you more about what
   you are about to open than the first forty characters of the url do. */
export function labelFor(url, given) {
  const g = String(given || "").trim();
  if (g) return g.slice(0, 60);
  const h = hostOf(url);
  return h || "Link";
}

export function addLink(links, raw, label) {
  const list = Array.isArray(links) ? links : [];
  const v = checkLink(raw);
  if (!v.ok) return { links: list, error: v.reason };
  if (list.length >= MAX_LINKS) {
    return { links: list, error: `Three links is the limit. Remove one first.` };
  }
  if (list.some((l) => l.url === v.url)) {
    return { links: list, error: "That link is already on this record." };
  }
  return { links: [...list, { url: v.url, label: labelFor(v.url, label) }], error: null };
}

export function removeLink(links, url) {
  return (Array.isArray(links) ? links : []).filter((l) => l.url !== url);
}

/* Validates a links array arriving from a pack or an import. Anything that
   does not survive the structural check is dropped rather than rendered - a
   record from a stranger is not a reason to relax the rules, it is the reason
   they exist. */
export function sanitiseLinks(links) {
  const out = [];
  for (const l of Array.isArray(links) ? links : []) {
    if (!l || typeof l !== "object") continue;
    const v = checkLink(l.url);
    if (!v.ok) continue;
    if (out.some((x) => x.url === v.url)) continue;
    out.push({ url: v.url, label: labelFor(v.url, l.label) });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}
