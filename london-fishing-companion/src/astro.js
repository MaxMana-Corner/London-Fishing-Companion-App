/* ============================================================
   astro.js — offline astronomy
   Pure functions. No network, ever. Everything here is computed
   from coordinates and a date, which is why it still works with
   the phone in airplane mode on the riverbank.

   Approach: one solar position function, one lunar position
   function, and a generic minute-by-minute altitude scan to find
   rise/set/transit. Scanning is less elegant than root-finding
   but it is far harder to get subtly wrong, and 1440 iterations
   is nothing on a phone.
   ============================================================ */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const J1970 = 2440588;
const J2000 = 2451545;
const DAY_MS = 86400000;

export const toJulian = (date) => date.valueOf() / DAY_MS - 0.5 + J1970;
export const fromJulian = (j) => new Date((j + 0.5 - J1970) * DAY_MS);
export const daysSinceJ2000 = (date) => toJulian(date) - J2000;

/* obliquity of the ecliptic */
const e = 23.4397 * RAD;

const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const siderealTime = (d, lw) => (280.16 + 360.9856235 * d) * RAD - lw;
const altitude = (H, phi, dec) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));

/* ---------------- Sun ---------------- */

function solarMeanAnomaly(d) { return (357.5291 + 0.98560028 * d) * RAD; }

function eclipticLongitudeSun(M) {
  const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * RAD;
  const P = 102.9372 * RAD;
  return M + C + P + Math.PI;
}

export function sunPosition(date, lat, lon) {
  const lw = -lon * RAD, phi = lat * RAD, d = daysSinceJ2000(date);
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitudeSun(M);
  const dec = declination(L, 0);
  const ra = rightAscension(L, 0);
  const H = siderealTime(d, lw) - ra;
  return { altitude: altitude(H, phi, dec) * DEG, declination: dec * DEG, hourAngle: H };
}

/* ---------------- Moon ---------------- */
/* Meeus low-accuracy lunar position — good to a few arcminutes,
   far beyond what a feeding-window estimate needs. */

export function moonPosition(date, lat, lon) {
  const lw = -lon * RAD, phi = lat * RAD, d = daysSinceJ2000(date);

  const L = (218.316 + 13.176396 * d) * RAD;   // ecliptic longitude
  const M = (134.963 + 13.064993 * d) * RAD;   // mean anomaly
  const F = (93.272 + 13.229350 * d) * RAD;    // mean distance

  const lng = L + 6.289 * RAD * Math.sin(M);
  const lat_ = 5.128 * RAD * Math.sin(F);
  const dist = 385001 - 20905 * Math.cos(M);

  const ra = rightAscension(lng, lat_);
  const dec = declination(lng, lat_);
  const H = siderealTime(d, lw) - ra;

  let alt = altitude(H, phi, dec);
  // refraction correction near the horizon
  const h = alt * DEG;
  const refraction = h > -0.26 ? 0.017 / Math.tan((h + 10.26 / (h + 5.10)) * RAD) : 0;

  return {
    altitude: h + refraction,
    distance: dist,
    hourAngle: H,
    rightAscension: ra,
    declination: dec * DEG,
  };
}

/* ---------------- Moon phase ---------------- */

const PHASE_NAMES = [
  "New moon", "Waxing crescent", "First quarter", "Waxing gibbous",
  "Full moon", "Waning gibbous", "Last quarter", "Waning crescent",
];

export function moonPhase(date) {
  const d = daysSinceJ2000(date);

  // Sun and moon ecliptic longitudes
  const M = solarMeanAnomaly(d);
  const Lsun = eclipticLongitudeSun(M);
  const L = (218.316 + 13.176396 * d) * RAD;
  const Mm = (134.963 + 13.064993 * d) * RAD;
  const Lmoon = L + 6.289 * RAD * Math.sin(Mm);

  // elongation, 0 = new, PI = full
  let elong = (Lmoon - Lsun) % (2 * Math.PI);
  if (elong < 0) elong += 2 * Math.PI;

  const phase = elong / (2 * Math.PI);              // 0..1 through the cycle
  const illumination = (1 - Math.cos(elong)) / 2;   // 0..1 lit fraction
  const idx = Math.floor(phase * 8 + 0.5) % 8;

  return {
    phase,
    illumination,
    name: PHASE_NAMES[idx],
    age: phase * 29.530588853,
  };
}

/* ---------------- Generic event scanning ---------------- */
/* Walks the local day in 1-minute steps looking for altitude
   crossings. Returns null where an event does not occur (polar
   day/night, or a moon that never rises) rather than guessing. */

function scanDay(date, lat, lon, posFn, horizonDeg) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  let rise = null, set = null, peak = null, peakAlt = -Infinity;
  let prev = posFn(start, lat, lon).altitude;

  for (let m = 1; m <= 1440; m++) {
    const t = new Date(start.getTime() + m * 60000);
    const alt = posFn(t, lat, lon).altitude;

    if (alt > peakAlt) { peakAlt = alt; peak = t; }
    if (prev <= horizonDeg && alt > horizonDeg && !rise) rise = t;
    if (prev >= horizonDeg && alt < horizonDeg && !set) set = t;
    prev = alt;
  }
  return { rise, set, transit: peak, peakAltitude: peakAlt };
}

export function sunTimes(date, lat, lon) {
  const r = scanDay(date, lat, lon, sunPosition, -0.833);
  return { sunrise: r.rise, sunset: r.set, solarNoon: r.transit, maxAltitude: r.peakAltitude };
}

export function moonTimes(date, lat, lon) {
  const r = scanDay(date, lat, lon, moonPosition, 0.125);
  return { moonrise: r.rise, moonset: r.set, transit: r.transit, maxAltitude: r.peakAltitude };
}

/* ---------------- Solunar ---------------- */
/* Major periods bracket lunar transit (moon overhead) and the
   anti-transit (moon underfoot). Minor periods bracket moonrise
   and moonset. Widely used by anglers; treat as a hint, not law. */

const window_ = (centre, hours) => centre ? ({
  start: new Date(centre.getTime() - hours * 1800000),
  end: new Date(centre.getTime() + hours * 1800000),
  centre,
}) : null;

export function solunar(date, lat, lon) {
  const mt = moonTimes(date, lat, lon);

  // anti-transit is roughly 12h25m from transit; find it by scanning
  // for the minimum altitude rather than assuming, so it stays correct
  // near the edges of the day.
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  let under = null, minAlt = Infinity;
  for (let m = 0; m <= 1440; m += 2) {
    const t = new Date(start.getTime() + m * 60000);
    const alt = moonPosition(t, lat, lon).altitude;
    if (alt < minAlt) { minAlt = alt; under = t; }
  }

  const majors = [window_(mt.transit, 2), window_(under, 2)].filter(Boolean);
  const minors = [window_(mt.moonrise, 1), window_(mt.moonset, 1)].filter(Boolean);

  // Day rating: full and new moons are traditionally the strongest.
  const ph = moonPhase(date);
  const strength = Math.abs(Math.cos(ph.phase * 2 * Math.PI));  // peaks at new & full
  const rating = Math.max(1, Math.min(4, Math.round(strength * 3) + 1));

  return { majors, minors, rating, phase: ph, moonTimes: mt };
}

/* Is `when` inside any solunar window right now? */
export function activeWindow(sol, when = new Date()) {
  for (const w of sol.majors) if (when >= w.start && when <= w.end) return "major";
  for (const w of sol.minors) if (when >= w.start && when <= w.end) return "minor";
  return null;
}

/* ---------------- Fishing window score ---------------- */
/* Combines the offline solunar calculation with online forecast
   values when they are available. Weather is optional on purpose:
   with no forecast the score still works, just with less to go on. */

export function windowScore({ solunarState, hour, sunrise, sunset, weather }) {
  let score = 40;
  const notes = [];

  if (solunarState === "major") { score += 25; notes.push("Major solunar period"); }
  else if (solunarState === "minor") { score += 12; notes.push("Minor solunar period"); }

  // Dawn and dusk carry most of the fishing signal in this watershed.
  if (sunrise && sunset) {
    const nearDawn = Math.abs(hour - sunrise.getHours()) <= 1;
    const nearDusk = Math.abs(hour - sunset.getHours()) <= 1;
    if (nearDawn || nearDusk) { score += 20; notes.push(nearDawn ? "First light" : "Last light"); }
    else if (hour >= 11 && hour <= 15) { score -= 12; notes.push("Bright midday"); }
  }

  if (weather) {
    if (typeof weather.cloud === "number") {
      if (weather.cloud >= 60) { score += 8; notes.push("Overcast"); }
    }
    if (typeof weather.wind === "number") {
      if (weather.wind > 30) { score -= 15; notes.push("Too windy to fish comfortably"); }
      else if (weather.wind >= 8 && weather.wind <= 20) { score += 5; notes.push("Useful ripple"); }
    }
    if (typeof weather.precipProb === "number" && weather.precipProb >= 70) {
      score -= 8; notes.push("Rain likely");
    }
    if (weather.pressureTrend === "falling") { score += 10; notes.push("Falling pressure"); }
    else if (weather.pressureTrend === "rising") { score -= 5; notes.push("Rising pressure"); }
  }

  score = Math.max(0, Math.min(100, score));
  const label = score >= 75 ? "Prime" : score >= 55 ? "Good" : score >= 35 ? "Fair" : "Slow";
  return { score, label, notes };
}

/* ---------------- Pressure trend ---------------- */
/* Computed locally from cached readings. A single fetched number is
   just a number; the trend is what anglers actually act on. */

export function pressureTrend(readings) {
  const valid = (readings || [])
    .filter((r) => r && typeof r.pressure === "number" && r.at)
    .sort((a, b) => a.at - b.at);
  if (valid.length < 2) return { trend: "unknown", change: null, hours: 0, readings: valid.length };

  const last = valid[valid.length - 1];
  const cutoff = last.at - 24 * 3600 * 1000;
  const earlier = valid.find((r) => r.at >= cutoff) || valid[0];

  const change = last.pressure - earlier.pressure;
  const hours = (last.at - earlier.at) / 3600000;
  if (hours < 1) return { trend: "unknown", change, hours, readings: valid.length };

  const trend = change <= -1.5 ? "falling" : change >= 1.5 ? "rising" : "steady";
  return { trend, change: Math.round(change * 10) / 10, hours: Math.round(hours), readings: valid.length };
}

export const fmtTime = (d) =>
  d ? d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", hour12: true }) : "—";
