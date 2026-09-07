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
const TOLERANCE = { river: 0.00006, water: 0.00010, road: 0.0006, park: 0.00025,
                    street: 0.00008, path: 0.00008, building: 0.00004 };

/* Minimum extent (degrees, longer side of the bounding box) for a feature to
   be worth drawing. Roughly: 0.0015 deg ~ 150 m. The river is exempt - it is
   the whole point of the map, however short a segment is. */
const MIN_EXTENT = { river: 0, water: 0.0004, road: 0.004, park: 0.0008,
                     street: 0, path: 0,
                     /* ~44 m. Houses and sheds are 209,386 of the 222,174 buildings in
                        this box and every one of them is an identical rectangle - they do
                        not help you work out where you are. Landmarks do: pavilions,
                        boathouses, arenas, apartment blocks. */
                     building: 0.0004 };

/* How far from the water a street or path is still worth carrying. */
const CORRIDOR_DEG = 0.012;   /* ~1.3 km either side of the water */
/* Buildings earn their place only where you are actually standing. Half a
   kilometre from the bank, a warehouse outline is just bytes. */
const BUILDING_DEG = 0.005;   /* ~550 m */

/* Precision: five decimals is ~1 m, which the river deserves and a field
   boundary does not. Four decimals is ~11 m, finer than a pixel at any zoom
   this map will actually be read at. */
const LAYER_PRECISION = { river: 5, water: 5, road: 4, park: 4, street: 5, path: 5,
                          building: 5 };

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
  /* Streets and paths are fetched for the whole box and then thinned to a
     corridor around the water - see keepNearWater below. Footpaths matter
     more than they look: on a bank they ARE the access. */
  street: `way["highway"~"^(secondary|tertiary|residential|unclassified|living_street)$"](${BB});`,
  path:   `way["highway"~"^(footway|path|cycleway)$"]["footway"!~"^(sidewalk|crossing)$"](${BB});`,
  building: `way["building"](${BB});`,
};

/* Points rather than shapes: things you navigate BY and things you walk TO.
   Fetched with `out center;` so a building comes back as one coordinate
   instead of an outline we would only collapse to a dot anyway. */
const POINT_QUERIES = {
  /* Real landmarks - the buildings you would actually say "turn at the".
     A named church, the hospital, the arena. Not every shop. */
  landmark: `
    nwr["amenity"~"^(hospital|university|college|townhall|library|place_of_worship|community_centre|arts_centre|theatre|courthouse|police|fire_station)$"]["name"](${BB});
    nwr["tourism"~"^(museum|gallery|attraction|zoo)$"]["name"](${BB});
    nwr["leisure"~"^(stadium|sports_centre|ice_rink|golf_course|marina)$"]["name"](${BB});
    nwr["shop"="mall"]["name"](${BB});
    nwr["amenity"="school"]["name"](${BB});
    nwr["railway"="station"]["name"](${BB});
    nwr["amenity"="bus_station"]["name"](${BB});
  `,
  /* Water furniture. A weir is where fish stack up; a slipway is how a
     boat gets in; a pier is somewhere you can stand. These are the most
     fishing-specific things OSM knows and there are very few of them. */
  poi: `
    nwr["waterway"~"^(weir|dam)$"](${BB});
    nwr["natural"="waterfall"](${BB});
    nwr["leisure"="slipway"](${BB});
    nwr["man_made"~"^(pier|breakwater)$"](${BB});
    nwr["sport"~"canoe|kayak|rowing"](${BB});
    nwr["club"~"canoe|kayak|rowing"](${BB});
    nwr["leisure"="water_park"]["name"](${BB});
    nwr["name"~"[Cc]anoe|[Kk]ayak|[Rr]owing [Cc]lub|[Pp]addl"](${BB});
    nwr["amenity"="parking"](${BB});
    nwr["amenity"="toilets"](${BB});
    nwr["amenity"="drinking_water"](${BB});
  `,
};

/* Which glyph the app draws, and whether it is on by default. Order is
   deliberate: the first match wins, so a canoe club that is also tagged
   as parking reads as a canoe club. */
function poiKind(t) {
  if (!t) return null;
  if (t.waterway === "weir") return "weir";
  if (t.waterway === "dam") return "dam";
  if (t.natural === "waterfall") return "weir";
  if (t.leisure === "slipway") return "slipway";
  /* A canoe access point and a boatyard are both "somewhere you get a boat
     into the water", which is the only thing the slipway glyph claims. */
  if (t.waterway === "access_point" || t.waterway === "boatyard") return "slipway";
  if (/canoe|kayak|rowing/.test(t.sport || "") || /canoe|kayak|rowing/.test(t.club || "")) return "canoe";
  /* Broadening the query alone found nothing extra, because clubs around here
     are frequently tagged with a name and nothing else - the London Canoe Club
     is in OSM as building=yes. Trust the name, but not on a highway: "canoe
     portage" is a boardwalk and "Backpaddle" is a mountain bike trail. */
  if (!t.highway && /canoe|kayak|rowing|paddl/i.test(t.name || "")) return "canoe";
  if (t.man_made === "pier" || t.man_made === "breakwater") return "pier";
  if (t.amenity === "parking") {
    /* OSM has a fee tag on 513 of 5,432 lots here, and two of those hold a
       price list rather than yes or no. Anything that is not exactly yes or
       no is unknown, and unknown is drawn as unknown - guessing "probably
       free" is how you get someone a ticket. */
    const fee = t.fee || t["parking:fee"] || "";
    if (fee === "yes") return "parking-paid";
    if (fee === "no") return "parking-free";
    return "parking";
  }
  if (t.amenity === "toilets") return "toilets";
  if (t.amenity === "drinking_water") return "water-tap";
  return null;
}

/* A landmark you can see from far off outranks one you cannot. Rank drives
   which names survive when they collide on screen. */
function landmarkRank(t) {
  if (!t) return 0;
  if (t.amenity === "hospital" || t.amenity === "university" ||
      t.leisure === "stadium" || t.shop === "mall" ||
      t.railway === "station" || t.leisure === "marina") return 2;
  if (t.amenity === "school" || t.amenity === "place_of_worship") return 0;
  return 1;
}

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
/* Sutherland-Hodgman: clip a ring against each edge of the box in turn.
   Used for anything that gets filled. Lines keep the run-splitting below,
   because a road that leaves the box and comes back should be two roads,
   not one with a shortcut across the corner. */
function clipPolygon(points, box, pad) {
  const w = box.w - pad, e = box.e + pad, s2 = box.s - pad, n = box.n + pad;
  const inside = (p, edge) =>
    edge === 0 ? p[0] >= w : edge === 1 ? p[0] <= e : edge === 2 ? p[1] >= s2 : p[1] <= n;
  const cross = (a, b, edge) => {
    const t =
      edge === 0 ? (w - a[0]) / (b[0] - a[0]) :
      edge === 1 ? (e - a[0]) / (b[0] - a[0]) :
      edge === 2 ? (s2 - a[1]) / (b[1] - a[1]) :
                   (n - a[1]) / (b[1] - a[1]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };

  let out = points;
  for (let edge = 0; edge < 4; edge++) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      const curIn = inside(cur, edge), prevIn = inside(prev, edge);
      if (curIn) {
        if (!prevIn) out.push(cross(prev, cur, edge));
        out.push(cur);
      } else if (prevIn) {
        out.push(cross(prev, cur, edge));
      }
    }
    if (!out.length) return [];
  }
  return out.length >= 3 ? [out] : [];
}

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

/* Twelve fishing spots. Streets near these are worth keeping even where the
   river geometry is thin - a pond in a park still needs streets around it. */
const SPOTS = [
  [42.9584,-81.3222],[42.9764,-81.2733],[42.9853,-81.2567],[42.9984,-81.2607],
  [43.0331,-81.2320],[42.9717,-81.1869],[42.9738,-81.2082],[42.9756,-81.2534],
  [42.9477,-81.2269],[43.0355,-81.1884],[42.9530,-81.3840],[42.9872,-81.0663],
];

/* A coarse grid of cells that contain water or a spot. Testing a street
   against this is a hash lookup instead of a distance check against 50,000
   river points. */
const cellKey = (lat, lon) =>
  Math.round(lat / CORRIDOR_DEG) + ":" + Math.round(lon / CORRIDOR_DEG);

const nearWater = new Set();
const nearBank = new Set();

/* A third, much tighter corridor, for the things you only care about if you
   can carry a rod from them to the water: roughly 450 m, which is a walk with
   gear rather than a drive. Marked from the rivers, from the app's own spots,
   and from any body of water big enough to be worth fishing - NOT from the
   four thousand farm ponds, which is what put a parking lot on every
   concession road in Middlesex County. */
const FISH_DEG = 0.0022;
/* About 330 m across. Below this it is a stock pond or a stormwater pond
   behind a subdivision, not somewhere you would drive to fish. */
const BIG_WATER = 0.003;
const nearFishable = new Set();
const fishKey = (lat, lon) =>
  Math.round(lat / FISH_DEG) + ":" + Math.round(lon / FISH_DEG);
function markFishable(points) {
  for (const [lon, lat] of points) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        nearFishable.add(fishKey(lat + dy * FISH_DEG, lon + dx * FISH_DEG));
      }
    }
  }
}

/* And a tight one for parks, so a washroom can be required to actually belong
   to somewhere you would go, rather than being a gas station on a road that
   happens to run near the river. */
const PARK_DEG = 0.0015;
const nearPark = new Set();
const parkKey = (lat, lon) =>
  Math.round(lat / PARK_DEG) + ":" + Math.round(lon / PARK_DEG);
function markPark(points) {
  /* Marking the outline would leave the INTERIOR of a big park unmarked, and
     the interior of a big park is exactly where its washroom is. Fill the
     bounding box: slightly generous on an L-shaped park, and right on the
     thing we actually care about. */
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lon, lat] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  if (!isFinite(minLat)) return;
  const y0 = Math.round(minLat / PARK_DEG) - 1, y1 = Math.round(maxLat / PARK_DEG) + 1;
  const x0 = Math.round(minLon / PARK_DEG) - 1, x1 = Math.round(maxLon / PARK_DEG) + 1;
  /* A guard against a park the size of a county eating the whole grid. */
  if ((y1 - y0) * (x1 - x0) > 40000) return;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) nearPark.add(y + ":" + x);
  }
}
const bankKey = (lat, lon) =>
  Math.round(lat / BUILDING_DEG) + ":" + Math.round(lon / BUILDING_DEG);
function markCorridor(points) {
  for (const [lon, lat] of points) {
    /* Mark the cell and its neighbours, so the corridor is continuous
       rather than a dotted line of isolated cells. */
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        nearWater.add(cellKey(lat + dy * CORRIDOR_DEG, lon + dx * CORRIDOR_DEG));
        nearBank.add(bankKey(lat + dy * BUILDING_DEG, lon + dx * BUILDING_DEG));
      }
    }
  }
}
for (const [lat, lon] of SPOTS) { markCorridor([[lon, lat]]); markFishable([[lon, lat]]); }

const keepNearWater = (points) =>
  points.some(([lon, lat]) => nearWater.has(cellKey(lat, lon)));

const keepNearBank = (points) =>
  points.some(([lon, lat]) => nearBank.has(bankKey(lat, lon)));

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
  const names = [];
  /* How important this way is within its layer. Naming every street means the
     renderer has 10,000 candidates and room for perhaps thirty, so it needs to
     know which thirty. Without this it would be whichever happened to be
     first in the file. */
  const ranks = [];
  let dropped = 0;
  for (const e of els) {
    /* A multipolygon relation - a lake with islands, or one made of several
       ways - has one geometry per member. Concatenating them into a single
       array makes a ring that jumps between separate pieces of shoreline,
       which the renderer then fills as a wedge across open water. 102 of the
       105 water relations in this box have more than one member, and those
       wedges are what they drew. Each member is its own shape. */
    const parts = e.geometry
      ? [e.geometry]
      : (e.members || []).map((m) => m.geometry).filter((g) => g && g.length >= 2);
    if (!parts.length) continue;

    for (const geom of parts) {
    const pts = geom.map((g) => [g.lon, g.lat]);
    rawPoints += pts.length;
    if (extentOf(pts) < (MIN_EXTENT[layer] || 0)) { dropped++; continue; }
    /* Water defines the corridor; streets and paths are judged against it.
       Query order in QUERIES matters here - river and water come first. */
    if (layer === "river") { markCorridor(pts); markFishable(pts); }
    if (layer === "water" && extentOf(pts) >= BIG_WATER) markFishable(pts);
    if (layer === "park") markPark(pts);
    if ((layer === "street" || layer === "path") && !keepNearWater(pts)) { dropped++; continue; }
    if (layer === "building" && !keepNearBank(pts)) { dropped++; continue; }
    /* Carry the name of everything that has one. The old rule kept names off
       residential streets to save space, which meant no zoom level could ever
       show them - and a street map whose streets have no names is a picture of
       a city, not a way to find yourself in it. The name table below makes the
       repetition nearly free, and the renderer decides what fits on screen. */
    const nameable = layer === "road" || layer === "street" ||
      layer === "river" || layer === "water" || layer === "park";
    const name = nameable && e.tags && e.tags.name ? String(e.tags.name).slice(0, 40) : 0;
    const hw = (e.tags && e.tags.highway) || "";
    const rank = layer === "street"
      ? (hw === "secondary" ? 2 : hw === "tertiary" ? 1 : 0)
      : 0;

    /* Filled layers are polygons; the rest are lines. */
    const isArea = layer === "water" || layer === "park" || layer === "building";
    const runs = isArea ? clipPolygon(pts, bbox, 0.01) : clipToBox(pts, bbox, 0.01);
    for (const run of runs) {
      const s = simplify(run, TOLERANCE[layer]);
      keptPoints += s.length;
      if (s.length >= 2) { lines.push(encodeLine(s)); names.push(name); ranks.push(rank); }
    }
    }
  }
  /* A long street is dozens of OSM ways, all carrying the same name, and
     naming every street multiplied that. Intern the strings and store an
     index: the name costs one small integer per way instead of 20 bytes. */
  if (names.some(Boolean)) {
    const table = [];
    const seen = new Map();
    const idx = names.map((n) => {
      if (!n) return 0;
      let i = seen.get(n);
      if (i === undefined) { table.push(n); i = table.length; seen.set(n, i); }
      return i;
    });
    layers[layer] = ranks.some(Boolean)
      ? { scale: PREC, lines, names: idx, nameTable: table, ranks }
      : { scale: PREC, lines, names: idx, nameTable: table };
  } else {
    layers[layer] = { scale: PREC, lines };
  }
  layerPoints[layer] = lines.reduce((n, l) => n + l.length / 2, 0);
  console.log(`${String(lines.length).padStart(5)} ways` + (dropped ? `  (${dropped} too small)` : ""));
}

/* Now the points. These run last because parking and toilets are filtered
   against the water corridor, which only exists once the rivers are in. */
for (const [layer, q] of Object.entries(POINT_QUERIES)) {
  process.stdout.write(`  ${layer.padEnd(8)} `);
  const json = await overpass(`[out:json][timeout:180];(${q});out center;`, `${arg}-${layer}`);
  await sleep(1500);
  const els = json.elements || [];

  const rows = [];
  const seen = new Set();
  for (const e of els) {
    const lat = e.lat != null ? e.lat : e.center && e.center.lat;
    const lon = e.lon != null ? e.lon : e.center && e.center.lon;
    if (lat == null || lon == null) continue;
    if (lat < bbox.s || lat > bbox.n || lon < bbox.w || lon > bbox.e) continue;
    const t = e.tags || {};

    if (layer === "landmark") {
      if (!t.name) continue;
      /* Every university residence is tagged amenity=university, so a dozen
         dorms outrank the hospital. Nobody navigates by Bayfield Hall. */
      if (t.building === "dormitory") continue;

      /* VIA tags its stations with the bare town name, which lands a second
         "London" on top of the place label. The station is a real landmark;
         it just needs a name that says what it is. */
      let lname = String(t.name).slice(0, 40);
      if ((t.railway === "station" || t.amenity === "bus_station") &&
          !/stat|depot|termin/i.test(lname)) {
        lname = lname + (t.railway === "station" ? " station" : " bus terminal");
      }
      const key = t.name + "@" + lat.toFixed(3) + "," + lon.toFixed(3);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push([round(lat), round(lon), lname, landmarkRank(t)]);
      continue;
    }

    const kind = poiKind(t);
    if (!kind) continue;
    /* Parking and toilets are everywhere. 3,074 parking lots survived a
       1.3 km corridor and 3,018 of them had no name - they are driveways and
       staff lots, not somewhere you leave the car to go fishing. Held to the
       550 m bank corridor instead, which is walking distance to the water. */
    const isParking = kind === "parking" || kind === "parking-free" || kind === "parking-paid";
    const common = isParking || kind === "toilets" || kind === "water-tap";
    /* Parking has to be within walking distance of water you could actually
       fish - not merely somewhere in the 550 m band around any waterway. */
    if (isParking && !nearFishable.has(fishKey(lat, lon))) continue;

    /* A washroom earns its place by belonging to a park or to the water. One
       on a road that happens to pass nearby is not a fishing amenity. */
    if ((kind === "toilets" || kind === "water-tap") &&
        !nearPark.has(parkKey(lat, lon)) && !nearFishable.has(fishKey(lat, lon))) continue;

    /* A lot you are not allowed to leave a car in is not parking. */
    if (isParking &&
        /^(private|no|customers|permit|employees|delivery|staff)$/.test(t.access || "")) continue;

    /* A great many agricultural drains around here are tagged waterway=dam.
       "Hankinson Drain" is not a dam and drawing it as one is worse than
       leaving it out, so dams have to be on the river corridor and must not
       be named as the drain they actually are. */
    if (kind === "dam") {
      if (!nearWater.has(cellKey(lat, lon))) continue;
      if (/\bdrain\b/i.test(t.name || "")) continue;
    }
    const key = kind + "@" + lat.toFixed(4) + "," + lon.toFixed(4);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push([round(lat), round(lon), kind, t.name ? String(t.name).slice(0, 40) : 0]);
  }

  if (layer === "landmark") {
    rows.sort((a, b) => b[3] - a[3]);
    layers.landmark = rows.slice(0, 1200);
    console.log(`${String(layers.landmark.length).padStart(5)} landmarks`);
  } else {
    layers.poi = rows;
    const tally = {};
    for (const r of rows) tally[r[2]] = (tally[r[2]] || 0) + 1;
    console.log(`${String(rows.length).padStart(5)} points  ` +
      Object.entries(tally).map(([k, n]) => k + ":" + n).join(" "));
  }
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
