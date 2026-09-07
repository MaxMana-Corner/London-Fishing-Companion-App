/* Build a vector map region from OpenStreetMap.

   Development tool, not shipped code and never run by the app. It queries
   Overpass for the handful of things a bank angler actually needs - water,
   roads to orient by, parks, and place names - simplifies the geometry,
   and writes a compact file the app draws on a canvas.

   This is what makes another region one command rather than a project:
     node tools/build-map.mjs london-on
     node tools/build-map.mjs windsor-on

   Data is OpenStreetMap, ODbL. The attribution it writes into the file is
   not decoration - it has to end up on screen.

   Usage: node tools/build-map.mjs <regionId> [--radius 50]
*/

import fs from "node:fs";
import path from "node:path";

const REGIONS = {
  "london-on":   { name: "London, Ontario",  lat: 42.9849, lon: -81.2453, radius: 50 },
  "windsor-on":  { name: "Windsor, Ontario", lat: 42.3149, lon: -83.0364, radius: 50 },
  "sarnia-on":   { name: "Sarnia, Ontario",  lat: 42.9745, lon: -82.4066, radius: 50 },
  "gta-on":      { name: "Greater Toronto",  lat: 43.6532, lon: -79.3832, radius: 60 },
};

const OVERPASS = "https://overpass-api.de/api/interpreter";

/* Coordinates are rounded to five decimals - about a metre. Anything finer
   is invisible on a phone and costs real bytes across 14,000 points. */
const PRECISION = 5;

/* Douglas-Peucker tolerances in degrees, per layer. Water keeps its shape
   because the shape of the water IS the map here; roads exist only to tell
   you roughly where you are, so they can be blunter. */
const TOLERANCE = { river: 0.00006, water: 0.00010, road: 0.0006, park: 0.00025 };

/* Minimum extent (degrees, longer side of the bounding box) for a feature to
   be worth drawing. Roughly: 0.0015 deg ~ 150 m. The river is exempt - it is
   the whole point of the map, however short a segment is. */
const MIN_EXTENT = { river: 0, water: 0.0004, road: 0.004, park: 0.0008 };

/* Precision: five decimals is ~1 m, which the river deserves and a field
   boundary does not. Four decimals is ~11 m, finer than a pixel at any zoom
   this map will actually be read at. */
const LAYER_PRECISION = { river: 5, water: 5, road: 4, park: 4 };

const arg = process.argv[2];
const region = REGIONS[arg];
if (!region) {
  console.error("Unknown region. Known: " + Object.keys(REGIONS).join(", "));
  process.exit(1);
}
const radiusArg = process.argv.indexOf("--radius");
if (radiusArg > -1) region.radius = Number(process.argv[radiusArg + 1]) || region.radius;

const dLat = region.radius / 111;
const dLon = region.radius / (111 * Math.cos((region.lat * Math.PI) / 180));
const bbox = {
  s: +(region.lat - dLat).toFixed(4), n: +(region.lat + dLat).toFixed(4),
  w: +(region.lon - dLon).toFixed(4), e: +(region.lon + dLon).toFixed(4),
};
const BB = `${bbox.s},${bbox.w},${bbox.n},${bbox.e}`;

console.log(`${region.name} - ${region.radius} km radius`);
console.log(`  bbox ${BB}`);

/* One query per layer rather than one big one: Overpass is friendlier to
   several modest requests than a single enormous one, and a failure tells
   you which layer broke instead of just "timeout". */
const QUERIES = {
  river: `way["waterway"~"^(river|canal)$"](${BB});`,
  water: `way["natural"="water"](${BB});rel["natural"="water"](${BB});`,
  road:  `way["highway"~"^(motorway|trunk|primary)$"](${BB});`,
  park:  `way["leisure"~"^(park|nature_reserve)$"](${BB});`,
  place: `node["place"~"^(city|town|village)$"](${BB});`,
};

/* Raw responses are cached on disk. Overpass is a free service run on
   donated hardware; re-querying 100 km of Ontario every time a tolerance
   changes is rude and slow. Delete tools/.osm-cache to force a refresh. */
const CACHE_DIR = path.join(process.cwd(), "tools", ".osm-cache");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(body, cacheKey) {
  const cached = path.join(CACHE_DIR, cacheKey + ".json");
  if (fs.existsSync(cached)) {
    process.stdout.write("(cached) ");
    return JSON.parse(fs.readFileSync(cached, "utf8"));
  }

  /* 429 means "you are asking too fast" and 504 means the query timed out
     server-side. Both are worth waiting out rather than failing the build. */
  let wait = 5000;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "User-Agent": "london-fishing-companion/1.0 (offline map build; contact via github.com/MaxMana-Corner)",
      },
      body,
    });
    if (res.ok) {
      const json = await res.json();
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cached, JSON.stringify(json));
      return json;
    }
    if (res.status !== 429 && res.status !== 504) throw new Error(`Overpass ${res.status}`);
    process.stdout.write(`(busy, waiting ${wait / 1000}s) `);
    await sleep(wait);
    wait *= 2;
  }
  throw new Error("Overpass stayed busy after 4 attempts");
}

/* Douglas-Peucker. Perpendicular distance in degrees is close enough at this
   latitude and scale; the error is far below what a pixel can show. */
function simplify(points, tol) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1, best = tol;
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      let d;
      if (len2 === 0) {
        d = Math.hypot(px - ax, py - ay);
      } else {
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > best) { best = d; far = i; }
    }
    if (far > -1) { keep[far] = true; stack.push([a, far], [far, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

let PREC = PRECISION;
const round = (n) => +n.toFixed(PREC);

/* Split a line into the runs of it that fall inside the bounding box.
   One point of overhang is kept at each end so a clipped line still reaches
   the edge of the map instead of stopping short of it. */
function clipToBox(points, box, pad) {
  const inside = (p) =>
    p[0] >= box.w - pad && p[0] <= box.e + pad &&
    p[1] >= box.s - pad && p[1] <= box.n + pad;

  /* Where a segment crosses the edge, walk along it to the boundary rather
     than keeping the far vertex. Binary search is plenty - we only need to
     land within a metre or so of the edge. */
  const crossing = (a, b) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      const p = [a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid];
      if (inside(p)) lo = mid; else hi = mid;
    }
    return [a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo];
  };

  const runs = [];
  let run = null;
  for (let i = 0; i < points.length; i++) {
    if (inside(points[i])) {
      if (!run) {
        run = [];
        if (i > 0) run.push(crossing(points[i], points[i - 1]));
      }
      run.push(points[i]);
    } else if (run) {
      run.push(crossing(points[i - 1], points[i]));
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return runs.filter((r) => r.length >= 2);
}

function extentOf(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return Math.max(maxX - minX, maxY - minY);
}

/* Encode a line as [scaledLat0, scaledLon0, dLat1, dLon1, dLat2, dLon2, ...]
   in fixed-point integers. Consecutive points on a river are metres apart, so
   almost every delta is a small number and JSON spends four characters on it
   instead of twenty. The decoder in map.js walks it back with a running sum. */
function encodeLine(points) {
  const scale = Math.pow(10, PREC);
  const out = [];
  let py = 0, px = 0;
  for (let i = 0; i < points.length; i++) {
    const y = Math.round(points[i][1] * scale);
    const x = Math.round(points[i][0] * scale);
    if (i === 0) { out.push(y, x); } else { out.push(y - py, x - px); }
    py = y; px = x;
  }
  return out;
}

const layers = {};
const layerPoints = {};
let rawPoints = 0, keptPoints = 0;

for (const [layer, q] of Object.entries(QUERIES)) {
  process.stdout.write(`  ${layer.padEnd(6)} `);
  const json = await overpass(`[out:json][timeout:180];(${q});out geom;`, `${arg}-${layer}`);
  await sleep(1500);   // be a good neighbour between queries
  const els = json.elements || [];

  if (layer === "place") {
    layers.place = els
      .filter((e) => e.lat != null && e.tags && e.tags.name)
      .map((e) => [round(e.lat), round(e.lon), e.tags.name, e.tags.place === "city" ? 2 : e.tags.place === "town" ? 1 : 0])
      .sort((a, b) => b[3] - a[3])
      .slice(0, 60);
    console.log(`${String(layers.place.length).padStart(5)} places`);
    continue;
  }

  PREC = LAYER_PRECISION[layer] || PRECISION;
  const lines = [];
  let dropped = 0;
  for (const e of els) {
    const geom = e.geometry || (e.members || []).flatMap((m) => m.geometry || []);
    if (!geom || geom.length < 2) continue;
    const pts = geom.map((g) => [g.lon, g.lat]);
    rawPoints += pts.length;
    if (extentOf(pts) < (MIN_EXTENT[layer] || 0)) { dropped++; continue; }
    for (const run of clipToBox(pts, bbox, 0.01)) {
      const s = simplify(run, TOLERANCE[layer]);
      keptPoints += s.length;
      if (s.length >= 2) lines.push(encodeLine(s));
    }
  }
  layers[layer] = { scale: PREC, lines };
  layerPoints[layer] = lines.reduce((n, l) => n + l.length / 2, 0);
  console.log(`${String(lines.length).padStart(5)} ways` + (dropped ? `  (${dropped} too small)` : ""));
}

const out = {
  schema: 1,
  region: arg,
  name: region.name,
  centre: [round(region.lat), round(region.lon)],
  radiusKm: region.radius,
  bbox: [bbox.w, bbox.s, bbox.e, bbox.n],
  attribution: "© OpenStreetMap contributors",
  generatedAt: new Date().toISOString(),
  layers,
};

const dir = path.join(process.cwd(), "map");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${arg}.json`);
fs.writeFileSync(file, JSON.stringify(out));

const kb = (fs.statSync(file).size / 1024).toFixed(0);
console.log("");
for (const [k, n] of Object.entries(layerPoints)) {
  console.log("  " + k.padEnd(6) + String(n).padStart(7) + " points");
}
console.log(`  points ${rawPoints} -> ${keptPoints} (${((1 - keptPoints / rawPoints) * 100).toFixed(0)}% dropped)`);
console.log(`  wrote map/${arg}.json  ${kb} KB`);
