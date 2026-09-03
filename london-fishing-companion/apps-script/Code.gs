/**
 * LONDON FISHING COMPANION — sync backend
 * Google Apps Script web app backed by a Google Sheet.
 *
 * SETUP (about 5 minutes, see SETUP.md):
 *   1. script.google.com → New project → paste this in → save.
 *   2. Change TOKEN below to any private string of your own.
 *   3. Deploy → New deployment → Web app.
 *        Execute as:      Me
 *        Who has access:  Anyone
 *   4. Copy the /exec URL. Paste it and your token into the app's Sync screen.
 *
 * The spreadsheet is created automatically the first time you sync.
 */

var TOKEN = 'change-me-to-something-private';
var SHEET_NAME = 'London Fishing Companion — Data';
var PROP_ID = 'lfc_spreadsheet_id';
var PROP_REV = 'lfc_rev';

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

function doGet(e) {
  return json({
    ok: true,
    service: 'London Fishing Companion sync',
    note: 'This endpoint is live. Paste this URL into the app to sync.'
  });
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents || '{}');

    if (req.token !== TOKEN) {
      return json({ ok: false, error: 'Wrong sync key. Check the token in the app matches TOKEN in the script.' });
    }

    var ss = getSpreadsheet();

    if (req.action === 'pull') {
      return json({ ok: true, rev: getRev(), data: readData(ss), sheetUrl: ss.getUrl() });
    }

    if (req.action === 'push') {
      // Merge rather than overwrite, so two devices can both add fish offline
      // and neither loses anything when they reconnect.
      var merged = mergeData(readData(ss), req.data || {});
      writeData(ss, merged);
      mirrorToSheets(ss, merged);
      return json({ ok: true, rev: bumpRev(), data: merged, sheetUrl: ss.getUrl() });
    }

    if (req.action === 'meta') {
      var d = readData(ss);
      return json({
        ok: true, rev: getRev(), sheetUrl: ss.getUrl(),
        counts: {
          trips: (d.trips || []).length,
          catches: (d.catches || []).length,
          spots: ((d.catalog || {}).spots || []).length
        }
      });
    }

    return json({ ok: false, error: 'Unknown action: ' + req.action });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

function getSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_ID);

  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (err) { /* recreate below */ }
  }

  var ss = SpreadsheetApp.create(SHEET_NAME);
  props.setProperty(PROP_ID, ss.getId());

  var store = ss.getSheets()[0];
  store.setName('_store');
  store.getRange('A1').setValue('{}');
  store.getRange('C1').setValue(
    'Do not edit column A. It holds the app data. ' +
    'Use the Trips and Catches tabs for reading, filtering and charting.'
  );
  store.hideSheet();

  return ss;
}

function readData(ss) {
  var raw = ss.getSheetByName('_store').getRange('A1').getValue();
  try { return JSON.parse(raw || '{}'); } catch (err) { return {}; }
}

function writeData(ss, data) {
  ss.getSheetByName('_store').getRange('A1').setValue(JSON.stringify(data));
}

function getRev() {
  return Number(PropertiesService.getScriptProperties().getProperty(PROP_REV) || 0);
}

function bumpRev() {
  var next = getRev() + 1;
  PropertiesService.getScriptProperties().setProperty(PROP_REV, String(next));
  return next;
}

/* ------------------------------------------------------------------ */
/* Merge — union by id, newest updatedAt wins                          */
/* ------------------------------------------------------------------ */

function mergeLists(a, b) {
  var map = {};
  (a || []).forEach(function (x) { if (x && x.id) map[x.id] = x; });
  (b || []).forEach(function (x) {
    if (!x || !x.id) return;
    var have = map[x.id];
    if (!have || Number(x.updatedAt || 0) >= Number(have.updatedAt || 0)) map[x.id] = x;
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}

function mergeData(server, client) {
  var sc = server.catalog || {}, cc = client.catalog || {};
  return {
    trips: mergeLists(server.trips, client.trips),
    catches: mergeLists(server.catches, client.catches),
    catalog: {
      spots: mergeLists(sc.spots, cc.spots),
      species: mergeLists(sc.species, cc.species),
      baits: mergeLists(sc.baits, cc.baits),
      knots: mergeLists(sc.knots, cc.knots),
      tips: mergeLists(sc.tips, cc.tips),
      photos: Object.assign({}, sc.photos || {}, cc.photos || {})
    },
    deleted: mergeDeleted(server.deleted, client.deleted)
  };
}

// Tombstones, so deleting on one device doesn't get resurrected by another.
function mergeDeleted(a, b) {
  var out = {};
  [a || {}, b || {}].forEach(function (m) {
    Object.keys(m).forEach(function (id) {
      if (!out[id] || m[id] > out[id]) out[id] = m[id];
    });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Readable mirror — this is the point of using Sheets at all          */
/* ------------------------------------------------------------------ */

function mirrorToSheets(ss, data) {
  var trips = data.trips || [];
  var catches = data.catches || [];
  var spotName = {};
  ((data.catalog || {}).spots || []).forEach(function (s) { spotName[s.id] = s.name; });

  var tripById = {};
  trips.forEach(function (t) { tripById[t.id] = t; });

  writeGrid(ss, 'Trips',
    ['Date', 'Spot', 'Started', 'Finished', 'Hours', 'Sky', 'Wind', 'Clarity', 'Level',
     'Air °C', 'Water °C', 'Fish', 'Notes'],
    trips
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
      .map(function (t) {
        var n = catches.filter(function (c) { return c.tripId === t.id; }).length;
        return [t.date, spotName[t.spotId] || t.spotId || '', t.start || '', t.end || '',
          hours(t.start, t.end), t.sky || '', t.wind || '', t.clarity || '', t.level || '',
          t.airTemp || '', t.waterTemp || '', n, t.notes || ''];
      })
  );

  writeGrid(ss, 'Catches',
    ['Date', 'Time', 'Species', 'Length (in)', 'Weight (lb)', 'Spot', 'Bait or lure',
     'Hook and rig', 'Depth (ft)', 'Kept or released', 'Photo', 'Notes'],
    catches
      .sort(function (a, b) {
        return String(b.date + b.time).localeCompare(String(a.date + a.time));
      })
      .map(function (c) {
        var t = tripById[c.tripId];
        return [c.date || '', c.time || '', c.speciesName || c.speciesId || '',
          c.length || '', c.weight || '',
          t ? (spotName[t.spotId] || t.spotId || '') : '',
          c.baitName || c.baitId || '', c.hook || '', c.depth || '',
          c.released === false ? 'Kept' : 'Released', c.photo || '', c.notes || ''];
      })
  );
}

function writeGrid(ss, name, headers, rows) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#2E4A55').setFontColor('#FFFFFF');
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, headers.length);
}

function hours(a, b) {
  if (!a || !b) return '';
  var p = a.split(':'), q = b.split(':');
  var d = (Number(q[0]) * 60 + Number(q[1])) - (Number(p[0]) * 60 + Number(p[1]));
  if (d < 0) d += 1440;
  return Math.round(d / 6) / 10;
}

/* ------------------------------------------------------------------ */
/* Optional: run this by hand to get a link to your spreadsheet        */
/* ------------------------------------------------------------------ */

function showSpreadsheetUrl() {
  Logger.log(getSpreadsheet().getUrl());
}
