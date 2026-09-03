/* ============================================================
   photos.js — capture, compress, store, archive.

   Local first, always. A photo is captured, compressed and saved
   on the device whether or not Drive is connected, whether or not
   there is any signal. Drive is a place old originals go when the
   phone runs out of room, never a dependency for taking a picture.

   Every photo keeps a small thumbnail on the device permanently,
   even after the full-size original has been archived away. That
   is what makes an old catch still show something instantly, with
   no connection.
   ============================================================ */

const DB_NAME = "lfc";
const DB_VERSION = 2;
const KV = "kv";
const PHOTOS = "photos";

export const FULL_MAX = 1600;      // longest edge of the stored original
export const THUMB_MAX = 240;      // longest edge of the permanent thumbnail
export const FULL_QUALITY = 0.82;
export const THUMB_QUALITY = 0.7;
export const ARCHIVE_THRESHOLD = 0.8;   // archive once 80% of quota is used

/* ---------------- database ---------------- */

let dbp = null;
function db() {
  if (dbp !== null) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (!window.indexedDB) return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const d = req.result;
        if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV);
        if (!d.objectStoreNames.contains(PHOTOS)) d.createObjectStore(PHOTOS, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
      setTimeout(() => resolve(null), 4000);
    } catch { resolve(null); }
  });
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  if (!d || !d.objectStoreNames.contains(PHOTOS)) return { ok: false, error: "photo storage unavailable" };
  return new Promise((resolve) => {
    try {
      const t = d.transaction(PHOTOS, mode);
      const req = fn(t.objectStore(PHOTOS));
      req.onsuccess = () => resolve({ ok: true, value: req.result });
      req.onerror = () => resolve({ ok: false, error: req.error?.message || "storage error" });
      t.onabort = () => resolve({ ok: false, error: t.error?.message || "storage aborted" });
    } catch (err) { resolve({ ok: false, error: err?.message || "storage error" }); }
  });
}

/* ---------------- compression ---------------- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file could not be read as an image."));
    img.src = src;
  });
}

function drawScaled(img, maxEdge, quality) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("That image has no dimensions.");
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not process the image.");
  ctx.drawImage(img, 0, 0, cw, ch);
  return new Promise((resolve) => canvas.toBlob(
    (b) => resolve(b), "image/jpeg", quality));
}

const blobToDataURL = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result));
  fr.onerror = () => reject(new Error("Could not encode the image."));
  fr.readAsDataURL(blob);
});

/* Turn a camera/file pick into a stored photo record. */
export async function processAndStore(file, { catchId } = {}) {
  if (!file) return { ok: false, error: "No photo chosen." };
  if (!/^image\//.test(file.type || "")) return { ok: false, error: "That file isn't an image." };
  if (file.size > 40 * 1024 * 1024) return { ok: false, error: "That image is over 40 MB — too large to process." };

  let src;
  try { src = URL.createObjectURL(file); }
  catch { return { ok: false, error: "Could not read that photo." }; }

  try {
    const img = await loadImage(src);
    const [full, thumbBlob] = await Promise.all([
      drawScaled(img, FULL_MAX, FULL_QUALITY),
      drawScaled(img, THUMB_MAX, THUMB_QUALITY),
    ]);
    if (!full || !thumbBlob) return { ok: false, error: "Could not compress that photo." };

    const thumb = await blobToDataURL(thumbBlob);
    const rec = {
      id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      catchId: catchId || null,
      blob: full,                 // full-size, dropped once archived
      thumb,                      // permanent, tiny, always available
      bytes: full.size,
      w: img.naturalWidth, h: img.naturalHeight,
      takenAt: Date.now(),
      driveId: null,
      archivedAt: null,
    };
    const w = await tx("readwrite", (s) => s.put(rec));
    if (!w.ok) return { ok: false, error: `Photo could not be saved: ${w.error}` };
    return { ok: true, photo: rec };
  } catch (err) {
    return { ok: false, error: (err && err.message) || "Could not process that photo." };
  } finally {
    try { URL.revokeObjectURL(src); } catch { /* ignore */ }
  }
}

export async function getPhoto(id) {
  if (!id) return { ok: false, error: "no id" };
  const r = await tx("readonly", (s) => s.get(id));
  if (!r.ok) return r;
  if (!r.value) return { ok: false, error: "not found" };
  return { ok: true, photo: r.value };
}

export async function allPhotos() {
  const r = await tx("readonly", (s) => s.getAll());
  if (!r.ok) return { ok: false, error: r.error, photos: [] };
  return { ok: true, photos: r.value || [] };
}

export async function putPhoto(rec) {
  return tx("readwrite", (s) => s.put(rec));
}

export async function deletePhoto(id) {
  return tx("readwrite", (s) => s.delete(id));
}

/* An object URL for the full-size local blob, if we still have it. */
export function localURL(photo) {
  if (!photo || !photo.blob) return null;
  try { return URL.createObjectURL(photo.blob); } catch { return null; }
}

/* ---------------- storage pressure ---------------- */

export async function storageStatus() {
  try {
    if (!navigator.storage?.estimate) {
      return { ok: false, supported: false, error: "This browser doesn't report storage usage." };
    }
    const est = await navigator.storage.estimate();
    const usage = Number(est.usage || 0), quota = Number(est.quota || 0);
    const ratio = quota > 0 ? usage / quota : 0;
    let persisted = false;
    try { persisted = await navigator.storage.persisted?.() || false; } catch { /* ignore */ }
    return {
      ok: true, supported: true, usage, quota, ratio, persisted,
      pressured: quota > 0 && ratio >= ARCHIVE_THRESHOLD,
    };
  } catch (err) {
    return { ok: false, supported: false, error: (err && err.message) || "could not read storage usage" };
  }
}

export const fmtBytes = (n) => {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

/* Which photos would be archived, oldest first. Only ones that
   still hold a full-size blob are candidates. */
export async function archiveCandidates() {
  const r = await allPhotos();
  if (!r.ok) return { ok: false, error: r.error, list: [] };
  const list = r.photos
    .filter((p) => p.blob && !p.archivedAt)
    .sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
  return { ok: true, list, bytes: list.reduce((n, p) => n + (p.bytes || 0), 0) };
}

/* ---------------- archiving ----------------
   Upload first. Verify it succeeded. Only then drop the local
   original. Never the other order — a failed upload must never
   cost someone a photo. The thumbnail is always kept. */

export async function archivePhotos(photos, uploader, { onProgress } = {}) {
  const results = { archived: 0, freed: 0, failed: 0, errors: [] };
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (onProgress) onProgress({ index: i, total: photos.length, photo: p });
    if (!p.blob) continue;
    try {
      const name = `catch-${new Date(p.takenAt || Date.now()).toISOString().slice(0, 10)}-${p.id}.jpg`;
      const up = await uploader(p.blob, name, "image/jpeg");
      if (!up || !up.ok || !up.id) {
        results.failed++;
        if (up?.error) results.errors.push(up.error);
        if (up?.error === "needs-signin") break;   // no point hammering
        continue;
      }
      const bytes = p.bytes || 0;
      const updated = { ...p, blob: null, driveId: up.id, driveLink: up.link || null, archivedAt: Date.now() };
      const w = await putPhoto(updated);
      if (!w.ok) { results.failed++; results.errors.push(w.error); continue; }
      results.archived++; results.freed += bytes;
    } catch (err) {
      results.failed++;
      results.errors.push((err && err.message) || "unknown error");
    }
  }
  return results;
}

/* Enough oldest photos to get back under the threshold, with a
   little headroom so it does not re-trigger on the next open. */
export async function planArchive(targetRatio = 0.6) {
  const st = await storageStatus();
  if (!st.ok || !st.quota) return { ok: false, error: st.error || "unknown storage", list: [] };
  const target = st.quota * targetRatio;
  const need = Math.max(0, st.usage - target);
  const cand = await archiveCandidates();
  if (!cand.ok) return { ok: false, error: cand.error, list: [] };

  const list = [];
  let freed = 0;
  for (const p of cand.list) {
    if (freed >= need) break;
    list.push(p); freed += p.bytes || 0;
  }
  return { ok: true, list, freed, need, status: st };
}
