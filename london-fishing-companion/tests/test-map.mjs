import fs from 'fs';
import zlib from 'zlib';
import { worldSize, lonToWorldX, latToWorldY, worldXToLon, worldYToLat,
         decodeLine, decodeLayer, decodeRegion, makeView, screenOf, latLonOf,
         fitBounds, clampToBounds, zoomAround, panBy, clusterPins, clusterAt,
         drawRegion, drawPins, drawHere, filterPins,
         layerNames, layerRanks, newLabelSpace, planSpots, drawSpots, hitAt,
         drawPoi, drawLandmarks, drawScaleBar, POI_FILTER, POI_LABEL, IS_PARKING,
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
/* This budget covers the INSTALL payload, not the download payload, and the
   difference is the whole reason the number exists.

   london-on.json is listed in ASSETS in sw.js, so it is precached when the
   service worker installs. Every user pays for it before they have asked for
   anything, on whatever connection they happen to be on. That deserves a
   ceiling.

   Every other region is an opt-in download from the map screen - gta-on is
   7.7 MB raw and is meant to be. The owner's call was explicit: if somebody
   wants a region enough to download it, they want the detail. So opt-in
   regions are deliberately NOT held to this, and adding them here would be
   re-deciding something already decided.

   Raised from 500 KB when anchor towns and the wider corridor took London to
   515 KB brotli. 768 KB keeps the install payload under a megabyte alongside
   the app bundle itself, which is the figure that actually matters to someone
   installing over a phone connection at a boat launch. */
chk('The precached region is small enough to install over a phone connection',
    mapBr < 768 * 1024,
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
    quadraticCurveTo: rec('quadraticCurveTo'), strokeRect: rec('strokeRect'),
    measureText: (t) => ({ width: String(t).length * 5.5 }),
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


/* ---------------------------------------------------------------
   Names, ranks and the new layers.
   --------------------------------------------------------------- */
console.log('\n-- interned names --');

chk('layerNames resolves a name table into strings',
    JSON.stringify(layerNames({ names: [1, 0, 2, 1], nameTable: ['Oxford St', 'Dundas St'] }))
      === JSON.stringify(['Oxford St', 0, 'Dundas St', 'Oxford St']));
chk('A layer with no table still returns its names unchanged',
    JSON.stringify(layerNames({ names: ['A', 0, 'B'] })) === JSON.stringify(['A', 0, 'B']));
chk('An index past the end of the table is dropped, not crashed on',
    layerNames({ names: [9], nameTable: ['only'] })[0] === 0);
chk('layerNames tolerates junk', layerNames(null).length === 0 && layerNames({}).length === 0);
chk('layerRanks returns an empty list when a layer has no ranks',
    layerRanks({ lines: [] }).length === 0);
chk('layerRanks passes ranks through', layerRanks({ ranks: [2, 0, 1] })[1] === 0);

{
  const r = decodeRegion({ layers: {
    river: { scale: 5, lines: [[1, 2, 3, 4]], names: [1], nameTable: ['Thames River'] },
    landmark: [[42.98, -81.25, 'City Hall', 2]],
    poi: [[42.98, -81.25, 'weir', 0]],
  } });
  chk('decodeRegion resolves river names', r.riverNames[0] === 'Thames River');
  chk('decodeRegion carries landmarks', r.landmark.length === 1);
  chk('decodeRegion carries points of interest', r.poi.length === 1);
  chk('Missing layers come back empty, not undefined',
      Array.isArray(r.waterNames) && Array.isArray(r.parkNames) && Array.isArray(r.streetRanks));
}

/* ---------------------------------------------------------------
   Labels compete for one shared space.
   --------------------------------------------------------------- */
console.log('\n-- label space --');

{
  const space = newLabelSpace(400, 300);
  const view = makeView({ width: 400, height: 300, lat: 42.98, lon: -81.25, zoom: 15 });
  const at = (dLat, dLon) => [42.98 + dLat, -81.25 + dLon];
  const ctx = stubCtx();

  const hits = planSpots(ctx, view, [
    { id: 'a', name: 'Harris Park', ll: at(0, 0) },
    { id: 'b', name: 'Overlapping Spot', ll: at(0, 0.00002) },
  ], space);
  chk('Both spots are placed on the map', hits.length === 2);
  chk('The first spot gets its label', hits[0].label === true);
  chk('A spot whose label would land on top of another goes unlabelled',
      hits[1].label === false);
}

{
  /* A long name against the right-hand edge must not be drawn half off. */
  const space = newLabelSpace(400, 300);
  const view = makeView({ width: 400, height: 300, lat: 42.98, lon: -81.25, zoom: 15 });
  const ctx = stubCtx();
  const edge = latLonOf(view, 396, 150);
  const hits = planSpots(ctx, view, [
    { id: 'e', name: 'A Very Long Spot Name Indeed', ll: edge },
  ], space);
  chk('A label that would run off the edge is not drawn at all',
      hits.length === 1 && hits[0].label === false);
}

{
  const ctx = stubCtx();
  const view = makeView({ width: 400, height: 300, lat: 42.98, lon: -81.25, zoom: 15 });
  const hits = planSpots(ctx, view, [{ id: 'a', name: 'Spot', ll: [42.98, -81.25] }],
                         newLabelSpace(400, 300));
  const ctx2 = stubCtx();
  drawSpots(ctx2, view, hits, { spot: '#4A6B4E', pinEdge: '#fff', land: '#eee', label: '#333' });
  const n = ctx2.calls.map((c) => c[0]);
  chk('A spot is drawn as a four-sided diamond, not a circle',
      n.filter((x) => x === 'lineTo').length >= 3 && !n.includes('arc'));
  chk('The spot marker uses the palette colour it was given',
      ctx2.calls.some((c) => c[0] === 'fillStyle' && c[1] === '#4A6B4E'));
}

chk('hitAt finds the nearest marker within range',
    hitAt([{ x: 10, y: 10, spot: 'far' }, { x: 52, y: 50, spot: 'near' }], 50, 50, 16).spot === 'near');
chk('hitAt returns nothing when the tap is not on a marker',
    hitAt([{ x: 10, y: 10, spot: 'a' }], 200, 200, 16) === null);
chk('hitAt tolerates an empty list', hitAt([], 1, 1) === null && hitAt(null, 1, 1) === null);

/* ---------------------------------------------------------------
   Points of interest.
   --------------------------------------------------------------- */
console.log('\n-- points of interest --');

chk('Weirs and dams answer to one control, because they are one idea',
    POI_FILTER.weir === 'weir' && POI_FILTER.dam === 'weir');
chk('A slipway is filed under boat launches', POI_FILTER.slipway === 'launch');
chk('Free, paid and unknown parking all answer to the one Parking control',
    POI_FILTER['parking-free'] === 'parking' && POI_FILTER['parking-paid'] === 'parking' &&
    POI_FILTER.parking === 'parking');
chk('Each parking kind says which it is', POI_LABEL['parking-free'] === 'Free parking' &&
    POI_LABEL['parking-paid'] === 'Paid parking' && POI_LABEL.parking === 'Parking');
chk('IS_PARKING knows all three and nothing else',
    IS_PARKING('parking') && IS_PARKING('parking-free') && IS_PARKING('parking-paid') &&
    !IS_PARKING('toilets') && !IS_PARKING('weir'));

{
  const pal = { poiWater: '#1F5A6E', poiCivic: '#6B6B63', poiFree: '#4A7A52', poiPaid: '#A2701F',
                pinEdge: '#fff', label: '#333', land: '#eee', labelHalo: '#eee' };
  const v16 = makeView({ width: 400, height: 300, lat: 42.98, lon: -81.25, zoom: 16 });
  const draw = (kind) => {
    const c = stubCtx();
    drawPoi(c, v16, [[42.98, -81.25, kind, 0]], pal,
            { show: new Set(['parking']), space: newLabelSpace(400, 300) });
    return c;
  };
  chk('A free lot is drawn in the free colour',
      draw('parking-free').calls.some((c) => c[0] === 'fillStyle' && c[1] === '#4A7A52'));
  chk('A paid lot is drawn in the paid colour',
      draw('parking-paid').calls.some((c) => c[0] === 'fillStyle' && c[1] === '#A2701F'));
  chk('An untagged lot stays grey rather than guessing free',
      draw('parking').calls.some((c) => c[0] === 'fillStyle' && c[1] === '#6B6B63') &&
      !draw('parking').calls.some((c) => c[0] === 'fillStyle' && c[1] === '#4A7A52'));
  const paidText = draw('parking-paid').calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  chk('Paid parking carries a $ badge, so it does not rely on colour alone',
      paidText.includes('P') && paidText.includes('$'));
  chk('A free lot has no badge',
      !draw('parking-free').calls.filter((c) => c[0] === 'fillText').map((c) => c[1]).includes('$'));
}

chk('Every kind that can be drawn has a filter and a label',
    Object.keys(POI_FILTER).every((k) => POI_LABEL[k]));

{
  const poiPalette = { poiWater: '#1F5A6E', poiCivic: '#6B6B63', pinEdge: '#fff',
                       label: '#333', land: '#eee', labelHalo: '#eee' };
  const view = makeView({ width: 400, height: 300, lat: 42.98, lon: -81.25, zoom: 16 });
  /* Far enough apart that they are not competing for the same 16 px of
     screen - at zoom 16 a tenth of a millidegree is six pixels. */
  const poi = [[42.98, -81.25, 'weir', 0], [42.9820, -81.2530, 'parking', 0]];

  const a = stubCtx();
  drawPoi(a, view, poi, poiPalette, { show: new Set(['weir']), space: newLabelSpace(400, 300) });
  chk('A filtered-out kind is not drawn',
      a.calls.some((c) => c[0] === 'fillStyle' && c[1] === '#1F5A6E') &&
      !a.calls.some((c) => c[0] === 'fillStyle' && c[1] === '#6B6B63'));

  const b = stubCtx();
  const far = makeView({ width: 400, height: 300, lat: 42.98, lon: -81.25, zoom: 13 });
  drawPoi(b, far, poi, poiPalette, { show: new Set(['weir', 'parking']), space: newLabelSpace(400, 300) });
  chk('Parking stays off until zoom 15, even when it is switched on',
      !b.calls.some((c) => c[0] === 'fillStyle' && c[1] === '#6B6B63'));

  const c = stubCtx();
  drawPoi(c, view, poi, poiPalette, { show: new Set(['weir', 'parking']), space: newLabelSpace(400, 300) });
  chk('Parking is drawn once you are close enough',
      c.calls.some((cc) => cc[0] === 'fillStyle' && cc[1] === '#6B6B63'));

  const d = stubCtx();
  drawPoi(d, view, poi, { label: '#333' }, { show: null, space: newLabelSpace(400, 300) });
  chk('With no palette for them, no points of interest are invented',
      d.calls.length === 0);
}

/* ---------------------------------------------------------------
   The river has to be able to carry its own name. This is the
   regression test for the bug where it could not: a simplified river
   is a chain of short segments, and the old code needed ONE segment
   long enough to hold the text.
   --------------------------------------------------------------- */
console.log('\n-- the river carries its name --');

{
  const view = makeView({ width: 400, height: 300, lat: 42.98, lon: -81.25, zoom: 15 });
  /* Forty short, gently curving steps - the shape a real simplified river
     arrives in. No single segment is anywhere near wide enough for the text. */
  const line = [];
  for (let i = 0; i < 40; i++) {
    line.push([42.9770 + i * 0.00022, -81.2560 + i * 0.00004 + Math.sin(i / 9) * 0.00006]);
  }
  const data = {
    river: [line], riverNames: ['North Thames River'],
    water: [], waterNames: [], park: [], parkNames: [], building: [],
    street: [], streetNames: [], streetRanks: [], road: [], roadNames: [],
    path: [], place: [], landmark: [], poi: [],
  };
  const pal = { land: '#eee', water: '#A8C8D8', waterEdge: '#2E4A55', park: '#ddd',
                road: '#C9A87C', street: '#CFCABD', path: '#9E8B63', building: '#D5D1C6',
                label: '#4A4A44', labelHalo: '#EDEFEA', placeLabel: '#2F3A34' };
  const ctx = stubCtx();
  drawRegion(ctx, view, data, pal);
  chk('A river of many short segments still gets its name',
      ctx.calls.some((c) => c[0] === 'fillText' && c[1] === 'North Thames River'));
  chk('The river name is rotated to follow the water',
      ctx.calls.some((c) => c[0] === 'rotate'));
  chk('The river is drawn with a casing under it, so it reads as a route',
      ctx.calls.some((c) => c[0] === 'strokeStyle' && c[1] === '#2E4A55') &&
      ctx.calls.some((c) => c[0] === 'strokeStyle' && c[1] === '#A8C8D8'));
}

{
  /* A hairpin is not somewhere you can lay text. */
  const view = makeView({ width: 400, height: 300, lat: 42.98, lon: -81.25, zoom: 15 });
  const zig = [];
  for (let i = 0; i < 30; i++) zig.push([42.980 + (i % 2) * 0.0002, -81.2560 + i * 0.000012]);
  const data = {
    river: [zig], riverNames: ['Switchback Creek'],
    water: [], waterNames: [], park: [], parkNames: [], building: [],
    street: [], streetNames: [], streetRanks: [], road: [], roadNames: [],
    path: [], place: [], landmark: [], poi: [],
  };
  const ctx = stubCtx();
  drawRegion(ctx, view, data, { land: '#eee', water: '#A8C8D8', park: '#ddd', road: '#C9A87C',
                                street: '#CFCABD', path: '#9E8B63', building: '#D5D1C6',
                                label: '#4A4A44', labelHalo: '#EDEFEA' });
  chk('Text is not laid along a hairpin it would fall off',
      !ctx.calls.some((c) => c[0] === 'fillText' && c[1] === 'Switchback Creek'));
}

/* ---------------------------------------------------------------
   Scale bar.
   --------------------------------------------------------------- */
console.log('\n-- scale bar --');

{
  const view = makeView({ width: 400, height: 300, lat: 42.98, lon: -81.25, zoom: 15 });
  const ctx = stubCtx();
  drawScaleBar(ctx, view, { label: '#333', labelHalo: '#eee', land: '#eee' });
  const text = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])[0];
  chk('The scale bar states a round distance', /^(1|2|5)(0*) (m|km)$/.test(text || ''), text);

  /* Web Mercator stretches with latitude. A bar computed without the cosine
     term would claim the same distance in London as at the equator. */
  const north = makeView({ width: 400, height: 300, lat: 70, lon: -81.25, zoom: 15 });
  const ctxN = stubCtx();
  drawScaleBar(ctxN, north, { label: '#333', labelHalo: '#eee', land: '#eee' });
  const textN = ctxN.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])[0];
  chk('The same zoom at a different latitude is a different distance',
      textN !== text, textN + ' vs ' + text);
}

/* ---------------------------------------------------------------
   Landmarks.
   --------------------------------------------------------------- */
console.log('\n-- landmarks --');

{
  const pal = { label: '#333', labelHalo: '#eee', land: '#eee', placeLabel: '#222' };
  const marks = [[42.980, -81.250, 'Big Hospital', 2], [42.9805, -81.2505, 'Small Church', 0]];

  const mid = stubCtx();
  drawLandmarks(mid, makeView({ width: 400, height: 300, lat: 42.98, lon: -81.25, zoom: 14 }),
                marks, pal, { space: newLabelSpace(400, 300) });
  const midText = mid.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  chk('At middling zoom only the landmarks worth the space are named',
      midText.includes('Big Hospital') && !midText.includes('Small Church'));

  const close = stubCtx();
  drawLandmarks(close, makeView({ width: 400, height: 300, lat: 42.98, lon: -81.25, zoom: 16 }),
                marks, pal, { space: newLabelSpace(400, 300) });
  const closeText = close.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  chk('Close in, the smaller ones become landmarks again',
      closeText.includes('Big Hospital') && closeText.includes('Small Church'));
}


/* ---------------------------------------------------------------
   Holes in water.

   A lake with an island, or a river running around a piece of land,
   arrives as a multipolygon: outer rings and inner ones. The inner
   rings are HOLES. Filling every ring separately fills them in, and a
   7.7 x 6.5 km outer ring around the Detroit River then sits on top of
   the University of Windsor. That happened.
   --------------------------------------------------------------- */
console.log('\n-- holes are cut out, not filled in --');

{
  const view = makeView({ width: 400, height: 300, lat: 42.98, lon: -81.25, zoom: 13 });
  const outer = [[42.97, -81.27], [42.99, -81.27], [42.99, -81.23], [42.97, -81.23]];
  const inner = [[42.979, -81.259], [42.981, -81.259], [42.981, -81.251], [42.979, -81.251]];
  const base = {
    river: [], riverNames: [], park: [], parkNames: [], building: [],
    street: [], streetNames: [], streetRanks: [], road: [], roadNames: [],
    path: [], place: [], landmark: [], poi: [], waterNames: [],
  };
  const pal = { land: '#eee', water: '#A8C8D8', park: '#ddd', road: '#C9A87C',
                street: '#CFCABD', path: '#9E8B63', building: '#D5D1C6',
                label: '#4A4A44', labelHalo: '#EDEFEA' };

  /* Grouped: both rings belong to one multipolygon. */
  const grouped = stubCtx();
  drawRegion(grouped, view, { ...base, water: [outer, inner], waterGroups: [1, 1] }, pal);
  const gFills = grouped.calls.filter((c) => c[0] === 'fill');
  chk('Rings of one multipolygon are filled as a single path',
      gFills.length === 1, gFills.length);
  chk('and with the even-odd rule, which is what cuts the hole out',
      gFills[0][1] === 'evenodd', gFills[0][1]);

  /* Ungrouped: the old behaviour, still correct for plain ways. */
  const loose = stubCtx();
  drawRegion(loose, view, { ...base, water: [outer, inner], waterGroups: [] }, pal);
  chk('A layer with no grouping fills each shape on its own, as before',
      loose.calls.filter((c) => c[0] === 'fill').length === 2);

  /* Two separate multipolygons must not be merged into one path. */
  const two = stubCtx();
  drawRegion(two, view, { ...base, water: [outer, inner, outer], waterGroups: [1, 1, 2] }, pal);
  chk('Separate multipolygons stay separate paths',
      two.calls.filter((c) => c[0] === 'fill').length === 2);

  /* A ring too small to be a polygon must not swallow the group. */
  const degenerate = stubCtx();
  drawRegion(degenerate, view,
    { ...base, water: [[[42.98, -81.25], [42.98, -81.25]], outer], waterGroups: [3, 3] }, pal);
  chk('A degenerate ring does not stop its group being drawn',
      degenerate.calls.filter((c) => c[0] === 'fill').length === 1);

  const empty = stubCtx();
  drawRegion(empty, view, { ...base, water: [], waterGroups: [] }, pal);
  chk('No water is not a crash', empty.calls.length > 0);
}

/* ---------------------------------------------------------------
   Two cities that matter equally, two kilometres apart.
   --------------------------------------------------------------- */
console.log('\n-- neighbouring cities both get named --');

{
  const base = {
    river: [], riverNames: [], water: [], waterNames: [], park: [], parkNames: [],
    building: [], street: [], streetNames: [], streetRanks: [], road: [], roadNames: [],
    path: [], landmark: [], poi: [],
  };
  const pal = { land: '#eee', water: '#A8C8D8', park: '#ddd', road: '#C9A87C',
                street: '#CFCABD', path: '#9E8B63', building: '#D5D1C6',
                label: '#4A4A44', labelHalo: '#EDEFEA', placeLabel: '#2F3A34' };
  const view = makeView({ width: 400, height: 300, lat: 42.32, lon: -83.04, zoom: 12 });
  /* Windsor and Detroit, real coordinates, about 2 km apart. */
  const place = [[42.3149, -83.0364, 'Windsor', 2], [42.3314, -83.0458, 'Detroit', 2]];

  const ctx = stubCtx();
  drawRegion(ctx, view, { ...base, place, region: { centre: [42.3149, -83.0364] } }, pal);
  const drawn = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  chk('Both cities are named even though their labels collide',
      drawn.includes('Windsor') && drawn.includes('Detroit'), drawn.join(','));

  /* When only one can possibly fit, it should be the region's own. */
  const tight = makeView({ width: 400, height: 300, lat: 42.32, lon: -83.04, zoom: 9 });
  const ctx2 = stubCtx();
  drawRegion(ctx2, tight, { ...base, place, region: { centre: [42.3149, -83.0364] } }, pal);
  const d2 = ctx2.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  chk('Zoomed right out, the region\'s own city wins the space',
      d2.includes('Windsor'), d2.join(','));

  /* A city must be named at the very bottom of the zoom range - opening a
     region on a blank rectangle reads as broken, not as far away. */
  const far = makeView({ width: 400, height: 300, lat: 42.32, lon: -83.04, zoom: MIN_ZOOM });
  const ctx3 = stubCtx();
  drawRegion(ctx3, far, { ...base, place, region: { centre: [42.3149, -83.0364] } }, pal);
  chk('Cities are named even at the furthest zoom out',
      ctx3.calls.some((c) => c[0] === 'fillText' && c[1] === 'Windsor'));

  /* Towns from 10, villages not until 12. */
  const mixed = [[42.32, -83.04, 'Town', 1], [42.33, -83.05, 'Village', 0]];
  const at10 = stubCtx();
  drawRegion(at10, makeView({ width: 400, height: 300, lat: 42.32, lon: -83.04, zoom: 10 }),
             { ...base, place: mixed }, pal);
  const t10 = at10.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  chk('A town is named from zoom 10 and a village is not',
      t10.includes('Town') && !t10.includes('Village'), t10.join(','));
}

console.log(`\n=== SCAN 14 RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail?1:0);
