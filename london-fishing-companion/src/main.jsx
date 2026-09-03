/* ============================================================
   Hosted build entry point.

   Storage is three-tier on purpose. A one-file app can be opened
   in contexts where the usual APIs are missing or throw (a local
   file:// origin, a private window, an iOS Quick Look preview),
   and losing a season's catch log to a silent storage failure is
   unacceptable. So: IndexedDB, then localStorage, then memory —
   and the app is told which one it actually got.
   ============================================================ */

const DB_NAME = "lfc", STORE = "kv", LS = "lfc-store:";
const DB_VERSION = 2;   // v2 adds the "photos" store — must match photos.js
const mem = new Map();

let health = { tier: "memory", persisted: false, warning: "" };
export const storageHealth = () => health;

/* ---- tier 1: IndexedDB ---- */
let dbp = null;
function db() {
  if (dbp !== null) return dbp;
  dbp = new Promise((res) => {
    try {
      if (!window.indexedDB) return res(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        try { if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE); } catch (e) { /* exists */ }
        try { if (!d.objectStoreNames.contains("photos")) d.createObjectStore("photos", { keyPath: "id" }); } catch (e) { /* exists */ }
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
      req.onblocked = () => res(null);
      setTimeout(() => res(null), 3000);   // some private modes hang instead of failing
    } catch (e) { res(null); }
  });
  return dbp;
}
async function idb(mode, fn) {
  const d = await db();
  if (!d) return { ok: false };
  return new Promise((res) => {
    try {
      const tx = d.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => res({ ok: true, value: req.result });
      req.onerror = () => res({ ok: false });
      tx.onabort = () => res({ ok: false });
    } catch (e) { res({ ok: false }); }
  });
}

/* ---- tier 2: localStorage ---- */
const lsGet = (k) => { try { return localStorage.getItem(LS + k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(LS + k, v); return true; } catch (e) { return false; } };
const lsDel = (k) => { try { localStorage.removeItem(LS + k); } catch (e) { /* ignore */ } };

/* ---- the shim the app talks to ---- */
if (!window.storage) {
  window.storage = {
    async get(key) {
      const r = await idb("readonly", (s) => s.get(key));
      let v = r.ok && r.value != null ? r.value : null;
      if (v == null) v = lsGet(key);
      if (v == null && mem.has(key)) v = mem.get(key);
      if (v == null) throw new Error("not found: " + key);
      return { key, value: v, shared: false };
    },
    async set(key, value) {
      mem.set(key, value);                       // always succeeds
      const a = await idb("readwrite", (s) => s.put(value, key));
      const b = lsSet(key, value);
      if (!a.ok && !b) {
        // memory still holds it for this session, but say so honestly
        throw new Error("storage unavailable — this change will not survive a reload");
      }
      return { key, value, shared: false };
    },
    async delete(key) {
      mem.delete(key); lsDel(key);
      await idb("readwrite", (s) => s.delete(key));
      return { key, deleted: true, shared: false };
    },
    async list(prefix = "") {
      const keys = new Set();
      for (const k of mem.keys()) if (k.startsWith(prefix)) keys.add(k);
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(LS + prefix)) keys.add(k.slice(LS.length));
        }
      } catch (e) { /* ignore */ }
      return { keys: [...keys], prefix, shared: false };
    },
  };
}

/* ---- work out which tier we actually got, and ask to keep it ---- */
async function probeStorage() {
  const probe = "__lfc_probe__";
  const d = await db();
  if (d) {
    const w = await idb("readwrite", (s) => s.put("1", probe));
    if (w.ok) { health.tier = "indexeddb"; await idb("readwrite", (s) => s.delete(probe)); }
  }
  if (health.tier !== "indexeddb" && lsSet(probe, "1")) { health.tier = "localstorage"; lsDel(probe); }

  if (health.tier === "memory") {
    health.warning = "This device isn't letting the app save anything. Your log will vanish when you close it. Export a backup from the Data tab before you rely on it.";
  } else if (location.protocol === "file:") {
    health.warning = "Opened directly from a file. Saving works but some browsers clear it without warning — export a backup from the Data tab regularly.";
  }

  // Ask the browser not to evict us. Best effort; never blocks anything.
  try {
    if (navigator.storage && navigator.storage.persist) {
      health.persisted = await navigator.storage.persisted?.() || false;
      if (!health.persisted) health.persisted = await navigator.storage.persist();
    }
  } catch (e) { /* not supported — fine */ }
}

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

function boot() {
  const el = document.getElementById("root");
  try {
    createRoot(el).render(<App />);
  } catch (err) {
    el.innerHTML = '<div style="font-family:Georgia,serif;padding:32px;max-width:32em;margin:0 auto">' +
      '<h1 style="font-size:24px">Something went wrong starting the app</h1>' +
      '<p style="color:#59654F">' + String(err && err.message || err) + '</p>' +
      '<p style="color:#59654F">Reloading the page usually fixes it. Your saved data has not been touched.</p></div>';
  }
}

probeStorage().finally(() => {
  if (health.warning) window.__LFC_STORAGE_WARNING__ = health.warning;
  boot();
});

/* Hosted build only: the service worker is what makes the app launch with
   no signal at all. Registration failing is never fatal. */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service worker did not register; the app still works online.", err);
    });
  });
}
