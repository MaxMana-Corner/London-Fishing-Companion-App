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

export function layerNames(layer) {
  return (layer && Array.isArray(layer.names)) ? layer.names : [];
}

/* Decode once, at load. Doing it per frame would be absurd - the
   whole region is only ~56,000 points. */
export function decodeRegion(region) {
  const layers = (region && region.layers) || {};
  return {
    region: region || null,
    river: decodeLayer(layers.river),
    water: decodeLayer(layers.water),
    road: decodeLayer(layers.road),
    street: decodeLayer(layers.street),
    streetNames: layerNames(layers.street),
    roadNames: layerNames(layers.road),
    path: decodeLayer(layers.path),
    park: decodeLayer(layers.park),
    building: decodeLayer(layers.building),
    place: Array.isArray(layers.place) ? layers.place : [],
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

function fillShapes(ctx, view, shapes, colour) {
  ctx.fillStyle = colour;
  for (const shape of shapes) {
    if (shape.length < 3) continue;
    ctx.beginPath();
    for (let i = 0; i < shape.length; i++) {
      const [x, y] = screenOf(view, shape[i][0], shape[i][1]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/* Line weights grow with zoom, or the river is a hairline when you are
   close enough to care about which bank you are on. */
const weightFor = (zoom, base) => Math.max(0.6, base * Math.pow(1.35, zoom - 11));

/* Label a line along its longest on-screen segment, rotated to match, the
   way a street name sits on a paper map. Names repeat across many short
   ways in OSM, so each one is drawn once per screen region - otherwise
   "Wharncliffe Road" appears eleven times down the same street. */
function labelLines(ctx, view, lines, names, palette, minZoom, size) {
  if (view.zoom < minZoom || !names.length) return;
  const drawn = new Set();
  ctx.save();
  ctx.fillStyle = palette.label;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = size + "px system-ui, sans-serif";

  for (let i = 0; i < lines.length; i++) {
    const name = names[i];
    if (!name) continue;
    const line = lines[i];

    /* longest segment that is actually on screen */
    let bestLen = 0, ax = 0, ay = 0, bx = 0, by = 0;
    for (let k = 1; k < line.length; k++) {
      const [x1, y1] = screenOf(view, line[k - 1][0], line[k - 1][1]);
      const [x2, y2] = screenOf(view, line[k][0], line[k][1]);
      const onScreen =
        (x1 > 0 && x1 < view.width && y1 > 0 && y1 < view.height) ||
        (x2 > 0 && x2 < view.width && y2 > 0 && y2 < view.height);
      if (!onScreen) continue;
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len > bestLen) { bestLen = len; ax = x1; ay = y1; bx = x2; by = y2; }
    }
    /* Too short to hold the text is worse than no label at all. */
    if (bestLen < name.length * size * 0.5) continue;

    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const key = name + "@" + Math.round(mx / 220) + "," + Math.round(my / 220);
    if (drawn.has(key)) continue;
    drawn.add(key);

    let angle = Math.atan2(by - ay, bx - ax);
    /* Never upside down. */
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    /* A halo, so a name stays readable where it crosses a road or the river. */
    ctx.strokeStyle = palette.labelHalo;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeText(name, 0, 0);
    ctx.fillText(name, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

export function drawRegion(ctx, view, data, palette) {
  ctx.save();
  ctx.fillStyle = palette.land;
  ctx.fillRect(0, 0, view.width, view.height);

  fillShapes(ctx, view, data.park, palette.park);
  fillShapes(ctx, view, data.water, palette.water);

  /* Streets and paths only once they mean something. Drawing ten thousand
     residential streets at region zoom is a grey smear that costs frames and
     tells you nothing; close in they are the only way to say where you are. */
  /* Landmark buildings only, and only close in: they are for recognising
     where you are standing, not for mapping the city. */
  if (view.zoom >= 15) {
    fillShapes(ctx, view, data.building, palette.building);
  }

  if (view.zoom >= 13) {
    strokeLines(ctx, view, data.street, palette.street, weightFor(view.zoom, 0.35));
  }
  if (view.zoom >= 14) {
    /* Dashed, because a trail is not a road and the difference matters when
       you are working out whether you can get to the bank. */
    ctx.setLineDash?.([3, 3]);
    strokeLines(ctx, view, data.path, palette.path, weightFor(view.zoom, 0.32));
    ctx.setLineDash?.([]);
  }

  /* Arterials last of the roads and heaviest, so the hierarchy reads at a
     glance: thick warm line = a road you would name, thin pale line = a
     street, dashes = a path you walk. */
  strokeLines(ctx, view, data.road, palette.road, weightFor(view.zoom, 0.9));
  strokeLines(ctx, view, data.river, palette.water, weightFor(view.zoom, 1.6));

  labelLines(ctx, view, data.street, data.streetNames, palette, 15, 10);
  labelLines(ctx, view, data.road, data.roadNames, palette, 13, 11);

  /* Place names only once there is room for them to mean something. */
  if (view.zoom >= 10) {
    ctx.fillStyle = palette.label;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [lat, lon, name, rank] of data.place) {
      if (rank === 0 && view.zoom < 12) continue;
      if (rank === 1 && view.zoom < 11) continue;
      const [x, y] = screenOf(view, lat, lon);
      if (x < 0 || x > view.width || y < 0 || y > view.height) continue;
      ctx.font = `${rank === 2 ? 13 : 11}px system-ui, sans-serif`;
      ctx.fillText(name, x, y);
    }
  }
  ctx.restore();
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
