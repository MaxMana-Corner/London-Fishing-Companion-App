/* ============================================================
   map.js — projection, viewport, and drawing for the offline map.

   Pure. NO network in this file, ever. The region data is a bundled
   asset and the pins come from the community cache; nothing here
   fetches anything.

   The projection is real Web Mercator, not the linear approximation
   that would be adequate for one city. Two reasons: the region is
   100 km across, where the error stops being invisible; and an
   optional raster tile layer is planned to slot in underneath, which
   only works if this agrees with how tiles are cut.

   Nothing here knows the app's colours. A palette is passed in, so
   the light and dark themes are the caller's problem rather than a
   second set of hardcoded values to keep in step.
   ============================================================ */

const TILE = 256;
export const MIN_ZOOM = 8;
export const MAX_ZOOM = 17;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isNum = (n) => typeof n === "number" && Number.isFinite(n);

/* ---------------- Web Mercator ----------------
   World pixel coordinates at a given zoom: the whole earth is
   256 * 2^zoom pixels square, which is the same grid tile servers
   cut on. */

export function worldSize(zoom) {
  return TILE * Math.pow(2, zoom);
}

export function lonToWorldX(lon, zoom) {
  return ((lon + 180) / 360) * worldSize(zoom);
}

export function latToWorldY(lat, zoom) {
  const r = clamp(lat, -85.05112878, 85.05112878) * (Math.PI / 180);
  const y = Math.log(Math.tan(r) + 1 / Math.cos(r));
  return (1 - y / Math.PI) / 2 * worldSize(zoom);
}

export function worldXToLon(x, zoom) {
  return (x / worldSize(zoom)) * 360 - 180;
}

export function worldYToLat(y, zoom) {
  const n = Math.PI * (1 - (2 * y) / worldSize(zoom));
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/* ---------------- decoding the region file ----------------
   Lines arrive delta-encoded as fixed-point integers: the first pair
   is absolute, every pair after it is an offset from the one before.
   See tools/build-map.mjs for why. */

export function decodeLine(line, scale) {
  const div = Math.pow(10, scale);
  const out = [];
  let y = 0, x = 0;
  for (let i = 0; i < line.length; i += 2) {
    if (i === 0) { y = line[0]; x = line[1]; }
    else { y += line[i]; x += line[i + 1]; }
    out.push([y / div, x / div]);
  }
  return out;
}

export function decodeLayer(layer) {
  if (!layer || !Array.isArray(layer.lines)) return [];
  const scale = Number(layer.scale) || 5;
  return layer.lines.map((l) => decodeLine(l, scale));
}

/* Names arrive interned: layer.names holds 1-based indexes into
   layer.nameTable, because a long street is dozens of OSM ways all carrying
   the same string. Resolve once, here, so nothing downstream has to know. */
export function layerNames(layer) {
  if (!layer || !Array.isArray(layer.names)) return [];
  const table = Array.isArray(layer.nameTable) ? layer.nameTable : null;
  if (!table) return layer.names;
  return layer.names.map((i) => (i > 0 && i <= table.length ? table[i - 1] : 0));
}

export function layerRanks(layer) {
  return (layer && Array.isArray(layer.ranks)) ? layer.ranks : [];
}

/* Decode once, at load. Doing it per frame would be absurd - the
   whole region is only ~56,000 points. */
export function decodeRegion(region) {
  const layers = (region && region.layers) || {};
  return {
    region: region || null,
    river: decodeLayer(layers.river),
    water: decodeLayer(layers.water),
    waterGroups: (layers.water && layers.water.groups) || [],
    road: decodeLayer(layers.road),
    /* The international boundary. Land detail stops at it; the water does not. */
    border: decodeLayer(layers.border),
    street: decodeLayer(layers.street),
    streetNames: layerNames(layers.street),
    streetRanks: layerRanks(layers.street),
    roadNames: layerNames(layers.road),
    riverNames: layerNames(layers.river),
    waterNames: layerNames(layers.water),
    path: decodeLayer(layers.path),
    park: decodeLayer(layers.park),
    parkGroups: (layers.park && layers.park.groups) || [],
    parkNames: layerNames(layers.park),
    building: decodeLayer(layers.building),
    buildingGroups: (layers.building && layers.building.groups) || [],
    place: Array.isArray(layers.place) ? layers.place : [],
    /* [lat, lon, name, rank] - buildings you navigate by. */
    landmark: Array.isArray(layers.landmark) ? layers.landmark : [],
    /* [lat, lon, kind, name] - things you walk to. */
    poi: Array.isArray(layers.poi) ? layers.poi : [],
  };
}

/* ---------------- the viewport ----------------
   A view is a centre, a zoom, and a size in CSS pixels. Everything
   else derives from those three. */

export function makeView({ width, height, lat, lon, zoom }) {
  const z = clamp(Number(zoom) || 12, MIN_ZOOM, MAX_ZOOM);
  return { width: Math.max(1, width | 0), height: Math.max(1, height | 0), lat, lon, zoom: z };
}

export function screenOf(view, lat, lon) {
  const cx = lonToWorldX(view.lon, view.zoom);
  const cy = latToWorldY(view.lat, view.zoom);
  return [
    lonToWorldX(lon, view.zoom) - cx + view.width / 2,
    latToWorldY(lat, view.zoom) - cy + view.height / 2,
  ];
}

export function latLonOf(view, sx, sy) {
  const cx = lonToWorldX(view.lon, view.zoom);
  const cy = latToWorldY(view.lat, view.zoom);
  return [
    worldYToLat(cy + sy - view.height / 2, view.zoom),
    worldXToLon(cx + sx - view.width / 2, view.zoom),
  ];
}

/* Pick the zoom and centre that fit a bounding box in a given size.
   bbox is [w, s, e, n], matching the region file. */
export function fitBounds(bbox, width, height, padding = 24) {
  const [w, s, e, n] = bbox;
  const lat = (s + n) / 2, lon = (w + e) / 2;
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const dx = Math.abs(lonToWorldX(e, z) - lonToWorldX(w, z));
    const dy = Math.abs(latToWorldY(s, z) - latToWorldY(n, z));
    if (dx <= width - padding * 2 && dy <= height - padding * 2) {
      return makeView({ width, height, lat, lon, zoom: z });
    }
  }
  return makeView({ width, height, lat, lon, zoom: MIN_ZOOM });
}

/* Keep the centre inside the region, or panning wanders off into empty
   space with no way to tell which direction home is. */
export function clampToBounds(view, bbox) {
  const [w, s, e, n] = bbox;
  return { ...view, lat: clamp(view.lat, s, n), lon: clamp(view.lon, w, e) };
}

/* Zoom while keeping whatever is under the finger under the finger.
   Work out where the anchor point lands at the new zoom, then move the
   centre by the difference. */
export function zoomAround(view, delta, sx, sy, bbox) {
  const zoom = clamp(view.zoom + delta, MIN_ZOOM, MAX_ZOOM);
  if (zoom === view.zoom) return view;

  const [aLat, aLon] = latLonOf(view, sx, sy);
  const zoomed = { ...view, zoom };
  const [ax, ay] = screenOf(zoomed, aLat, aLon);

  const [lat, lon] = latLonOf(zoomed, view.width / 2 + (ax - sx), view.height / 2 + (ay - sy));
  const out = { ...zoomed, lat, lon };
  return bbox ? clampToBounds(out, bbox) : out;
}

/* Drag: move the centre by a pixel offset. */
export function panBy(view, dxPx, dyPx, bbox) {
  const [lat, lon] = latLonOf(view, view.width / 2 - dxPx, view.height / 2 - dyPx);
  const out = { ...view, lat, lon };
  return bbox ? clampToBounds(out, bbox) : out;
}

/* ---------------- pins ----------------
   Grid clustering: pins landing in the same cell of a pixel grid
   collapse into one marker. Cheap, stable as you pan, and good enough
   for the tens-to-hundreds of pins this will ever hold. */

export function clusterPins(pins, view, cellPx = 44) {
  const cells = new Map();
  for (const p of pins || []) {
    if (!p || !Array.isArray(p.ll) || !isNum(p.ll[0]) || !isNum(p.ll[1])) continue;
    const [x, y] = screenOf(view, p.ll[0], p.ll[1]);
    /* Half a screen of slack so markers do not pop in at the edges. */
    if (x < -view.width || x > view.width * 2 || y < -view.height || y > view.height * 2) continue;
    const key = `${Math.floor(x / cellPx)},${Math.floor(y / cellPx)}`;
    const cell = cells.get(key);
    if (cell) { cell.pins.push(p); cell.x += x; cell.y += y; }
    else cells.set(key, { x, y, pins: [p] });
  }
  return [...cells.values()].map((c) => ({
    x: c.x / c.pins.length,
    y: c.y / c.pins.length,
    pins: c.pins,
    count: c.pins.length,
  }));
}

export function clusterAt(clusters, sx, sy, hitPx = 22) {
  let best = null, bestD = hitPx;
  for (const c of clusters || []) {
    const d = Math.hypot(c.x - sx, c.y - sy);
    if (d <= bestD) { bestD = d; best = c; }
  }
  return best;
}

/* ---------------- drawing ----------------
   Takes a 2D context and a palette. Kept here rather than in App.jsx
   so the drawing can be exercised in a test with a recording stub. */

function strokeLines(ctx, view, lines, colour, width) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const line of lines) {
    ctx.beginPath();
    let drawn = 0;
    for (let i = 0; i < line.length; i++) {
      const [x, y] = screenOf(view, line[i][0], line[i][1]);
      if (drawn === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      drawn++;
    }
    if (drawn > 1) ctx.stroke();
  }
}

/* Fill areas, subtracting their holes.

   A lake with an island, or a river that runs around a piece of land, arrives
   from OSM as a multipolygon: one or more "outer" rings and one or more
   "inner" ones. The inner rings are holes. Filling every ring separately
   fills the holes in as well, and a 7.7 x 6.5 km outer ring around the
   Detroit River then sits on top of the University of Windsor.

   Rings that belong to the same multipolygon are added to ONE path and filled
   with the even-odd rule, which is what actually cuts the holes out. Where a
   layer carries no grouping (every shape is its own ring) this behaves
   exactly as it did before. */
function fillShapes(ctx, view, shapes, colour, groups) {
  ctx.fillStyle = colour;

  const ring = (shape) => {
    for (let i = 0; i < shape.length; i++) {
      const [x, y] = screenOf(view, shape[i][0], shape[i][1]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  if (!groups || !groups.length) {
    for (const shape of shapes) {
      if (shape.length < 3) continue;
      ctx.beginPath();
      ring(shape);
      ctx.fill();
    }
    return;
  }

  let i = 0;
  while (i < shapes.length) {
    const g = groups[i];
    ctx.beginPath();
    let any = false;
    while (i < shapes.length && groups[i] === g) {
      if (shapes[i].length >= 3) { ring(shapes[i]); any = true; }
      i++;
    }
    if (any) ctx.fill("evenodd");
  }
}

/* Line weights grow with zoom, or the river is a hairline when you are
   close enough to care about which bank you are on. */
const weightFor = (zoom, base) => Math.max(0.6, base * Math.pow(1.35, zoom - 11));

/* Label a line along its longest on-screen segment, rotated to match, the
   way a street name sits on a paper map. Names repeat across many short
   ways in OSM, so each one is drawn once per screen region - otherwise
   "Wharncliffe Road" appears eleven times down the same street. */
/* ---------------- labels ----------------

   Naming every street turned this from "draw the labels" into "choose the
   labels". There are ten thousand candidates and room for perhaps thirty, so
   everything that wants to put text on the map competes for space in one
   shared occupancy list, in priority order: the river outranks a road, a road
   outranks a residential street. First claim wins; anything that would overlap
   is simply not drawn. That is what stops the map turning into soup. */

export function newLabelSpace(width, height) {
  return { boxes: [], w: width || 0, h: height || 0 };
}

function claim(space, x, y, w, h, pad) {
  const p = pad === undefined ? 3 : pad;
  const l = x - w / 2 - p, r = x + w / 2 + p;
  const t = y - h / 2 - p, b = y + h / 2 + p;
  /* Anything that would be clipped by the edge is not drawn. A label half
     off the screen reads as a different, wrong word. */
  if (space.w && (l < 1 || r > space.w - 1)) return false;
  if (space.h && (t < 1 || b > space.h - 1)) return false;
  const boxes = space.boxes || space;
  for (const o of boxes) {
    if (l < o[2] && r > o[0] && t < o[3] && b > o[1]) return false;
  }
  boxes.push([l, t, r, b]);
  return true;
}

/* measureText is the honest answer; the fallback keeps this working against a
   recording stub in the tests, where there is no font engine to ask. */
function textWidth(ctx, text, size) {
  if (typeof ctx.measureText === "function") {
    const m = ctx.measureText(text);
    if (m && isFinite(m.width) && m.width > 0) return m.width;
  }
  return String(text).length * size * 0.55;
}

/* The halo is not decoration. A label without one is unreadable the moment
   it crosses a road or the river, so it is always drawn - falling back to the
   ground colour the map is painted on when no halo colour was supplied. */
function haloText(ctx, text, x, y, fill, palette, width) {
  ctx.strokeStyle = palette.labelHalo || palette.land || "#fff";
  ctx.lineWidth = width || 3.5;
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/* Label lines - streets, roads, rivers. Picks the longest on-screen run of
   each way, rotates the text along it, and gives up if it will not fit. */
function labelLines(ctx, view, lines, names, palette, opts) {
  const o = opts || {};
  const size = o.size || 10;
  const space = o.space || newLabelSpace();
  const ranks = o.ranks || null;
  const minRank = o.minRank || 0;
  const max = o.max || 40;
  if (!names || !names.length) return;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = (o.weight || "500") + " " + size + "px system-ui, sans-serif";

  /* Gather first, draw second: a long arterial should get its name before a
     side street takes the space, whatever order they sit in the file. */
  const cands = [];
  for (let i = 0; i < lines.length; i++) {
    const name = names[i];
    if (!name) continue;
    if (ranks && (ranks[i] || 0) < minRank) continue;
    const line = lines[i];

    /* The longest straight-ENOUGH run, not the longest single segment.
       A simplified river is a chain of short segments and not one of them is
       long enough to hold "Thames River" - which is exactly why the Thames had
       no name on it. Walking a run and comparing the chord against the
       distance actually walked gives a straightness test: 0.86 keeps a gentle
       river bend and rejects a hairpin, where rotated text would fall off the
       line it is meant to be sitting on. */
    const pts = [];
    let anyOn = false;
    for (let k = 0; k < line.length; k++) {
      const [x, y] = screenOf(view, line[k][0], line[k][1]);
      pts.push(x, y);
      if (!anyOn && x > -40 && x < view.width + 40 && y > -40 && y < view.height + 40) anyOn = true;
    }
    if (!anyOn) continue;

    let bestLen = 0, ax = 0, ay = 0, bx = 0, by = 0;
    const n = pts.length / 2;
    for (let i = 0; i < n - 1; i++) {
      let walked = 0;
      /* Capped: without it this is quadratic across ten thousand streets. */
      const stop = Math.min(n, i + 17);
      for (let j = i + 1; j < stop; j++) {
        const px = pts[j * 2], py = pts[j * 2 + 1];
        walked += Math.hypot(px - pts[(j - 1) * 2], py - pts[(j - 1) * 2 + 1]);
        const ix = pts[i * 2], iy = pts[i * 2 + 1];
        const chord = Math.hypot(px - ix, py - iy);
        if (walked > 1 && chord / walked < 0.86) break;
        const on =
          (ix > 0 && ix < view.width && iy > 0 && iy < view.height) ||
          (px > 0 && px < view.width && py > 0 && py < view.height);
        if (on && chord > bestLen) { bestLen = chord; ax = ix; ay = iy; bx = px; by = py; }
      }
    }
    if (!bestLen) continue;
    cands.push({ name, len: bestLen, rank: ranks ? (ranks[i] || 0) : 0, ax, ay, bx, by });
  }

  /* Biggest road first, then the longest visible run of it. */
  cands.sort((a, b) => (b.rank - a.rank) || (b.len - a.len));

  const seen = new Set();
  let drawn = 0;
  for (const c of cands) {
    if (drawn >= max) break;
    /* One label per name per screen. A street is many OSM ways; without this
       you get "Oxford Street" five times across one block. */
    if (seen.has(c.name)) continue;

    const w = textWidth(ctx, c.name, size);
    if (c.len < w * 1.05) continue;      // no room to sit along the line

    const mx = (c.ax + c.bx) / 2, my = (c.ay + c.by) / 2;
    let angle = Math.atan2(c.by - c.ay, c.bx - c.ax);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;

    /* The claimed box is the rotated text's axis-aligned footprint. */
    const ca = Math.abs(Math.cos(angle)), sa = Math.abs(Math.sin(angle));
    const bw = w * ca + size * sa;
    const bh = w * sa + size * ca;
    if (!claim(space, mx, my, bw, bh)) continue;

    seen.add(c.name);
    drawn++;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    haloText(ctx, c.name, 0, 0, palette.label, palette);
    ctx.restore();
  }
  ctx.restore();
}

/* Label filled shapes - lakes, ponds, parks - in the middle of the shape,
   and only when the shape is big enough on screen to hold the words. */
function labelAreas(ctx, view, shapes, names, palette, opts) {
  const o = opts || {};
  const size = o.size || 11;
  const space = o.space || newLabelSpace();
  const max = o.max || 20;
  if (!names || !names.length) return;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = (o.weight || "500") + " " + size + "px system-ui, sans-serif";

  const cands = [];
  for (let i = 0; i < shapes.length; i++) {
    const name = names[i];
    if (!name) continue;
    const pts = shapes[i];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let sx = 0, sy = 0;
    for (const [lat, lon] of pts) {
      const [x, y] = screenOf(view, lat, lon);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sx += x; sy += y;
    }
    const cx = sx / pts.length, cy = sy / pts.length;
    if (cx < 0 || cx > view.width || cy < 0 || cy > view.height) continue;
    cands.push({ name, cx, cy, area: (maxX - minX) * (maxY - minY), w: maxX - minX });
  }

  /* Biggest first: Fanshawe Lake should get its name before a farm pond. */
  cands.sort((a, b) => b.area - a.area);

  const seen = new Set();
  let drawn = 0;
  for (const c of cands) {
    if (drawn >= max) break;
    /* A lake arrives as several multipolygon members, each carrying the
       lake's name. Label the lake once. */
    if (seen.has(c.name)) continue;
    const w = textWidth(ctx, c.name, size);
    if (c.w < w * 0.9) continue;          // shape too narrow to hold the text
    if (!claim(space, c.cx, c.cy, w, size)) continue;
    seen.add(c.name);
    drawn++;
    haloText(ctx, c.name, c.cx, c.cy, o.colour || palette.label, palette);
  }
  ctx.restore();
}

/* ---------------- points of interest ----------------

   Which app-side filter each OSM kind answers to. Weirs and dams are one
   control because they are one idea to an angler: water dropping over
   something, fish stacked below it. */
export const POI_FILTER = {
  weir: "weir", dam: "weir",
  slipway: "launch", pier: "pier", canoe: "canoe",
  /* All three answer to one control. Whether a lot charges is a property of
     the lot, not a separate thing to hunt for. */
  parking: "parking", "parking-free": "parking", "parking-paid": "parking",
  toilets: "toilets", "water-tap": "water",
};

export const POI_LABEL = {
  weir: "Weir", dam: "Dam", slipway: "Boat launch", pier: "Pier",
  canoe: "Canoe / kayak", toilets: "Washroom", "water-tap": "Drinking water",
  parking: "Parking", "parking-free": "Free parking", "parking-paid": "Paid parking",
};

export const IS_PARKING = (k) => k === "parking" || k === "parking-free" || k === "parking-paid";

function poiGlyph(ctx, kind, x, y, r, ink) {
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  if (IS_PARKING(kind) || kind === "toilets") {
    ctx.font = "700 " + (kind === "toilets" ? r : r * 1.35) + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(kind === "toilets" ? "WC" : "P", x, y + 0.5);
    return;
  }
  if (kind === "weir" || kind === "dam") {
    /* a bar across the flow */
    ctx.fillRect(x - r * 0.62, y - r * 0.2, r * 1.24, r * 0.4);
    return;
  }
  if (kind === "slipway") {
    /* a ramp going down into the water */
    ctx.beginPath();
    ctx.moveTo(x - r * 0.6, y - r * 0.45);
    ctx.lineTo(x + r * 0.6, y + r * 0.5);
    ctx.lineTo(x - r * 0.6, y + r * 0.5);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (kind === "pier") {
    /* a jetty standing out from the bank */
    ctx.fillRect(x - r * 0.15, y - r * 0.6, r * 0.3, r * 1.2);
    ctx.fillRect(x - r * 0.6, y - r * 0.6, r * 0.45, r * 0.25);
    return;
  }
  if (kind === "canoe") {
    /* a hull */
    ctx.beginPath();
    ctx.moveTo(x - r * 0.65, y);
    ctx.quadraticCurveTo(x, y + r * 0.75, x + r * 0.65, y);
    ctx.quadraticCurveTo(x, y + r * 0.25, x - r * 0.65, y);
    ctx.closePath();
    ctx.fill();
    return;
  }
  /* drinking water: a drop */
  ctx.beginPath();
  ctx.arc(x, y + r * 0.15, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

/* One point-of-interest marker, drawn at a point. Exported so the legend can
   draw exactly what the map draws - a hand-drawn legend goes stale the first
   time a symbol changes, and a legend that lies is worse than no legend. */
export function drawPoiSymbol(ctx, kind, x, y, r, palette) {
  const filter = POI_FILTER[kind];
  const civic = filter === "parking" || filter === "toilets" || filter === "water";
  /* Free, paid and not-known-either-way are three different answers and the
     map says which one it has. */
  const ink =
    kind === "parking-paid" ? (palette.poiPaid || palette.poiCivic) :
    kind === "parking-free" ? (palette.poiFree || palette.poiCivic) :
    civic ? palette.poiCivic : palette.poiWater;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.strokeStyle = palette.pinEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  poiGlyph(ctx, kind, x, y, r, palette.pinEdge);

  /* The badge is what makes "paid" readable without consulting the legend.
     Colour alone does not survive a phone screen at arm's length in sun. */
  if (kind === "parking-paid") {
    const bx = x + r * 0.72, by = y - r * 0.72;
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.52, 0, Math.PI * 2);
    ctx.fillStyle = palette.pinEdge;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = "700 " + r * 0.78 + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", bx, by + 0.5);
  }
}

/* Returns the on-screen position of every marker it drew, so the caller can
   hit-test a tap against them. A marker you cannot tap is a marker that can
   only tell you its shape - and the shape of a boat launch does not tell you
   which boat launch it is. */
export function drawPoi(ctx, view, poi, palette, opts) {
  const o = opts || {};
  const show = o.show || null;
  const space = o.space || newLabelSpace();
  const hits = [];
  if (!poi || !poi.length) return hits;
  /* No colours of our own - if the caller did not supply them, draw nothing
     rather than invent a palette. */
  if (!palette.poiWater || !palette.poiCivic) return hits;

  const r = 8;
  ctx.save();
  for (const [lat, lon, kind, name] of poi) {
    const filter = POI_FILTER[kind];
    if (show && !show.has(filter)) continue;

    /* There are over three hundred parking lots within two kilometres of
       downtown. Switching them on at zoom 13 paints a wall of P's over the
       river; at 15 you are looking at a few streets and they are useful.

       This has to come BEFORE the space is claimed. It used to sit after,
       which meant a marker nobody could see was still taking label room from
       a street name somebody could. */
    if ((filter === "parking" || filter === "toilets" || filter === "water") &&
        view.zoom < 15) continue;

    const [x, y] = screenOf(view, lat, lon);
    if (x < -20 || x > view.width + 20 || y < -20 || y > view.height + 20) continue;
    if (!claim(space, x, y, r * 2, r * 2, 1)) continue;

    drawPoiSymbol(ctx, kind, x, y, r, palette);
    hits.push({ x, y, poi: { kind, name: name || "", ll: [lat, lon] } });

    /* The name only once you are close enough that it is not clutter, and
       only if it is really a name - "Boat launch" as a label under a boat
       launch glyph tells you nothing you did not already see. */
    if (view.zoom >= 15 && name) {
      const size = 10;
      ctx.font = "500 " + size + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const w = textWidth(ctx, name, size);
      if (claim(space, x, y + r + 2 + size / 2, w, size)) {
        haloText(ctx, name, x, y + r + 2, palette.label, palette, 3);
      }
    }
  }
  ctx.restore();
  return hits;
}

/* Landmarks are a name and a dot. The dot is small on purpose: it is there
   to anchor the name to a spot, not to be a thing you tap. */
export function drawLandmarks(ctx, view, landmark, palette, opts) {
  const o = opts || {};
  const space = o.space || newLabelSpace();
  const max = o.max || 16;
  if (!landmark || !landmark.length) return [];

  /* Every church and school in downtown London at once is not a map, it is a
     directory. The big ones from 13, the mid ones from 14, everything only
     when you are close enough that they are landmarks again. */
  const minRank = view.zoom >= 16 ? 0 : view.zoom >= 14 ? 1 : 2;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const cands = [];
  for (const [lat, lon, name, rank] of landmark) {
    if ((rank || 0) < minRank) continue;
    const [x, y] = screenOf(view, lat, lon);
    if (x < 0 || x > view.width || y < 0 || y > view.height) continue;
    cands.push({ x, y, name, rank: rank || 0, ll: [lat, lon] });
  }
  cands.sort((a, b) => b.rank - a.rank);

  let drawn = 0;
  const hits = [];
  for (const c of cands) {
    if (drawn >= max) break;
    const size = c.rank === 2 ? 11 : 10;
    ctx.font = (c.rank === 2 ? "600 " : "500 ") + size + "px system-ui, sans-serif";
    const w = textWidth(ctx, c.name, size);
    if (!claim(space, c.x, c.y + 5 + size / 2, w, size + 6)) continue;
    drawn++;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = palette.landmarkDot || palette.label;
    ctx.fill();
    haloText(ctx, c.name, c.x, c.y + 4, palette.placeLabel || palette.label, palette, 3);
    hits.push({ x: c.x, y: c.y, poi: { kind: "landmark", name: c.name, ll: c.ll } });
  }
  ctx.restore();
  return hits;
}

/* ---------------- scale ----------------
   Without this, "zoomed in" is a feeling rather than a distance, and you
   cannot tell whether the next bend is 200 m away or two kilometres. */
export function drawScaleBar(ctx, view, palette) {
  /* Metres per pixel at this latitude and zoom - Web Mercator's scale factor
     is 1/cos(lat), so a bar drawn without it is wrong by 26% up here. */
  const mPerPx =
    (156543.03392 * Math.cos((view.lat * Math.PI) / 180)) / Math.pow(2, view.zoom);
  const target = 92 * mPerPx;
  /* Round to something a person can hold in their head: 1, 2 or 5 x 10^n. */
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const nice = target / pow >= 5 ? 5 * pow : target / pow >= 2 ? 2 * pow : pow;
  const px = nice / mPerPx;
  const label = nice >= 1000 ? (nice / 1000) + " km" : Math.round(nice) + " m";

  const x = 10, y = view.height - 20;
  ctx.save();
  ctx.strokeStyle = palette.labelHalo || palette.land || "#fff";
  ctx.lineWidth = 4;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + px, y);
  ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
  ctx.moveTo(x + px, y - 4); ctx.lineTo(x + px, y + 4);
  ctx.stroke();
  ctx.strokeStyle = palette.label;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + px, y);
  ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
  ctx.moveTo(x + px, y - 4); ctx.lineTo(x + px, y + 4);
  ctx.stroke();
  ctx.font = "600 10px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  haloText(ctx, label, x, y - 5, palette.label, palette, 3);
  ctx.restore();
}

export function drawRegion(ctx, view, data, palette, opts) {
  const o = opts || {};
  const show = o.show || null;
  const on = (k) => !show || show.has(k);
  /* One occupancy list for the whole frame, claimed in priority order. */
  const space = o.space || newLabelSpace(view.width, view.height);
  let landmarkHits = [], poiHits = [];

  ctx.save();
  ctx.fillStyle = palette.land;
  ctx.fillRect(0, 0, view.width, view.height);

  fillShapes(ctx, view, data.park, palette.park, data.parkGroups);
  fillShapes(ctx, view, data.water, palette.water, data.waterGroups);

  /* Streets and paths only once they mean something. Drawing ten thousand
     residential streets at region zoom is a grey smear that costs frames and
     tells you nothing; close in they are the only way to say where you are. */
  /* Landmark buildings only, and only close in: they are for recognising
     where you are standing, not for mapping the city. */
  if (view.zoom >= 15 && on("building")) {
    fillShapes(ctx, view, data.building, palette.building, data.buildingGroups);
  }

  if (view.zoom >= 13) {
    strokeLines(ctx, view, data.street, palette.street, weightFor(view.zoom, 0.35));
  }
  if (view.zoom >= 14 && on("path")) {
    /* Dashed, because a trail is not a road and the difference matters when
       you are working out whether you can get to the bank. */
    ctx.setLineDash?.([3, 3]);
    strokeLines(ctx, view, data.path, palette.path, weightFor(view.zoom, 0.32));
    ctx.setLineDash?.([]);
  }

  /* The border, under the roads. Long dashes, which is the convention for a
     boundary and reads as "a line on a map" rather than "a thing on the
     ground". Drawn whenever there is one in view: across the river from
     Windsor or Sarnia the map simply stops having streets, and without this
     that looks like a bug rather than a decision. */
  if (palette.border && data.border && data.border.length) {
    ctx.setLineDash?.([7, 5]);
    strokeLines(ctx, view, data.border, palette.border, weightFor(view.zoom, 1.1));
    ctx.setLineDash?.([]);
  }

  /* Arterials last of the roads and heaviest, so the hierarchy reads at a
     glance: thick warm line = a road you would name, thin pale line = a
     street, dashes = a path you walk. */
  strokeLines(ctx, view, data.road, palette.road, weightFor(view.zoom, 0.9));
  /* The river gets a casing - a darker line under a lighter one - so it reads
     as a route you can follow rather than a shape lying on the page. */
  if (palette.waterEdge) {
    strokeLines(ctx, view, data.river, palette.waterEdge, weightFor(view.zoom, 1.9));
  }
  strokeLines(ctx, view, data.river, palette.water, weightFor(view.zoom, 1.6));

  /* ---- labels, most important first ---- */

  /* Place names lead: they tell you which town you are looking at, and they
     are the only label that matters when you are zoomed right out. */
  /* Place names start at the bottom of the zoom range, not a third of the way
     up it. Opening a region and being shown a blank green rectangle with a
     river on it is not "zoomed out", it reads as broken - and the one thing
     that tells you where you are looking is the name of the town. Cities from
     the furthest out there is, towns from 10, villages from 12. */
  {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";

    /* Order matters when two names cannot both fit. Bigger place first, and
       among equals the one nearer the centre of the region you are looking at
       - so a map called "Windsor" labels Windsor before it labels Detroit. */
    const c = (data.region && data.region.centre) || null;
    const near = (p) => (c ? Math.hypot(p[0] - c[0], (p[1] - c[1]) * 0.74) : 0);
    const places = data.place.slice().sort(
      (a, b) => (b[3] - a[3]) || (near(a) - near(b)));

    for (const [lat, lon, name, rank] of places) {
      if (rank === 0 && view.zoom < 12) continue;
      if (rank === 1 && view.zoom < 10) continue;
      const [x, y] = screenOf(view, lat, lon);
      if (x < 0 || x > view.width || y < 0 || y > view.height) continue;
      const size = rank === 2 ? 14 : 12;
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      const w = textWidth(ctx, name, size);

      /* Windsor and Detroit are two kilometres apart and matter equally here.
         At a distance their labels overlap, and refusing the second one meant
         only ever seeing one of the pair. Try above and below the point before
         giving up - a name nudged clear of its neighbour is still pointing at
         the right place, and losing it entirely is not. */
      let dy = 0;
      const lift = size + 4;
      if (!claim(space, x, y, w, size)) {
        if (claim(space, x, y - lift, w, size)) dy = -lift;
        else if (claim(space, x, y + lift, w, size)) dy = lift;
        else continue;
      }
      haloText(ctx, name, x, y + dy, palette.placeLabel || palette.label, palette);
    }
    ctx.restore();
  }

  /* Then the water, because this is a fishing map and the river is the point
     of it. A river you cannot name is a blue line. */
  if (view.zoom >= 11) {
    labelLines(ctx, view, data.river, data.riverNames || [], palette,
               { space, size: 11, weight: "600", max: 12 });
  }
  if (view.zoom >= 12) {
    labelAreas(ctx, view, data.water, data.waterNames || [], palette,
               { space, size: 11, weight: "600", max: 14 });
  }

  /* Arterials, then landmarks, then parks. */
  if (view.zoom >= 13) {
    labelLines(ctx, view, data.road, data.roadNames || [], palette,
               { space, size: 11, max: 18 });
  }
  if (view.zoom >= 13 && on("landmark")) {
    landmarkHits = drawLandmarks(ctx, view, data.landmark, palette, { space }) || [];
  }
  if (view.zoom >= 13) {
    labelAreas(ctx, view, data.park, data.parkNames || [], palette,
               { space, size: 10, max: 12 });
  }

  /* Streets last, and tiered: the arterial-ish ones from zoom 14, every
     residential lane only once you are close enough that there is room. */
  if (view.zoom >= 14) {
    labelLines(ctx, view, data.street, data.streetNames || [], palette, {
      space, size: 10, ranks: data.streetRanks,
      minRank: view.zoom >= 16 ? 0 : view.zoom >= 15 ? 1 : 2,
      max: view.zoom >= 16 ? 60 : 34,
    });
  }

  /* Points of interest sit on top of the map but under the pins. */
  if (view.zoom >= 13) {
    poiHits = drawPoi(ctx, view, data.poi, palette, { space, show });
  }

  ctx.restore();
  /* The space so later passes can keep claiming, and everything tappable that
     was drawn, so the caller can hit-test without redoing the geometry. */
  space.hits = landmarkHits.concat(poiHits);
  return space;
}

/* Your own saved spots, drawn on every frame at every zoom.

   These cost nothing - the app already has them - and they are the thing that
   turns the map from a picture of London into a picture of YOUR London. They
   are deliberately a different shape from a pin, not just a different colour,
   because colour alone does not survive a phone screen in sunlight.

   Returns the on-screen positions so the caller can hit-test taps. */
/* Your own saved spots.

   Split into a planning pass and a drawing pass on purpose. Your spots have to
   claim their label space BEFORE the map labels itself, or a generic OSM park
   name takes the room and the place you actually saved goes unnamed - which is
   what happened to "Harris Park & the Forks", sitting nameless under a label
   reading "Harris Park". Yours outranks theirs. */
export function planSpots(ctx, view, spots, space) {
  const hits = [];
  if (!spots || !spots.length) return hits;
  ctx.save();
  const size = 11;
  ctx.font = "600 " + size + "px system-ui, sans-serif";
  for (const sp of spots) {
    if (!sp || !Array.isArray(sp.ll) || sp.ll.length < 2) continue;
    const [x, y] = screenOf(view, sp.ll[0], sp.ll[1]);
    if (x < -20 || x > view.width + 20 || y < -20 || y > view.height + 20) continue;
    let label = false;
    if (view.zoom >= 12 && sp.name && space) {
      const w = textWidth(ctx, sp.name, size);
      label = claim(space, x, y + 11 + size / 2, w, size);
    }
    hits.push({ x, y, spot: sp, label });
  }
  ctx.restore();
  return hits;
}

export function drawSpots(ctx, view, hits, palette) {
  if (!hits || !hits.length) return hits || [];
  const colour = palette.spot || palette.here;
  ctx.save();
  for (const h of hits) {
    /* A diamond: not a circle (community pin), not a dot (landmark).
       Shape, not just colour - colour alone does not survive a phone screen
       held at arm's length in sunlight. */
    ctx.beginPath();
    ctx.moveTo(h.x, h.y - 9);
    ctx.lineTo(h.x + 8, h.y);
    ctx.lineTo(h.x, h.y + 9);
    ctx.lineTo(h.x - 8, h.y);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.strokeStyle = palette.pinEdge;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (h.label) {
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      haloText(ctx, h.spot.name, h.x, h.y + 11, colour, palette, 3);
    }
  }
  ctx.restore();
  return hits;
}

/* Nearest hit within r pixels, or null. Used for spots; pins have their own
   clustering hit-test. */
export function hitAt(hits, sx, sy, r = 16) {
  let best = null, bestD = r * r;
  for (const h of hits || []) {
    const d = (h.x - sx) * (h.x - sx) + (h.y - sy) * (h.y - sy);
    if (d <= bestD) { bestD = d; best = h; }
  }
  return best;
}

export function drawPins(ctx, view, clusters, palette, selectedId) {
  ctx.save();
  for (const c of clusters) {
    const many = c.count > 1;
    const r = many ? 13 : 9;
    const colour = many ? palette.cluster : (palette.pin[c.pins[0].type] || palette.pin.default);

    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.pinEdge;
    ctx.stroke();

    if (many) {
      ctx.fillStyle = palette.pinEdge;
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(c.count), c.x, c.y);
    } else if (selectedId && c.pins[0].id === selectedId) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawHere(ctx, view, lat, lon, palette) {
  if (!isNum(lat) || !isNum(lon)) return;
  const [x, y] = screenOf(view, lat, lon);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = palette.here;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.pinEdge;
  ctx.stroke();
  ctx.restore();
}

/* ---------------- filtering ---------------- */

export function filterPins(pins, { types = null, minScore = null } = {}) {
  return (pins || []).filter((p) => {
    if (!p) return false;
    if (types && types.length && !types.includes(p.type)) return false;
    if (minScore !== null && (Number(p.score) || 0) < minScore) return false;
    return true;
  });
}
