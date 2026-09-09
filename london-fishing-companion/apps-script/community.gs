/* ============================================================
   community.gs — the community submission bridge.

   A SECOND, SEPARATE Apps Script deployment. It is not Code.gs and
   must never be merged into it: Code.gs syncs one person's log to
   one spreadsheet, this one publishes community content to GitHub.
   They happen to run under the same Google account and that is the
   only thing they share.

   Why this exists at all: the app has no backend, and a GitHub
   write token cannot live in browser JavaScript. This script holds
   the token server-side and is the only thing that can write to the
   community repositories.

   What it does with a submission:
     clean text, no photo  ->  branch + commit + pull request against
                               the live directory, for the owner to merge
     anything else         ->  committed straight to the matching review
                               repository, where nothing is published
                               until the owner moves it across

   Setup:
     1. Project Settings -> Script Properties -> add GITHUB_TOKEN
        (a fine-grained PAT with Contents, Pull requests and Issues
        write on the four community repositories).
     2. Deploy -> New deployment -> Web app,
        Execute as: Me, Who has access: Anyone.
     3. Give the /exec URL to the app.

   The app posts with Content-Type text/plain deliberately. An
   application/json body would trigger a CORS preflight, and Apps
   Script web apps cannot answer OPTIONS. Code.gs already does the
   same thing for the same reason.
   ============================================================ */

var OWNER = 'MaxMana-Corner';
var PACKS_REPO = 'london-fishing-community-packs';

var REVIEW_REPO = {
  pack: 'london-fishing-community-review-packs',
  locations: 'london-fishing-community-review-locations',
  pins: 'london-fishing-community-review-pins'
};

var FOLDER = { pack: 'packs', locations: 'locations', pins: 'pins' };

var BLOCKLIST_URL = 'https://raw.githubusercontent.com/' + OWNER + '/' +
                    PACKS_REPO + '/main/moderation/blocklist.txt';

var API = 'https://api.github.com';

/* Apps Script will happily accept a huge POST and then die slowly.
   Cap it here so a bad submission fails fast with a real message. */
var MAX_JSON_BYTES = 512 * 1024;
var MAX_PHOTO_BYTES = 700 * 1024;   // base64 inflates ~4/3, so ~500 KB of file

/* A soft brake on spam, not a security control. CacheService tops out
   at six hours, so this is a rolling six-hour window rather than a
   true daily cap - stated plainly rather than pretending otherwise.
   The real control is that a human merges every pull request. */
var SUBMIT_CAP = 10;
var CAP_WINDOW_SECONDS = 6 * 60 * 60;

/* ---------------- entry points ---------------- */

function doGet() {
  return json_({ ok: true, service: 'lfc-community-bridge' });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (req.action === 'submit') return json_(submit_(req));
    if (req.action === 'vote') return json_(vote_(req));
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    // Never leak a stack trace or anything token-shaped to the caller.
    return json_({ ok: false, error: 'That submission could not be read.' });
  }
}

/* ---------------- the submission flow ---------------- */

function submit_(req) {
  var type = String(req.type || '');
  if (!FOLDER[type]) return { ok: false, error: 'Unknown submission type.' };

  var device = String(req.deviceId || '').slice(0, 64);
  if (!device) return { ok: false, error: 'Missing device id.' };
  if (!rateOk_('s_' + device, SUBMIT_CAP)) {
    return { ok: false, error: 'That is a lot of submissions in one go. Try again later.' };
  }

  var payload = req.payload;
  if (!payload || typeof payload !== 'object' || payload instanceof Array) {
    return { ok: false, error: 'That submission has no content.' };
  }

  var shape = checkShape_(type, payload);
  if (!shape.ok) return shape;

  var body = JSON.stringify(payload, null, 2);
  if (byteLength_(body) > MAX_JSON_BYTES) {
    return { ok: false, error: 'That submission is too large.' };
  }

  var photo = req.photo ? String(req.photo) : null;
  if (photo) {
    if (type !== 'locations') {
      return { ok: false, error: 'Only a location can carry a photo.' };
    }
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(photo)) {
      return { ok: false, error: 'That photo could not be read.' };
    }
    if (photo.length > MAX_PHOTO_BYTES) {
      return { ok: false, error: 'That photo is too large. Keep it under 500 KB.' };
    }
  }

  var title = String(req.title || '').slice(0, 120).trim();
  if (!title) return { ok: false, error: 'Give it a title.' };
  var author = String(req.author || 'Anonymous').slice(0, 60).trim() || 'Anonymous';

  var id = uniqueId_(title);

  /* The server stamps the metadata it actually verified, rather than
     trusting whatever the client claimed. build-index.mjs regenerates
     index.json purely from these blocks, which is what lets the catalog
     be derived instead of hand-edited. */
  payload.meta = {
    id: id,
    type: type,
    title: title,
    description: String(req.description || '').slice(0, 300),
    author: author,
    contributedAt: new Date().toISOString()
  };

  /* Re-stringify: the size check above ran on the payload as received,
     but what gets committed has to include the meta block. */
  body = JSON.stringify(payload, null, 2);

  var hits = scan_(collectText_(payload) + ' ' + title + ' ' + String(req.description || '') + ' ' + author);

  /* A word filter cannot look at an image. Anything carrying a photo
     goes to review regardless of how clean the text is. */
  var toReview = hits.length > 0 || !!photo;
  var reason = hits.length
    ? 'blocked words: ' + hits.join(', ')
    : (photo ? 'carries a photo, which needs a human to look at it' : '');

  try {
    if (toReview) {
      return holdForReview_(type, id, body, photo, title, author, reason);
    }
    return openPullRequest_(type, id, body, title, author);
  } catch (err) {
    return { ok: false, error: 'GitHub refused that submission. Try again later.' };
  }
}

/* ---------------- destinations ---------------- */

/* Clean text, no photo: a branch and a pull request against the live
   directory. index.json is NOT touched - a workflow regenerates it on
   merge, so submissions never collide on the catalog. */
function openPullRequest_(type, id, body, title, author) {
  var branch = 'submission/' + id;
  var base = defaultSha_(PACKS_REPO, 'main');
  createBranch_(PACKS_REPO, branch, base);

  var path = FOLDER[type] + '/' + id + '.json';
  putFile_(PACKS_REPO, path, body, branch,
           'Add ' + type + ': ' + title);

  var pr = ghJson_('post', '/repos/' + OWNER + '/' + PACKS_REPO + '/pulls', {
    title: 'Add ' + type + ': ' + title,
    head: branch,
    base: 'main',
    body: [
      'Submitted from the app.',
      '',
      '- **Type:** ' + type,
      '- **Shared by:** ' + author,
      '- **File:** `' + path + '`',
      '',
      'The automated word check runs on this pull request. Read the diff',
      'before merging - the blocklist is a first filter, not a decision.'
    ].join('\n')
  });

  return { ok: true, status: 'submitted', url: pr.html_url || null };
}

/* Flagged, or carrying a photo: straight into the review repository.
   No pull request, because nothing here should be one click from
   being published. */
function holdForReview_(type, id, body, photo, title, author, reason) {
  var repo = REVIEW_REPO[type];
  var stamp = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
  var dir = 'held/' + stamp + '-' + id;

  putFile_(repo, dir + '/submission.json', body, 'main',
           'Hold for review: ' + title);

  if (photo) {
    putFileRaw_(repo, dir + '/photo.webp', photo, 'main',
                'Hold for review: photo for ' + title);
  }

  putFile_(repo, dir + '/README.md', [
    '# Held for review',
    '',
    '- **Title:** ' + title,
    '- **Shared by:** ' + author,
    '- **Type:** ' + type,
    '- **Received:** ' + new Date().toISOString(),
    '- **Why it is here:** ' + reason,
    '',
    'Nothing in this repository is published. To accept it, move',
    '`submission.json` into the matching folder of the packs repository',
    'as `' + FOLDER[type] + '/' + id + '.json` and open a pull request there.',
    '',
    'If a photo is present, look at it before accepting: it must show the',
    'place, not people.'
  ].join('\n'), 'main', 'Hold for review: notes for ' + title);

  return { ok: true, status: 'flagged', url: null };
}

/* ---------------- shape checks ---------------- */

function checkShape_(type, p) {
  if (p.app !== 'london-fishing-companion') {
    return { ok: false, error: 'That file did not come from this app.' };
  }
  if (type === 'pins') {
    if (p.kind !== 'pins' || !(p.pins instanceof Array) || !p.pins.length) {
      return { ok: false, error: 'That pin set has no pins in it.' };
    }
    for (var i = 0; i < p.pins.length; i++) {
      var pin = p.pins[i];
      if (!pin || typeof pin !== 'object') return { ok: false, error: 'A pin is unreadable.' };
      if (!pin.id || !pin.type) return { ok: false, error: 'A pin is missing its id or type.' };
      if (!(pin.ll instanceof Array) || pin.ll.length !== 2) {
        return { ok: false, error: 'A pin has no coordinates.' };
      }
      var lat = Number(pin.ll[0]), lon = Number(pin.ll[1]);
      if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return { ok: false, error: 'A pin has impossible coordinates.' };
      }
    }
    return { ok: true };
  }
  // pack and locations share the app's own Field Guide Pack format
  if (p.kind !== 'pack' || !p.catalog || typeof p.catalog !== 'object') {
    return { ok: false, error: 'That is not a Field Guide Pack.' };
  }
  var keys = ['spots', 'species', 'baits', 'knots', 'tips'], total = 0;
  for (var k = 0; k < keys.length; k++) {
    var list = p.catalog[keys[k]];
    if (list instanceof Array) total += list.length;
  }
  if (!total) return { ok: false, error: 'That pack is empty.' };
  return { ok: true };
}

/* ---------------- moderation ---------------- */

/* The blocklist lives in the packs repository so it can be tuned by
   pull request instead of by editing this script. Cached for six
   hours; an unreachable list must not block submissions, so a failure
   returns an empty list and everything falls through to the human. */
function blocklist_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('blocklist');
  if (hit !== null) return JSON.parse(hit);

  var words = [];
  try {
    var res = UrlFetchApp.fetch(BLOCKLIST_URL, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      var lines = res.getContentText().split('\n');
      for (var i = 0; i < lines.length; i++) {
        var w = lines[i].trim().toLowerCase();
        if (w && w.charAt(0) !== '#') words.push(w);
      }
    }
  } catch (err) { /* leave words empty */ }

  cache.put('blocklist', JSON.stringify(words), CAP_WINDOW_SECONDS);
  return words;
}

function scan_(text) {
  var hay = String(text || '').toLowerCase();
  var words = blocklist_(), hits = [];
  for (var i = 0; i < words.length; i++) {
    if (hay.indexOf(words[i]) !== -1) hits.push(words[i]);
  }
  return hits;
}

/* Every string anywhere in the payload, so a blocked word cannot hide
   in a field nobody thought to check. */
function collectText_(node, depth) {
  depth = depth || 0;
  if (depth > 8) return '';
  if (typeof node === 'string') return node + ' ';
  if (node instanceof Array) {
    var out = '';
    for (var i = 0; i < node.length; i++) out += collectText_(node[i], depth + 1);
    return out;
  }
  if (node && typeof node === 'object') {
    var s = '';
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) s += collectText_(node[k], depth + 1);
    }
    return s;
  }
  return '';
}

/* ---------------- GitHub ---------------- */

function token_() {
  var t = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!t) throw new Error('no token configured');
  return t;
}

function gh_(method, path, payload) {
  var opts = {
    method: method,
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + token_(),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  };
  if (payload) opts.payload = JSON.stringify(payload);
  return UrlFetchApp.fetch(API + path, opts);
}

function ghJson_(method, path, payload) {
  var res = gh_(method, path, payload);
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    // Log for the owner, return nothing identifying to the caller.
    console.error('GitHub ' + code + ' on ' + method + ' ' + path + ': ' + res.getContentText().slice(0, 300));
    throw new Error('github ' + code);
  }
  return JSON.parse(res.getContentText() || '{}');
}

function defaultSha_(repo, branch) {
  var ref = ghJson_('get', '/repos/' + OWNER + '/' + repo + '/git/ref/heads/' + branch);
  return ref.object.sha;
}

function createBranch_(repo, branch, sha) {
  ghJson_('post', '/repos/' + OWNER + '/' + repo + '/git/refs', {
    ref: 'refs/heads/' + branch, sha: sha
  });
}

function putFile_(repo, path, text, branch, message) {
  return putFileRaw_(repo, path, Utilities.base64Encode(text, Utilities.Charset.UTF_8), branch, message);
}

function putFileRaw_(repo, path, base64, branch, message, sha) {
  var payload = { message: message, content: base64, branch: branch };
  /* The contents API needs the current blob sha to replace a file.
     Without it GitHub reads the call as "create" and refuses, because
     the path already exists. */
  if (sha) payload.sha = sha;
  return ghJson_('put', '/repos/' + OWNER + '/' + repo + '/contents/' + path, payload);
}

/* ---------------- small helpers ---------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* The id becomes a filename and a branch name, and it is derived from
   user input, so it is whitelisted rather than escaped. The random
   suffix avoids two people submitting "Best Spot" from colliding. */
function uniqueId_(title) {
  var slug = String(title).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (!slug) slug = 'submission';
  var rand = Utilities.getUuid().split('-')[0];
  return slug + '-' + rand;
}

function byteLength_(s) {
  return Utilities.newBlob(s).getBytes().length;
}

function rateOk_(key, cap) {
  var cache = CacheService.getScriptCache();
  var k = 'rl_' + key;
  var n = Number(cache.get(k) || 0);
  if (n >= cap) return false;
  cache.put(k, String(n + 1), CAP_WINDOW_SECONDS);
  return true;
}

/* ============================================================
   Voting.

   Votes are shared mutable state, which a folder of JSON on GitHub
   is bad at. So they are kept in a Google Sheet - one row per
   (device, item) - and a scheduled job turns that ledger into a
   stats.json the app can read as a static file.

   That means scores are as of the last run, never live. The app
   labels them that way rather than implying otherwise.

   Run setupVoting() once from the editor. It creates the ledger,
   installs the 3-hourly trigger, and prints where everything is.
   ============================================================ */

var VOTE_WINDOW_SECONDS = 6 * 60 * 60;
var VOTE_CAP = 60;                  /* per device per window - a brake, not a wall */
var NEGATIVE_THRESHOLD = -5;        /* below this, a human is asked to look */
var LEDGER_HEADERS = ['deviceId', 'itemId', 'itemType', 'direction', 'updatedAt'];

/* ---------------- one-time setup ---------------- */

function setupVoting() {
  var props = PropertiesService.getScriptProperties();

  var id = props.getProperty('VOTES_SHEET_ID');
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('London Fishing Companion - community votes');
    props.setProperty('VOTES_SHEET_ID', ss.getId());
  }
  ledger_(ss);

  var already = false;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'rebuildStats') already = true;
  }
  if (!already) {
    ScriptApp.newTrigger('rebuildStats').timeBased().everyHours(3).create();
  }

  var msg = [
    'Vote ledger: ' + ss.getUrl(),
    'Trigger: ' + (already ? 'already installed' : 'installed, every 3 hours'),
    'Token: ' + (props.getProperty('GITHUB_TOKEN') ? 'present' : 'MISSING - add GITHUB_TOKEN'),
  ].join('\n');
  console.log(msg);
  return msg;
}

function ledger_(ss) {
  ss = ss || SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('VOTES_SHEET_ID'));
  var sh = ss.getSheetByName('votes');
  if (!sh) {
    sh = ss.insertSheet('votes');
    sh.appendRow(LEDGER_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ---------------- casting a vote ----------------

   Re-sending the same direction clears the vote rather than stacking
   it, so the button is a three-state toggle: up, neutral, down. */

function vote_(req) {
  var itemId = String(req.itemId || '').slice(0, 200);
  var itemType = String(req.itemType || '').slice(0, 40);
  var dir = Number(req.direction);
  var device = String(req.deviceId || '').slice(0, 64);

  if (!itemId) return { ok: false, error: 'Nothing to vote on.' };
  if (!device) return { ok: false, error: 'Missing device id.' };
  if (dir !== 1 && dir !== -1) return { ok: false, error: 'A vote is up or down.' };
  if (!rateOk_('v_' + device, VOTE_CAP)) {
    return { ok: false, error: 'That is a lot of voting. Try again later.' };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return { ok: false, error: 'Busy, try again in a moment.' };
  }

  try {
    var sh = ledger_();
    var values = sh.getDataRange().getValues();
    var rowIndex = -1, existing = 0;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][0]) === device && String(values[r][1]) === itemId) {
        rowIndex = r + 1;
        existing = Number(values[r][3]) || 0;
        break;
      }
    }

    var now = new Date().toISOString();
    var applied;
    if (rowIndex < 0) {
      sh.appendRow([device, itemId, itemType, dir, now]);
      applied = dir;
    } else if (existing === dir) {
      sh.deleteRow(rowIndex);
      applied = 0;
    } else {
      sh.getRange(rowIndex, 4, 1, 2).setValues([[dir, now]]);
      applied = dir;
    }

    /* A live tally so the button can settle honestly straight away,
       rather than waiting up to three hours to look right. */
    var tally = tallyFor_(itemId);
    return { ok: true, yourVote: applied, up: tally.up, down: tally.down, score: tally.score };
  } finally {
    lock.releaseLock();
  }
}

function tallyFor_(itemId) {
  var values = ledger_().getDataRange().getValues();
  var up = 0, down = 0;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][1]) !== itemId) continue;
    if (Number(values[r][3]) === 1) up++; else if (Number(values[r][3]) === -1) down++;
  }
  return { up: up, down: down, score: up - down };
}

/* ---------------- the scheduled rebuild ----------------

   Aggregates the ledger, writes stats.json, and commits ONLY when a
   tally actually changed - otherwise the repository fills with empty
   commits every three hours forever.

   The id set comes from index.json, so a pack that was removed stops
   carrying a score, and a newly merged one starts at zero rather than
   at nothing. build-index.mjs maintains the same invariant from the
   other side, so the two agree instead of fighting. */

function rebuildStats() {
  var index = ghFile_(PACKS_REPO, 'index.json');
  if (!index) { console.error('rebuildStats: no index.json'); return; }
  var entries = (JSON.parse(index.text).entries) || [];

  var counts = {};
  for (var i = 0; i < entries.length; i++) {
    counts[entries[i].id] = { up: 0, down: 0, score: 0, type: entries[i].type };
  }

  var values = ledger_().getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    var id = String(values[r][1]);
    if (!counts[id]) continue;             /* votes for things no longer listed are ignored */
    var d = Number(values[r][3]);
    if (d === 1) counts[id].up++; else if (d === -1) counts[id].down++;
  }

  var scores = {};
  var negatives = [];
  for (var id2 in counts) {
    if (!Object.prototype.hasOwnProperty.call(counts, id2)) continue;
    var c = counts[id2];
    c.score = c.up - c.down;
    scores[id2] = { up: c.up, down: c.down, score: c.score };
    if (c.score <= NEGATIVE_THRESHOLD) negatives.push({ id: id2, type: c.type, c: c });
  }

  var current = ghFile_(PACKS_REPO, 'stats.json');
  var currentScores = null;
  try { currentScores = JSON.parse(current.text).scores; } catch (e) { currentScores = null; }

  if (currentScores && JSON.stringify(currentScores) === JSON.stringify(scores)) {
    console.log('rebuildStats: nothing changed, not committing');
  } else {
    var body = JSON.stringify({
      schema: 1,
      generatedAt: new Date().toISOString(),
      note: 'Derived file. Regenerated from the vote ledger by community.gs on a 3-hourly trigger. Do not hand-edit.',
      scores: scores,
    }, null, 2) + '\n';
    putFileRaw_(PACKS_REPO, 'stats.json',
      Utilities.base64Encode(body, Utilities.Charset.UTF_8), 'main',
      'Update community vote tallies', current && current.sha);
    console.log('rebuildStats: committed ' + Object.keys(scores).length + ' tallies');
  }

  for (var n = 0; n < negatives.length; n++) flagNegative_(negatives[n]);
}

/* Nothing is ever auto-hidden. A badly-received item gets a human
   asked to look at it, once - the issue is deduplicated by title so a
   three-hourly job cannot spam the same complaint forever. */
function flagNegative_(item) {
  var repo = REVIEW_REPO[item.type] || REVIEW_REPO.pack;
  var title = 'Low score: ' + item.id;
  try {
    var found = ghJson_('get', '/search/issues?q=' +
      encodeURIComponent('repo:' + OWNER + '/' + repo + ' is:issue is:open in:title "' + title + '"'));
    if (found && found.total_count > 0) return;

    ghJson_('post', '/repos/' + OWNER + '/' + repo + '/issues', {
      title: title,
      body: [
        'The community has voted this down.',
        '',
        '- **Item:** `' + item.id + '` (' + item.type + ')',
        '- **Score:** ' + item.c.score + '  (' + item.c.up + ' up, ' + item.c.down + ' down)',
        '',
        'Nothing has been hidden. Read it and decide whether it should stay.',
        'Votes are one-per-device and easy to game, so treat this as a',
        'prompt to look, not a verdict.',
      ].join('\n'),
    });
    console.log('flagged ' + item.id);
  } catch (err) {
    console.error('could not flag ' + item.id + ': ' + err);
  }
}

/* Read a file plus its blob sha, which the contents API needs in order
   to update rather than create. */
function ghFile_(repo, path) {
  var res = gh_('get', '/repos/' + OWNER + '/' + repo + '/contents/' + path + '?ref=main');
  if (res.getResponseCode() !== 200) return null;
  var j = JSON.parse(res.getContentText());
  return {
    sha: j.sha,
    text: Utilities.newBlob(Utilities.base64Decode(j.content)).getDataAsString(),
  };
}

/* Maintenance. Wipes the ledger and rewrites stats.json to all zeroes.
   Run it from the editor if the ledger has picked up junk - test votes,
   or votes cast while something was misbehaving. There is no undo, which
   is why it is a function you have to go and run rather than anything the
   app can reach. */
function clearAllVotes() {
  var sh = ledger_();
  var last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1);
  rebuildStats();
  var msg = 'Ledger cleared (' + Math.max(0, last - 1) + ' rows) and stats.json rebuilt.';
  console.log(msg);
  return msg;
}
