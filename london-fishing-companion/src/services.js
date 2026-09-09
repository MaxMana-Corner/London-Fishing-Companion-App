/* ============================================================
   services.js — the only code in the app that touches the network.

   Contract every function here honours:
     - never throws to the caller
     - always returns { ok, data, cached, at, error }
     - a failure is a normal return value, not an exception
     - the caller can always render something

   This is deliberately the single choke point. If it isn't in
   this file, it doesn't make a request.
   ============================================================ */

const TIMEOUT_MS = 9000;
const WEATHER_TTL = 30 * 60 * 1000;      // 30 min — refetch after this
const HYDRO_TTL = 60 * 60 * 1000;        // hourly data, no point asking sooner
const MAX_PRESSURE_READINGS = 40;

/* ---------- low-level guarded fetch ---------- */

async function guardedFetch(url, { signal, parse = "json", timeout = TIMEOUT_MS, post = null } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  const onAbort = () => ctl.abort();
  if (signal) signal.addEventListener("abort", onAbort);
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false, error: "offline" };
    }
    const opts = { signal: ctl.signal, mode: "cors", credentials: "omit" };
    if (post !== null) {
      opts.method = "POST";
      /* text/plain on purpose. An application/json body triggers a CORS
         preflight, and Apps Script web apps cannot answer OPTIONS.
         callSync() in App.jsx does the same for the same reason. */
      opts.headers = { "Content-Type": "text/plain;charset=utf-8" };
      opts.body = post;
      opts.redirect = "follow";
    }
    const res = await fetch(url, opts);
    if (!res.ok) return { ok: false, error: `server ${res.status}` };
    const data = parse === "text" ? await res.text() : await res.json();
    return { ok: true, data };
  } catch (err) {
    const msg = err && err.name === "AbortError" ? "timed out" : (err && err.message) || "network error";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/* ---------- WMO weather codes ---------- */

const WMO = {
  0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
  77: "Snow grains", 80: "Light showers", 81: "Showers", 82: "Violent showers",
  85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};
export const describeWeather = (code) => WMO[code] || "Unknown";

export const compassPoint = (deg) => {
  if (typeof deg !== "number") return "";
  const pts = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return pts[Math.round(deg / 22.5) % 16];
};

/* ---------- Open-Meteo ----------
   Free, no API key, CORS-enabled. Parameter names verified against
   the published API contract. */

const OM_CURRENT = [
  "temperature_2m", "apparent_temperature", "relative_humidity_2m", "precipitation",
  "weather_code", "cloud_cover", "pressure_msl", "surface_pressure",
  "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
].join(",");

const OM_HOURLY = ["temperature_2m", "precipitation_probability", "wind_speed_10m", "uv_index", "cloud_cover"].join(",");
const OM_DAILY = ["weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max"].join(",");

export function weatherUrl(lat, lon) {
  const p = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    current: OM_CURRENT, hourly: OM_HOURLY, daily: OM_DAILY,
    timezone: "auto", forecast_days: "3",
  });
  return `https://api.open-meteo.com/v1/forecast?${p.toString()}`;
}

/* Shapes the raw payload into exactly what the UI needs, defensively.
   Every field is optional — a partial response still renders. */
export function shapeWeather(raw) {
  if (!raw || typeof raw !== "object") return null;
  const c = raw.current || {};
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

  const hourly = [];
  const h = raw.hourly || {};
  if (Array.isArray(h.time)) {
    for (let i = 0; i < h.time.length && i < 72; i++) {
      hourly.push({
        time: h.time[i],
        temp: num(h.temperature_2m?.[i]),
        precipProb: num(h.precipitation_probability?.[i]),
        wind: num(h.wind_speed_10m?.[i]),
        uv: num(h.uv_index?.[i]),
        cloud: num(h.cloud_cover?.[i]),
      });
    }
  }

  const daily = [];
  const d = raw.daily || {};
  if (Array.isArray(d.time)) {
    for (let i = 0; i < d.time.length; i++) {
      daily.push({
        date: d.time[i],
        code: num(d.weather_code?.[i]),
        max: num(d.temperature_2m_max?.[i]),
        min: num(d.temperature_2m_min?.[i]),
        precipProb: num(d.precipitation_probability_max?.[i]),
      });
    }
  }

  return {
    temp: num(c.temperature_2m),
    feels: num(c.apparent_temperature),
    humidity: num(c.relative_humidity_2m),
    precip: num(c.precipitation),
    code: num(c.weather_code),
    cloud: num(c.cloud_cover),
    pressure: num(c.pressure_msl) ?? num(c.surface_pressure),
    wind: num(c.wind_speed_10m),
    windDir: num(c.wind_direction_10m),
    gust: num(c.wind_gusts_10m),
    observedAt: c.time || null,
    hourly, daily,
  };
}

export async function fetchWeather(lat, lon, { signal } = {}) {
  if (typeof lat !== "number" || typeof lon !== "number") {
    return { ok: false, error: "This spot has no coordinates saved yet." };
  }
  const r = await guardedFetch(weatherUrl(lat, lon), { signal });
  if (!r.ok) return { ok: false, error: r.error };
  const shaped = shapeWeather(r.data);
  if (!shaped || shaped.temp === null) return { ok: false, error: "unreadable response" };
  return { ok: true, data: shaped, at: Date.now() };
}

/* ---------- Environment Canada hydrometric ----------
   Water Survey of Canada real-time water level and discharge,
   via the GeoMet OGC API. Free, no key, open government licence.

   Station numbers are not hardcoded: the app finds gauges near a
   spot's coordinates at runtime and the user picks one. That is
   both more honest and more portable than baking in IDs. */

const GEOMET = "https://api.weather.gc.ca/collections";

export function stationSearchUrl(lat, lon, radiusDeg = 0.35) {
  const bbox = [lon - radiusDeg, lat - radiusDeg, lon + radiusDeg, lat + radiusDeg].join(",");
  return `${GEOMET}/hydrometric-stations/items?bbox=${bbox}&f=json&limit=50`;
}

export function hydroReadingUrl(stationNumber) {
  const p = new URLSearchParams({
    STATION_NUMBER: stationNumber, f: "json", limit: "1",
    sortby: "-DATETIME",
  });
  return `${GEOMET}/hydrometric-realtime/items?${p.toString()}`;
}

const km = (aLat, aLon, bLat, bLon) => {
  const R = 6371, dLat = (bLat - aLat) * Math.PI / 180, dLon = (bLon - aLon) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
};

export async function findStations(lat, lon, { signal } = {}) {
  if (typeof lat !== "number" || typeof lon !== "number") {
    return { ok: false, error: "This spot has no coordinates saved yet." };
  }
  const r = await guardedFetch(stationSearchUrl(lat, lon), { signal });
  if (!r.ok) return { ok: false, error: r.error };

  const feats = Array.isArray(r.data?.features) ? r.data.features : [];
  const list = feats.map((f) => {
    const p = f?.properties || {};
    const g = f?.geometry?.coordinates;
    const sLon = Array.isArray(g) ? g[0] : null, sLat = Array.isArray(g) ? g[1] : null;
    return {
      id: p.STATION_NUMBER || p.IDENTIFIER || null,
      name: p.STATION_NAME || "Unnamed station",
      prov: p.PROV_TERR_STATE_LOC || "",
      lat: sLat, lon: sLon,
      distance: (typeof sLat === "number" && typeof sLon === "number") ? km(lat, lon, sLat, sLon) : null,
    };
  }).filter((s) => s.id);

  list.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
  return { ok: true, data: list.slice(0, 12), at: Date.now() };
}

export async function fetchHydro(stationNumber, { signal } = {}) {
  if (!stationNumber) return { ok: false, error: "No gauge station chosen for this spot." };
  const r = await guardedFetch(hydroReadingUrl(stationNumber), { signal });
  if (!r.ok) return { ok: false, error: r.error };

  const f = Array.isArray(r.data?.features) ? r.data.features[0] : null;
  const p = f?.properties;
  if (!p) return { ok: false, error: "no recent reading for that gauge" };

  const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  const level = num(p.LEVEL), discharge = num(p.DISCHARGE);
  if (level === null && discharge === null) return { ok: false, error: "gauge reported no values" };

  return {
    ok: true,
    data: {
      station: p.STATION_NUMBER || stationNumber,
      name: p.STATION_NAME || "",
      level, discharge,
      observed: p.DATETIME_LST || p.DATETIME || null,
    },
    at: Date.now(),
  };
}

/* Paddling-flow context from the UTRCA guidance already in the app:
   15 m3/s on the branches, 20 on the main branch. Useful as a rough
   "is the bank fishable" proxy. */
export function flowContext(discharge, mainBranch) {
  if (typeof discharge !== "number") return null;
  const rec = mainBranch ? 20 : 15;
  if (discharge > rec * 2.5) return { level: "high", note: "Well above recommended paddling flow — expect coloured, pushy water and unsafe banks." };
  if (discharge > rec) return { level: "elevated", note: "Above the recommended paddling flow — coloured and moving fast." };
  if (discharge < rec * 0.25) return { level: "low", note: "Very low and clear. Downsize and fish first and last light." };
  return { level: "normal", note: "Around normal flow for this watershed." };
}

/* ---------- cache helpers ---------- */

export const isStale = (at, ttl) => !at || (Date.now() - at) > ttl;
export const weatherStale = (at) => isStale(at, WEATHER_TTL);
export const hydroStale = (at) => isStale(at, HYDRO_TTL);

export function pushPressureReading(existing, pressure, at = Date.now()) {
  if (typeof pressure !== "number" || !isFinite(pressure)) return existing || [];
  const list = [...(existing || []), { pressure, at }];
  // one reading per hour is plenty; drop near-duplicates
  const dedup = [];
  for (const r of list.sort((a, b) => a.at - b.at)) {
    const last = dedup[dedup.length - 1];
    if (!last || r.at - last.at > 20 * 60 * 1000) dedup.push(r);
    else dedup[dedup.length - 1] = r;
  }
  return dedup.slice(-MAX_PRESSURE_READINGS);
}

export const agoLabel = (at) => {
  if (!at) return "never";
  const elapsed = Date.now() - at;
  if (elapsed < 60000) return "just now";
  const mins = Math.floor(elapsed / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.floor(hrs / 24)} d ago`;
};

/* ============================================================
   Community packs directory (read-only)

   A folder of JSON on GitHub. There is no server: the app fetches
   an index, then whichever pack the person chose, and hands it to
   the same validate/merge path a file import uses.

   Same contract as everything above — timeout, { ok, ... }, never
   throws. The index is remote data, so the paths inside it are
   treated as untrusted: communityFileUrl() will only build a URL
   for a path that matches the documented layout.
   ============================================================ */

const COMMUNITY_BASE =
  "https://raw.githubusercontent.com/MaxMana-Corner/london-fishing-community-packs/main";

/* Only these shapes exist in the packs repo. Anything else — an
   absolute URL, a traversal, a path into .github — is refused. */
const COMMUNITY_PATH_OK = /^(?:packs|locations|pins)\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
const COMMUNITY_PHOTO_OK = /^locations\/[A-Za-z0-9][A-Za-z0-9._-]*\/photo\.webp$/;

export function isSafeCommunityPath(path) {
  if (typeof path !== "string" || !path) return false;
  if (path.includes("..") || path.includes("//") || path.includes("\\")) return false;
  return COMMUNITY_PATH_OK.test(path) || COMMUNITY_PHOTO_OK.test(path);
}

export const communityIndexUrl = () => `${COMMUNITY_BASE}/index.json`;
export const communityStatsUrl = () => `${COMMUNITY_BASE}/stats.json`;

/* Returns null — not a URL — for anything that fails the guard, so a
   bad index can never point the app at an arbitrary address. */
export function communityFileUrl(path) {
  return isSafeCommunityPath(path) ? `${COMMUNITY_BASE}/${path}` : null;
}

export async function fetchCommunityIndex(opts = {}) {
  const r = await guardedFetch(communityIndexUrl(), opts);
  return r.ok ? { ok: true, data: r.data, at: Date.now() } : r;
}

export async function fetchCommunityStats(opts = {}) {
  const r = await guardedFetch(communityStatsUrl(), opts);
  return r.ok ? { ok: true, data: r.data, at: Date.now() } : r;
}

/* The pack file itself. Returned as raw text, because validateImport()
   in portability.js takes text — the same function a file import uses,
   so a community pack gets exactly the same validation as a file
   someone was handed on a memory stick. */
export async function fetchCommunityPack(path, opts = {}) {
  const url = communityFileUrl(path);
  if (!url) return { ok: false, error: "that pack has an unusable address" };
  const r = await guardedFetch(url, { ...opts, parse: "text" });
  return r.ok ? { ok: true, text: r.data, at: Date.now() } : r;
}

/* ---------------- submitting to the community ----------------

   The one endpoint that writes anything anywhere. It posts to a Google
   Apps Script web app which holds a GitHub token server-side; a write
   token cannot live in browser JavaScript, which is the whole reason
   that script exists.

   Clean submissions become a pull request on the packs repository.
   Anything flagged, or anything carrying a photo, is held in a review
   repository instead - a word filter cannot look at an image.

   Longer timeout than the read calls: the script does real work on the
   far side (branch, commit, pull request) before it answers. Same 30s
   ceiling callSync() settled on for the same reason. */

const COMMUNITY_SUBMIT_URL =
  "https://script.google.com/macros/s/AKfycby2DCPzkRBFnixZcvw1tzigSj9serOsfw8YLKV7eYDSj40W1PNpm1h6Jfy40TRVr24/exec";

const SUBMIT_TIMEOUT_MS = 30000;

export function communitySubmitConfigured() {
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(COMMUNITY_SUBMIT_URL);
}

export async function submitCommunityContent(req, opts = {}) {
  if (!communitySubmitConfigured()) {
    return { ok: false, error: "sharing is not set up in this copy of the app" };
  }
  const r = await guardedFetch(COMMUNITY_SUBMIT_URL, {
    ...opts,
    post: JSON.stringify({ action: "submit", ...req }),
    timeout: SUBMIT_TIMEOUT_MS,
  });
  if (!r.ok) return r;
  const out = r.data;
  if (!out || out.ok !== true) {
    return { ok: false, error: (out && out.error) || "that was refused" };
  }
  return { ok: true, status: out.status || "submitted", url: out.url || null };
}

/* A vote. The bridge replies with the authoritative tally so the button
   can settle immediately rather than waiting for the next rebuild. Short
   timeout: this one only touches a spreadsheet, unlike a submission. */
export async function submitCommunityVote(req, opts = {}) {
  if (!communitySubmitConfigured()) {
    return { ok: false, error: "voting is not set up in this copy of the app" };
  }
  const r = await guardedFetch(COMMUNITY_SUBMIT_URL, {
    ...opts,
    post: JSON.stringify({ action: "vote", ...req }),
    timeout: 15000,
  });
  if (!r.ok) return r;
  const out = r.data;
  if (!out || out.ok !== true) return { ok: false, error: (out && out.error) || "that vote was refused" };
  return { ok: true, yourVote: out.yourVote, up: out.up, down: out.down, score: out.score };
}

/* ---------------- offline map regions ----------------

   The region file is a same-origin bundled asset, precached by the
   service worker, so this is a fetch in name only - it resolves from
   the cache with no connection. It lives here rather than in map.js
   because the rule is that nothing outside this file fetches, and a
   rule with one convenient exception is not a rule.

   Not bundled into app.js on purpose: one region is 439 KB, and the
   whole point of the region index is that there will be more than one.
   You download the province you fish, not all of them. */

export const mapRegionUrl = (id) =>
  /^[a-z0-9-]+$/.test(String(id || "")) ? `./map/${id}.json` : null;

/* The list of regions the app knows about, with the download size of each.
   Derived by tools/build-map-index.mjs and precached with the app, so the
   dropdown works offline even for regions you have not downloaded - it can
   still tell you they exist and what they would cost. */
export async function fetchMapIndex(opts = {}) {
  const r = await guardedFetch("./map/index.json", opts);
  if (!r.ok) return r;
  const d = r.data;
  if (!d || d.schema !== 1 || !Array.isArray(d.regions)) {
    return { ok: false, error: "that index is not readable" };
  }
  const regions = d.regions.filter(
    (x) => x && typeof x.id === "string" && /^[a-z0-9-]+$/.test(x.id)
  );
  if (!regions.length) return { ok: false, error: "that index has no regions in it" };
  return {
    ok: true,
    index: {
      defaultRegion: regions.some((x) => x.id === d.defaultRegion)
        ? d.defaultRegion : regions[0].id,
      regions,
    },
  };
}

export async function fetchMapRegion(id, opts = {}) {
  const url = mapRegionUrl(id);
  if (!url) return { ok: false, error: "unknown region" };
  const r = await guardedFetch(url, opts);
  return r.ok ? { ok: true, region: r.data } : r;
}
