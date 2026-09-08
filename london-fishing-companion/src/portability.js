/* ============================================================
   portability.js — export, import, merge, migrate.

   Two deliberately separate export kinds:
     PACK — what you know. Custom spots, species, baits, knots,
            tips. Safe to hand to another angler.
     LOG  — what you caught. Trips, catches, photos. Yours.
     FULL — both, for your own backup.

   Import never overwrites blindly. It validates the file, works
   out exactly what would change, and reports that before anything
   is written.
   ============================================================ */

export const SCHEMA_VERSION = 2;
export const APP_ID = "london-fishing-companion";

export const KIND = { PACK: "pack", LOG: "log", FULL: "full" };

/* "tactics" joined this list when custom tactics were allowed to travel in
   community packs. Every consumer below reads cat[k] with an || [] or an
   Array.isArray guard, so a catalog written before tactics existed still
   loads - the key simply arrives empty and fills in on first use. */
export const CATALOG_KEYS = ["spots", "species", "baits", "knots", "tips", "tactics"];

export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

/* ---------------- migration ----------------
   Every stored record carries a schema version. Old records get
   defaults for fields added later rather than rendering broken. */

export function migrateRecord(rec, kind) {
  if (!rec || typeof rec !== "object") return null;
  const v = Number(rec._v) || 1;
  const out = { ...rec };

  if (v < 2) {
    // v2 added: coordinates and gauge station on spots, updatedAt everywhere,
    // knots as user-editable data.
    if (kind === "spot") {
      if (!Array.isArray(out.ll) && (out.lat != null && out.lon != null)) out.ll = [out.lat, out.lon];
      if (out.hydroStation === undefined) out.hydroStation = "";
    }
    if (out.updatedAt === undefined) out.updatedAt = 0;
  }

  out._v = SCHEMA_VERSION;
  return out;
}

export function migrateStore(store) {
  const s = store && typeof store === "object" ? store : {};
  const cat = s.catalog && typeof s.catalog === "object" ? s.catalog : {};
  return {
    trips: (Array.isArray(s.trips) ? s.trips : []).map((r) => migrateRecord(r, "trip")).filter(Boolean),
    catches: (Array.isArray(s.catches) ? s.catches : []).map((r) => migrateRecord(r, "catch")).filter(Boolean),
    catalog: CATALOG_KEYS.reduce((acc, k) => {
      const kind = k.replace(/s$/, "");
      acc[k] = (Array.isArray(cat[k]) ? cat[k] : []).map((r) => migrateRecord(r, kind)).filter(Boolean);
      return acc;
    }, { photos: (cat.photos && typeof cat.photos === "object") ? cat.photos : {} }),
  };
}

/* ---------------- export ---------------- */

/* `catchPhotos` comes from photos.js (the IndexedDB store). It is NOT
   catalog.photos, which is the override-picture map for spots and baits.
   Two different things, unfortunately both called photos. */
export function buildExport(kind, { catalog, log, note, catchPhotos }) {
  const cat = catalog || {};
  const lg = log || {};
  const pics = Array.isArray(catchPhotos) ? catchPhotos : [];
  const base = {
    app: APP_ID,
    schema: SCHEMA_VERSION,
    kind,
    exportedAt: new Date().toISOString(),
    note: note || "",
  };

  if (kind === KIND.PACK) {
    return {
      ...base,
      catalog: CATALOG_KEYS.reduce((a, k) => {
        // Only user-created entries travel. Built-in content already
        // exists in every copy of the app; shipping it would create
        // duplicates on import.
        a[k] = (cat[k] || []).filter((x) => x && x.custom);
        return a;
      }, {}),
    };
  }
  if (kind === KIND.LOG) {
    return {
      ...base, trips: lg.trips || [], catches: lg.catches || [],
      photos: cat.photos || {}, catchPhotos: pics,
    };
  }
  return {
    ...base,
    catalog: CATALOG_KEYS.reduce((a, k) => { a[k] = (cat[k] || []).filter((x) => x && x.custom); return a; },
      { photos: cat.photos || {} }),
    trips: lg.trips || [], catches: lg.catches || [], catchPhotos: pics,
  };
}

export function exportFilename(kind) {
  const d = new Date().toISOString().slice(0, 10);
  const stem = kind === KIND.PACK ? "field-guide-pack" : kind === KIND.LOG ? "fishing-log" : "fishing-everything";
  return `lfc-${stem}-${d}.json`;
}

/* ---------------- validation ----------------
   A corrupted or hostile file must be rejected whole, never
   partially merged. Returns { ok, errors[], warnings[], data }. */

const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

function validateRecordList(list, label, errors, warnings, requireName, field) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) { errors.push(`"${field || label}" should be a list.`); return []; }
  const good = [];
  let dropped = 0;
  const seen = new Set();
  for (const r of list) {
    if (!isObj(r)) { dropped++; continue; }
    if (typeof r.id !== "string" || !r.id) { dropped++; continue; }
    if (seen.has(r.id)) { dropped++; continue; }
    if (requireName && (typeof r.name !== "string" || !r.name.trim())) { dropped++; continue; }
    seen.add(r.id);
    good.push(r);
  }
  if (dropped) warnings.push(`${dropped} unusable ${label} ${dropped === 1 ? "entry was" : "entries were"} skipped.`);
  return good;
}

/* Catch photos have their own shape — an id plus image data, no name and
   no updatedAt — so they get their own check rather than being forced
   through validateRecordList. An entry carrying neither a thumbnail nor a
   full image is worthless and is dropped. */
function validateCatchPhotos(list, errors, warnings) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) { errors.push('"catchPhotos" should be a list.'); return []; }
  const good = [];
  let dropped = 0;
  const seen = new Set();
  const isImg = (s) => typeof s === "string" && /^data:image\//.test(s);
  for (const p of list) {
    if (!isObj(p) || typeof p.id !== "string" || !p.id || seen.has(p.id)) { dropped++; continue; }
    const thumb = isImg(p.thumb) ? p.thumb : "";
    const full = isImg(p.full) ? p.full : null;
    if (!thumb && !full) { dropped++; continue; }
    seen.add(p.id);
    good.push({
      id: p.id,
      catchId: typeof p.catchId === "string" ? p.catchId : null,
      thumb, full,
      type: typeof p.type === "string" ? p.type : "image/jpeg",
      bytes: Number(p.bytes) || 0,
      w: Number(p.w) || null, h: Number(p.h) || null,
      takenAt: Number(p.takenAt) || 0,
      driveId: typeof p.driveId === "string" ? p.driveId : null,
      driveLink: typeof p.driveLink === "string" ? p.driveLink : null,
      archivedAt: Number(p.archivedAt) || null,
    });
  }
  if (dropped) warnings.push(`${dropped} unusable photo ${dropped === 1 ? "entry was" : "entries were"} skipped.`);
  return good;
}

export function validateImport(text) {
  const errors = [], warnings = [];
  let raw;

  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, errors: ["That file is empty."], warnings, data: null };
  }
  // Generous, because a Log export now embeds full-size catch photos.
  // Still capped: a phone will not survive JSON.parse on much more.
  if (text.length > MAX_IMPORT_BYTES) {
    return { ok: false, errors: ["That file is unusually large — over 64 MB. Refusing to read it."], warnings, data: null };
  }
  try { raw = JSON.parse(text); }
  catch { return { ok: false, errors: ["That file isn't valid JSON. It may be corrupted or not an export from this app."], warnings, data: null }; }

  if (!isObj(raw)) return { ok: false, errors: ["That file doesn't contain an object at the top level."], warnings, data: null };

  if (raw.app !== APP_ID) {
    return { ok: false, errors: ["That file wasn't exported from London Fishing Companion."], warnings, data: null };
  }
  const schema = Number(raw.schema);
  if (!schema || schema < 1) {
    errors.push("That file has no readable schema version.");
  } else if (schema > SCHEMA_VERSION) {
    errors.push(`That file was made by a newer version of the app (schema ${schema}, this app reads ${SCHEMA_VERSION}). Update the app first.`);
  }
  if (![KIND.PACK, KIND.LOG, KIND.FULL].includes(raw.kind)) {
    warnings.push(`Unrecognised export kind "${raw.kind}" — treating it as a full backup.`);
  }
  if (errors.length) return { ok: false, errors, warnings, data: null };

  const cat = isObj(raw.catalog) ? raw.catalog : {};
  const data = {
    kind: raw.kind || KIND.FULL,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : null,
    note: typeof raw.note === "string" ? raw.note : "",
    catalog: {
      spots: validateRecordList(cat.spots, "spot", errors, warnings, true, "spots"),
      species: validateRecordList(cat.species, "species", errors, warnings, true, "species"),
      baits: validateRecordList(cat.baits, "bait", errors, warnings, true, "baits"),
      knots: validateRecordList(cat.knots, "knot", errors, warnings, true, "knots"),
      tips: validateRecordList(cat.tips, "tip", errors, warnings, false, "tips"),
      tactics: validateRecordList(cat.tactics, "tactic", errors, warnings, true, "tactics"),
      photos: isObj(cat.photos) ? cat.photos : (isObj(raw.photos) ? raw.photos : {}),
    },
    trips: validateRecordList(raw.trips, "trip", errors, warnings, false, "trips"),
    catches: validateRecordList(raw.catches, "catch", errors, warnings, false, "catches"),
    catchPhotos: validateCatchPhotos(raw.catchPhotos, errors, warnings),
  };

  const total = data.trips.length + data.catches.length + data.catchPhotos.length +
    CATALOG_KEYS.reduce((n, k) => n + data.catalog[k].length, 0);
  if (total === 0) warnings.push("That file contains nothing importable.");

  return { ok: errors.length === 0, errors, warnings, data };
}

/* ---------------- merge ----------------
   Union by id. Newer updatedAt wins. Identical to the rule the
   Google Sheets sync already uses, so the two never disagree. */

export function mergeList(existing = [], incoming = []) {
  const map = new Map();
  let added = 0, updated = 0, unchanged = 0;

  for (const r of existing) if (r && r.id) map.set(r.id, r);

  for (const r of incoming) {
    if (!r || !r.id) continue;
    const have = map.get(r.id);
    if (!have) { map.set(r.id, migrateRecord({ ...r, custom: true }, "any")); added++; continue; }
    const a = Number(r.updatedAt || 0), b = Number(have.updatedAt || 0);
    if (a > b) { map.set(r.id, migrateRecord({ ...r, custom: have.custom ?? true }, "any")); updated++; }
    else unchanged++;
  }
  return { list: [...map.values()], added, updated, unchanged };
}

export function planImport(current, incoming) {
  const cat = current.catalog || {};
  const log = current.log || {};
  const inc = incoming || {};
  const incCat = inc.catalog || {};

  const summary = {};
  const nextCatalog = { ...cat };

  for (const k of CATALOG_KEYS) {
    const r = mergeList(cat[k] || [], incCat[k] || []);
    nextCatalog[k] = r.list;
    summary[k] = { added: r.added, updated: r.updated, unchanged: r.unchanged };
  }

  const photosBefore = Object.keys(cat.photos || {}).length;
  nextCatalog.photos = { ...(cat.photos || {}), ...(incCat.photos || {}) };
  summary.photos = {
    added: Object.keys(nextCatalog.photos).length - photosBefore,
    updated: 0, unchanged: photosBefore,
  };

  const t = mergeList(log.trips || [], inc.trips || []);
  const c = mergeList(log.catches || [], inc.catches || []);
  summary.trips = { added: t.added, updated: t.updated, unchanged: t.unchanged };
  summary.catches = { added: c.added, updated: c.updated, unchanged: c.unchanged };

  /* Catch photos are counted here for the preview, but written by
     photos.js on commit — they live in IndexedDB, not in this store.
     `current.photoIds` is the set already on this device. */
  const incPhotos = Array.isArray(inc.catchPhotos) ? inc.catchPhotos : [];
  const known = current.photoIds instanceof Set
    ? current.photoIds
    : new Set(Array.isArray(current.photoIds) ? current.photoIds : []);
  let picAdded = 0, picUnchanged = 0;
  for (const p of incPhotos) { if (known.has(p.id)) picUnchanged++; else picAdded++; }
  summary.catchPhotos = { added: picAdded, updated: 0, unchanged: picUnchanged };

  const totals = Object.values(summary).reduce(
    (a, s) => ({ added: a.added + s.added, updated: a.updated + s.updated, unchanged: a.unchanged + s.unchanged }),
    { added: 0, updated: 0, unchanged: 0 }
  );

  return {
    summary, totals,
    next: {
      catalog: nextCatalog,
      log: { trips: t.list, catches: c.list },
      catchPhotos: incPhotos,
    },
  };
}

export const LABELS = {
  spots: "spots", species: "species", baits: "baits & lures", knots: "knots",
  tips: "tips", tactics: "tactics", photos: "spot & bait pictures", trips: "trips", catches: "catches",
  catchPhotos: "catch photos",
};

export function summaryLines(summary) {
  return Object.entries(summary)
    .filter(([, s]) => s.added || s.updated)
    .map(([k, s]) => {
      const bits = [];
      if (s.added) bits.push(`${s.added} new`);
      if (s.updated) bits.push(`${s.updated} updated`);
      return `${bits.join(", ")} ${LABELS[k] || k}`;
    });
}

/* ---------------- file helpers ---------------- */

export function downloadJSON(obj, filename) {
  try {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.rel = "noopener";
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) || "could not create the file" };
  }
}

export async function shareJSON(obj, filename) {
  const text = JSON.stringify(obj, null, 2);
  try {
    if (navigator.canShare && typeof File !== "undefined") {
      const file = new File([text], filename, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return { ok: true, via: "share" };
      }
    }
  } catch (err) {
    if (err && err.name === "AbortError") return { ok: false, cancelled: true };
  }
  return { ...downloadJSON(obj, filename), via: "download" };
}

export function readFile(file) {
  return new Promise((resolve) => {
    if (!file) return resolve({ ok: false, error: "No file chosen." });
    if (file.size > MAX_IMPORT_BYTES) return resolve({ ok: false, error: "That file is over 64 MB — refusing to read it." });
    const fr = new FileReader();
    fr.onload = () => resolve({ ok: true, text: String(fr.result || "") });
    fr.onerror = () => resolve({ ok: false, error: "Could not read that file." });
    try { fr.readAsText(file); } catch { resolve({ ok: false, error: "Could not read that file." }); }
  });
}
