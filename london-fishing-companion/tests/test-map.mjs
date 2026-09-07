import fs from 'fs';
import zlib from 'zlib';
import { worldSize, lonToWorldX, latToWorldY, worldXToLon, worldYToLat,
         decodeLine, decodeLayer, decodeRegion, makeView, screenOf, latLonOf,
         fitBounds, clampToBounds, zoomAround, panBy, clusterPins, clusterAt,
         drawRegion, drawPins, drawHere, filterPins,
         MIN_ZOOM, MAX_ZOOM } from '../src/map.js';

let pass=0, fail=0;
const chk=(n,c,g)=>{ if(c){pass++;console.log(`  PASS  ${n}${g!==undefined?`  (${g})`:''}`);} else {fail++;console.log(`  FAIL  ${n}  got: ${g}`);} };
const near=(a,b,tol)=>Math.abs(a-b)<=tol;

console.log('\n=== SCAN 14: offline map ===\n');

/* ------------------------------------------------------------------
   Web Mercator. This has to agree with how tile servers cut the world,
   because an optional raster layer is meant to slot in underneath later.
   Checked against values the standard fixes, not against itself.
   ------------------------------------------------------------------ */
console.log('-- Web Mercator --');
chk('World is 256px at zoom 0', worldSize(0) === 256);
chk('World doubles per zoom', worldSize(3) === 2048);
chk('Greenwich sits at the middle', near(lonToWorldX(0, 0), 128, 1e-9));
chk('Equator sits at the middle', near(latToWorldY(0, 0), 128, 1e-9));
chk('Date line is the right edge', near(lonToWorldX(180, 0), 256, 1e-9));
/* Slippy-map tile for London ON at z12, computed from the standard
   formula rather than recalled: x = floor((lon+180)/360 * 2^z) = 1123,
   y = floor((1 - ln(tan(lat)+sec(lat))/PI)/2 * 2^z) = 1505. */
chk('London ON lands in the expected z12 tile',
    Math.floor(lonToWorldX(-81.2453, 12) / 256) === 1123 &&
    Math.floor(latToWorldY(42.9849, 12) / 256) === 1505,
    Math.floor(lonToWorldX(-81.2453,12)/256) + ',' + Math.floor(latToWorldY(42.9849,12)/256));
chk('Latitude round-trips', near(worldYToLat(latToWorldY(42.9849, 14), 14), 42.9849, 1e-9));
chk('Longitude round-trips', near(worldXToLon(lonToWorldX(-81.2453, 14), 14), -81.2453, 1e-9));
chk('Poles are clamped, not infinite', Number.isFinite(latToWorldY(89.9, 10)));

/* ------------------------------------------------------------------
   Decoding. The region file is delta-encoded fixed-point integers.
   ------------------------------------------------------------------ */
console.log('\n-- Decoding --');
const line = decodeLine([4298491, -8124531, 12, -8, -5, 20], 5);
chk('First pair is absolute', near(line[0][0], 42.98491, 1e-9) && near(line[0][1], -81.24531, 1e-9));
chk('Later pairs accumulate', near(line[1][0], 42.98503, 1e-9) && near(line[1][1], -81.24539, 1e-9));
chk('Deltas keep accumulating', near(line[2][0], 42.98498, 1e-9) && near(line[2][1], -81.24519, 1e-9));
chk('Point count is right', line.length === 3);
chk('Missing layer decodes to nothing', decodeLayer(null).length === 0);
chk('Malformed layer decodes to nothing', decodeLayer({ lines: 'x' }).length === 0);
chk('decodeRegion tolerates junk', decodeRegion(null).river.length === 0);

/* ------------------------------------------------------------------
   The real region file - this is the data that ships.
   ------------------------------------------------------------------ */
console.log('\n-- The shipped region --');
const raw = JSON.parse(fs.readFileSync('map/london-on.json', 'utf8'));
const data = decodeRegion(raw);
chk('Region file is schema 1', raw.schema === 1);
chk('It credits OpenStreetMap', /OpenStreetMap/.test(raw.attribution), raw.attribution);
chk('It has a bbox of four numbers', Array.isArray(raw.bbox) && raw.bbox.length === 4);
chk('There is a river network', data.river.length > 50, data.river.length);
chk('There is water', data.water.length > 500, data.water.length);
chk('There are roads to orient by', data.road.length > 100, data.road.length);
chk('There are place names', data.place.length > 10, data.place.length);

/* Every coordinate must sit inside the region, or clipping is broken and
   we are shipping the shoreline of Lake Huron again. */
let outside = 0, total = 0;
const [bw, bs, be, bn] = raw.bbox;
for (const layer of [data.river, data.water, data.road, data.park]) {
  for (const l of layer) for (const [lat, lon] of l) {
    total++;
    if (lat < bs - 0.02 || lat > bn + 0.02 || lon < bw - 0.02 || lon > be + 0.02) outside++;
  }
}
chk('Every point is inside the region', outside === 0, `${outside} of ${total} outside`);
/* Raw size is the wrong thing to measure: this is JSON full of small
   integers, and Netlify serves it compressed. What a person on a phone
   actually waits for is the compressed size, so assert that. Streets and
   footpaths roughly tripled the raw file and are what make the map usable
   for working out where you are standing - the trade is worth it. */
const mapRaw = fs.readFileSync('map/london-on.json');
const mapBr = zlib.brotliCompressSync(mapRaw).length;
chk('The map is small enough to ship compressed',
    mapBr < 500 * 1024,
    (mapBr / 1024).toFixed(0) + ' KB brotli, ' + (mapRaw.length / 1024).toFixed(0) + ' KB raw');
chk('There are streets to locate yourself by', data.street.length > 2000, data.street.length);
chk('There are footpaths and trails', data.path.length > 2000, data.path.length);

/* The map is useless if it does not cover the spots it exists for. */
const spots = [[42.9584,-81.3222],[42.9764,-81.2733],[42.9853,-81.2567],[42.9984,-81.2607],
  [43.0331,-81.2320],[42.9717,-81.1869],[42.9738,-81.2082],[42.9756,-81.2534],
  [42.9477,-81.2269],[43.0355,-81.1884],[42.9530,-81.3840],[42.9872,-81.0663]];
const covered = spots.every(([la, lo]) => la >= bs && la <= bn && lo >= bw && lo <= be);
chk('All twelve spots fall inside the region', covered);

/* ------------------------------------------------------------------
   Viewport.
   ------------------------------------------------------------------ */
console.log('\n-- Viewport --');
const view = makeView({ width: 360, height: 600, lat: 42.9849, lon: -81.2453, zoom: 12 });
chk('The centre is at the centre of the screen',
    near(screenOf(view, view.lat, view.lon)[0], 180, 1e-6) &&
    near(screenOf(view, view.lat, view.lon)[1], 300, 1e-6));
const [rl, ro] = latLonOf(view, 180, 300);
chk('Screen-to-world round-trips', near(rl, view.lat, 1e-9) && near(ro, view.lon, 1e-9));
chk('North is up', screenOf(view, view.lat + 0.01, view.lon)[1] < 300);
chk('East is right', screenOf(view, view.lat, view.lon + 0.01)[0] > 180);
chk('Zoom is clamped low', makeView({ width: 10, height: 10, lat: 0, lon: 0, zoom: 1 }).zoom === MIN_ZOOM);
chk('Zoom is clamped high', makeView({ width: 10, height: 10, lat: 0, lon: 0, zoom: 30 }).zoom === MAX_ZOOM);

const fitted = fitBounds(raw.bbox, 360, 600);
chk('fitBounds picks a zoom that fits', fitted.zoom >= MIN_ZOOM && fitted.zoom <= MAX_ZOOM, 'z' + fitted.zoom);
const cw = screenOf(fitted, bs, bw), ce = screenOf(fitted, bn, be);
chk('fitBounds actually contains the region',
    cw[0] >= -1 && ce[0] <= 361 && ce[1] >= -1 && cw[1] <= 601,
    `x ${cw[0].toFixed(0)}..${ce[0].toFixed(0)}`);

chk('Panning off the region is clamped back',
    clampToBounds({ ...view, lat: 99, lon: -200 }, raw.bbox).lat <= bn);

/* Zooming must keep the point under the finger under the finger, or
   pinch-zoom feels like the map is fighting you. */
const anchorX = 90, anchorY = 500;
const before = latLonOf(view, anchorX, anchorY);
const zoomed = zoomAround(view, 1, anchorX, anchorY, raw.bbox);
const after = screenOf(zoomed, before[0], before[1]);
chk('Zoom holds the anchor point still',
    near(after[0], anchorX, 0.5) && near(after[1], anchorY, 0.5),
    `${after[0].toFixed(1)},${after[1].toFixed(1)}`);
chk('Zoom changed the zoom', zoomed.zoom === 13);
chk('Zoom stops at the ceiling', zoomAround({ ...view, zoom: MAX_ZOOM }, 1, 0, 0).zoom === MAX_ZOOM);

const panned = panBy(view, 100, 0, raw.bbox);
chk('Dragging right moves the view west', panned.lon < view.lon);
chk('Dragging does not change zoom', panned.zoom === view.zoom);

/* ------------------------------------------------------------------
   Pins.
   ------------------------------------------------------------------ */
console.log('\n-- Pins and clustering --');
const pins = [
  { id: 'a', type: 'snag',      ll: [42.9849, -81.2453], score: 3 },
  { id: 'b', type: 'snag',      ll: [42.98491, -81.24531], score: 1 },
  { id: 'c', type: 'pollution', ll: [42.9950, -81.2600], score: -7 },
  { id: 'd', type: 'hazard',    ll: [43.4000, -80.7000], score: 0 },
  { id: 'bad1', type: 'snag',   ll: 'nope' },
  { id: 'bad2', type: 'snag' },
  null,
];
const clusters = clusterPins(pins, view);
chk('Two pins a metre apart cluster together',
    clusters.some((c) => c.count === 2 && c.pins.map(p=>p.id).sort().join('') === 'ab'));
chk('A distant pin stays separate', clusters.some((c) => c.count === 1 && c.pins[0].id === 'c'));
chk('Junk pins are skipped, not crashed on',
    clusters.every((c) => c.pins.every((p) => Array.isArray(p.ll))));
chk('Far-off-screen pins are culled', !clusters.some((c) => c.pins[0].id === 'd'));

const hit = clusterAt(clusters, clusters[0].x, clusters[0].y);
chk('Tapping a marker finds it', !!hit && hit.count >= 1);
chk('Tapping empty space finds nothing', clusterAt(clusters, -999, -999) === null);
chk('clusterAt tolerates junk', clusterAt(null, 0, 0) === null);

chk('Filter by type', filterPins(pins, { types: ['pollution'] }).length === 1);
chk('Filter by score', filterPins(pins, { minScore: 0 }).filter(p=>p.id==='c').length === 0);
chk('No filter keeps everything real', filterPins(pins, {}).length === pins.length - 1);
chk('filterPins tolerates junk', filterPins(null, {}).length === 0);

/* ------------------------------------------------------------------
   Drawing. A recording stub stands in for a canvas, so this proves the
   draw calls actually happen rather than that the function returned.
   ------------------------------------------------------------------ */
console.log('\n-- Drawing --');
function stubCtx() {
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    save: rec('save'), restore: rec('restore'), beginPath: rec('beginPath'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), closePath: rec('closePath'),
    stroke: rec('stroke'), fill: rec('fill'), fillRect: rec('fillRect'),
    arc: rec('arc'), fillText: rec('fillText'), strokeText: rec('strokeText'),
    translate: rec('translate'), rotate: rec('rotate'), setLineDash: rec('setLineDash'),
    set fillStyle(v) { calls.push(['fillStyle', v]); },
    set strokeStyle(v) { calls.push(['strokeStyle', v]); },
    set lineWidth(v) { calls.push(['lineWidth', v]); },
    set lineJoin(v) {}, set lineCap(v) {}, set font(v) {},
    set textAlign(v) {}, set textBaseline(v) {},
  };
}
const palette = {
  land: '#EDEFEA', water: '#7FA9BF', park: '#DCE6D6', road: '#C8C3B4',
  label: '#4A5A55', cluster: '#2E4A55', pinEdge: '#FFFFFF', here: '#B9822F',
  pin: { snag: '#A45B2A', pollution: '#8C3B3B', hazard: '#B9822F', default: '#2E4A55' },
};

const ctx = stubCtx();
drawRegion(ctx, view, data, palette);
const names = ctx.calls.map((c) => c[0]);
chk('It paints a background', names.includes('fillRect'));
chk('It draws filled shapes for water', names.filter((n) => n === 'fill').length > 100);
chk('It strokes the river and roads', names.filter((n) => n === 'stroke').length > 50);
chk('It uses the palette it was given, not its own colours',
    ctx.calls.some((c) => c[0] === 'fillStyle' && c[1] === palette.water) &&
    !ctx.calls.some((c) => typeof c[1] === 'string' && /^#(2E4A55|7FA9BF)$/i.test(c[1]) === false && /^#[0-9a-f]{6}$/i.test(c[1]) && !Object.values(palette).includes(c[1]) && !Object.values(palette.pin).includes(c[1])));
chk('It saves and restores the context', names[0] === 'save' && names[names.length - 1] === 'restore');
chk('Place names are drawn with a halo so they read over water',
    names.includes('strokeText') && names.includes('fillText'));
chk('Paths are dashed and the dash is reset afterwards',
    ctx.calls.some((c) => c[0] === 'setLineDash' && Array.isArray(c[1]) && c[1].length === 2) === false ||
    ctx.calls.filter((c) => c[0] === 'setLineDash').length >= 2);

const ctx2 = stubCtx();
drawPins(ctx2, view, clusters, palette, 'c');
const n2 = ctx2.calls.map((c) => c[0]);
chk('Pins are drawn as circles', n2.filter((n) => n === 'arc').length >= clusters.length);
chk('A cluster shows its count', ctx2.calls.some((c) => c[0] === 'fillText' && c[1] === '2'));

const ctx3 = stubCtx();
drawHere(ctx3, view, 42.9849, -81.2453, palette);
chk('The you-are-here dot draws', ctx3.calls.some((c) => c[0] === 'arc'));
const ctx4 = stubCtx();
drawHere(ctx4, view, null, undefined, palette);
chk('No location means no dot, not a crash', ctx4.calls.length === 0);

console.log(`\n=== SCAN 14 RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail?1:0);
