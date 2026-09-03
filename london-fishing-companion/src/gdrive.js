/* ============================================================
   gdrive.js — per-user Google Drive backup.

   Each person signs into their OWN Google account and their files
   land in THEIR Drive. Nothing routes through anyone else's account.

   Scope is drive.file only: the app can see and touch files it
   created itself, and nothing else in the person's Drive. It is
   the narrowest scope that does the job, and it is what keeps the
   consent screen honest.

   Files are created PRIVATE. They are read back by re-fetching
   with the person's own access token, never via a shareable link.

   Design rules, same as services.js:
     - never throws to the caller
     - always returns { ok, ... } or { ok:false, error }
     - the app is fully usable if this is never connected at all
   ============================================================ */

const GIS_SRC = "https://accounts.google.com/gsi/client";
export const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "London Fishing Companion";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

/* The deployer sets this once. index.html defines window.LFC_GOOGLE_CLIENT_ID;
   a person can also paste their own into the app if they self-host. */
export function clientId() {
  if (typeof window === "undefined") return "";
  return (window.LFC_GOOGLE_CLIENT_ID || "").trim();
}

export function driveSupported() {
  if (typeof window === "undefined") return { ok: false, error: "no browser" };
  if (!/^https?:$/.test(window.location.protocol)) {
    return { ok: false, error: "Google sign-in needs the app to be opened from a web address. It doesn't work in the single-file version opened straight from a file." };
  }
  if (!clientId()) {
    return { ok: false, error: "No Google client ID is configured for this copy of the app." };
  }
  return { ok: true };
}

/* ---------- loading Google's script ---------- */

let gisPromise = null;
function loadGIS() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) return resolve(true);
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(!!window.google?.accounts?.oauth2));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const s = document.createElement("script");
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve(!!window.google?.accounts?.oauth2);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
    setTimeout(() => resolve(!!window.google?.accounts?.oauth2), 12000);
  });
  return gisPromise;
}

/* ---------- token handling ----------
   Browser-only apps get short-lived access tokens, not refresh
   tokens — that is Google's current guidance and it is not a
   limitation we can engineer around without a server holding a
   client secret. So: keep the token in memory, try a silent
   refresh first, and fall back to a visible prompt. */

let token = null;        // { value, expiresAt }
let tokenClient = null;

const tokenValid = () => token && token.value && Date.now() < token.expiresAt - 60000;
export const isConnected = () => tokenValid();
export function forgetToken() { token = null; }

async function ensureClient() {
  const sup = driveSupported();
  if (!sup.ok) return sup;
  const loaded = await loadGIS();
  if (!loaded) return { ok: false, error: "Could not load Google's sign-in script. Check your connection." };
  if (!tokenClient) {
    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId(), scope: SCOPE, callback: () => {},
      });
    } catch (err) {
      return { ok: false, error: (err && err.message) || "Could not start Google sign-in." };
    }
  }
  return { ok: true };
}

/* interactive = true shows the account picker. false attempts a
   silent refresh, which works while Google still has a session. */
export async function connect({ interactive = true } = {}) {
  if (tokenValid()) return { ok: true, cached: true };
  const c = await ensureClient();
  if (!c.ok) return c;

  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    try {
      tokenClient.callback = (resp) => {
        if (resp && resp.access_token) {
          token = {
            value: resp.access_token,
            expiresAt: Date.now() + (Number(resp.expires_in || 3600) * 1000),
          };
          done({ ok: true });
        } else {
          done({ ok: false, error: resp?.error_description || resp?.error || "Sign-in was not completed." });
        }
      };
      tokenClient.error_callback = (err) => {
        const t = err?.type;
        done({
          ok: false,
          cancelled: t === "popup_closed" || t === "popup_failed_to_open",
          error: t === "popup_failed_to_open"
            ? "The sign-in popup was blocked. Allow popups for this site and try again."
            : (err?.message || "Sign-in was cancelled."),
        });
      };
      tokenClient.requestAccessToken({ prompt: interactive ? "" : "none" });
      setTimeout(() => done({ ok: false, error: "Sign-in timed out." }), 90000);
    } catch (err) {
      done({ ok: false, error: (err && err.message) || "Sign-in failed to start." });
    }
  });
}

/* Try to get usable auth without bothering the person. */
async function auth() {
  if (tokenValid()) return { ok: true };
  const silent = await connect({ interactive: false });
  if (silent.ok) return silent;
  return { ok: false, error: "needs-signin" };
}

async function api(url, opts = {}) {
  const a = await auth();
  if (!a.ok) return a;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeout || 45000);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${token.value}`, ...(opts.headers || {}) },
    });
    if (res.status === 401 || res.status === 403) {
      token = null;
      return { ok: false, error: "needs-signin" };
    }
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json())?.error?.message || ""; } catch { /* ignore */ }
      return { ok: false, error: detail || `Drive returned ${res.status}` };
    }
    if (opts.raw) return { ok: true, res };
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err?.name === "AbortError" ? "timed out" : (err?.message || "network error") };
  } finally { clearTimeout(timer); }
}

/* ---------- the app's folder ---------- */

let folderId = null;

export async function ensureFolder() {
  if (folderId) return { ok: true, id: folderId };
  const q = encodeURIComponent(
    `mimeType='${FOLDER_MIME}' and name='${FOLDER_NAME}' and trashed=false`);
  const found = await api(`${API}/files?q=${q}&fields=files(id,name)&pageSize=1`);
  if (!found.ok) return found;
  if (found.data?.files?.length) {
    folderId = found.data.files[0].id;
    return { ok: true, id: folderId };
  }
  const made = await api(`${API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  if (!made.ok) return made;
  folderId = made.data.id;
  return { ok: true, id: folderId };
}

/* ---------- upload ----------
   Multipart: metadata part then the bytes. Files are created with
   default permissions, i.e. private to the owner. We never call
   permissions.create, so nothing is ever shared by link. */

export async function uploadBlob(blob, name, mimeType, { existingId } = {}) {
  const f = await ensureFolder();
  if (!f.ok) return f;

  const boundary = "lfc" + Math.random().toString(36).slice(2);
  const meta = existingId
    ? { name }
    : { name, parents: [f.id] };

  const head =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = new Blob([head, blob, tail], { type: `multipart/related; boundary=${boundary}` });

  const url = existingId
    ? `${UPLOAD}/${existingId}?uploadType=multipart&fields=id,name,webViewLink`
    : `${UPLOAD}?uploadType=multipart&fields=id,name,webViewLink`;

  const r = await api(url, {
    method: existingId ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!r.ok) return r;
  return { ok: true, id: r.data.id, name: r.data.name, link: r.data.webViewLink || null };
}

export async function uploadJSON(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  return uploadBlob(blob, name, "application/json");
}

/* ---------- read back ----------
   Private files cannot be used directly as an <img src>. We fetch
   the bytes with the person's own token and hand back an object URL. */

const urlCache = new Map();

export async function fetchPhotoURL(fileId) {
  if (!fileId) return { ok: false, error: "no file id" };
  if (urlCache.has(fileId)) return { ok: true, url: urlCache.get(fileId), cached: true };
  const r = await api(`${API}/files/${fileId}?alt=media`, { raw: true, timeout: 30000 });
  if (!r.ok) return r;
  try {
    const blob = await r.res.blob();
    const url = URL.createObjectURL(blob);
    urlCache.set(fileId, url);
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: (err && err.message) || "could not read the file" };
  }
}

export function releasePhotoURLs() {
  for (const url of urlCache.values()) { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }
  urlCache.clear();
}

export async function listBackups() {
  const f = await ensureFolder();
  if (!f.ok) return f;
  const q = encodeURIComponent(`'${f.id}' in parents and trashed=false`);
  const r = await api(`${API}/files?q=${q}&fields=files(id,name,size,modifiedTime,mimeType)&orderBy=modifiedTime desc&pageSize=100`);
  if (!r.ok) return r;
  return { ok: true, files: r.data.files || [] };
}

export async function accountEmail() {
  const a = await auth();
  if (!a.ok) return { ok: false, error: a.error };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(`${API}/about?fields=user(emailAddress,displayName),storageQuota`, {
      headers: { Authorization: `Bearer ${token.value}` }, signal: ctl.signal,
    });
    if (!res.ok) return { ok: false, error: `Drive returned ${res.status}` };
    const d = await res.json();
    return { ok: true, email: d?.user?.emailAddress || "", name: d?.user?.displayName || "", quota: d?.storageQuota || null };
  } catch (err) {
    return { ok: false, error: err?.message || "network error" };
  } finally { clearTimeout(timer); }
}

export function signOut() {
  try {
    if (token?.value && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(token.value, () => {});
    }
  } catch { /* ignore */ }
  forgetToken();
  releasePhotoURLs();
  folderId = null;
  return { ok: true };
}
