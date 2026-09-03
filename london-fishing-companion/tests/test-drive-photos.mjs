import fs from 'fs';
let pass=0, fail=0;
const chk=(n,c,g)=>{ if(c){pass++;console.log(`  PASS  ${n}${g!==undefined?`  (${g})`:''}`);} else {fail++;console.log(`  FAIL  ${n}  ${g||''}`);} };

/* Deployable root — see the note in test-dist.mjs. */
const DIST = '.';

const GD = fs.readFileSync('src/gdrive.js','utf8');
const PH = fs.readFileSync('src/photos.js','utf8');
const A  = fs.readFileSync('src/App.jsx','utf8');
const IDX= fs.readFileSync(`${DIST}/index.html`,'utf8');
const PRIV=fs.readFileSync(`${DIST}/privacy.html`,'utf8');

console.log('\n=== DRIVE / PHOTOS / ARCHIVE ===\n');

console.log('-- Per-user, private, narrow scope (the promises made) --');
chk('Uses drive.file scope only', GD.includes('auth/drive.file') && !GD.includes('auth/drive.readonly') && !/auth\/drive['"]/.test(GD));
chk('No Gmail/contacts/calendar scope', !/gmail|contacts|calendar/i.test(GD));
{ // strip comments so a doc line saying "we never call permissions.create" isn't a false positive
  const code = GD.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  chk('Never creates a share permission (code, not comments)',
      !/permissions/i.test(code) && !/\/permissions/.test(code), 'no permissions endpoint in code');
}
chk('No "anyone with link" sharing', !/anyoneWithLink|'anyone'|"anyone"/.test(GD));
chk('Reads files back with the user token, not a public link', GD.includes('alt=media') && GD.includes('Bearer'));
chk('Token kept in memory only, never persisted', !/(saveKey|localStorage|setItem)/.test(GD));
chk('App does not persist connected=true across reloads', A.includes('connected: false });  // token never survives a reload'));
chk('Sign-out revokes the token', GD.includes('oauth2.revoke'));

console.log('-- Fails safe --');
chk('driveSupported() blocks file:// origins', GD.includes("/^https?:$/.test"));
chk('Missing client ID handled', GD.includes('No Google client ID is configured'));
chk('Popup-blocked message', GD.includes('popup was blocked'));
chk('401/403 clears token and asks for sign-in', GD.includes('needs-signin'));
chk('All Drive calls have a timeout', GD.includes('AbortController') && GD.includes('setTimeout'));
chk('No throw to caller (returns ok:false)', GD.includes('return { ok: false'));

console.log('-- Photo pipeline --');
chk('Compresses to a bounded size', PH.includes('FULL_MAX = 1600'));
chk('Permanent thumbnail generated', PH.includes('THUMB_MAX'));
chk('Rejects non-images', PH.includes("!/^image\\//.test"));
chk('Rejects absurdly large files', PH.includes('40 * 1024 * 1024'));
chk('Stores full bytes + thumb + metadata', /buf,/.test(PH) && /thumb,/.test(PH));

/* The iOS data-loss bug: a Blob read out of IndexedDB and written back comes
   out zero-length on WebKit, which silently destroyed every photo the first
   time "Back up everything now" recorded a Drive id. Full-size bytes are an
   ArrayBuffer now, and nothing re-saves a record with a Blob still in it. */
chk('Full-size bytes converted to ArrayBuffer before storing', PH.includes('toArrayBuffer(full)'));
chk('No Blob is ever written into a record', !/blob: full|blob: b\b/.test(PH));
chk('Legacy Blob records migrated on write', PH.includes('async function ensureBuf'));
chk('Zero-length blob treated as absent (falls through to thumb)', PH.includes('photo.blob.size > 0'));
chk('Backup records the Drive id without rewriting bytes',
    A.includes('PH.setPhotoDrive(') && !/putPhoto\(\{\s*\.\.\.p,\s*driveId/.test(A),
    'setPhotoDrive used instead of putPhoto({...p, driveId})');
chk('CatchPhoto falls back when the full image will not load', A.includes('onError={onImgError}'));
chk('Drive re-fetch after a failed local image is tried once only', A.includes('state.driveTried'));

console.log('-- Catch photos travel with an export --');
chk('Export collects catch photos from IndexedDB', PH.includes('export async function photosForExport'));
chk('Import writes them back', PH.includes('export async function importPhotos'));
chk('Full if local, thumbnail only if archived', PH.includes('full,') && PH.includes('if (b) { try { full = await blobToDataURL(b); }'));
chk('Import never downgrades a local full-size copy',
    PH.includes('if (existing && hasLocal(existing) && !inc.full)'));
chk('DB version bumped for the photos store', PH.includes('DB_VERSION = 2'));
chk('Entry point matches that DB version', fs.readFileSync('src/main.jsx','utf8').includes('DB_VERSION = 2'));
chk('Entry point creates the photos store', fs.readFileSync('src/main.jsx','utf8').includes('"photos"'));

console.log('-- Archiving: the safety-critical ordering --');
const arch = PH.slice(PH.indexOf('export async function archivePhotos'));
const upIdx = arch.indexOf('uploader('), delIdx = arch.indexOf('blob: null');
chk('Uploads BEFORE dropping the local original', upIdx > -1 && delIdx > upIdx, `upload@${upIdx} < clear@${delIdx}`);
chk('Only clears local copy after a verified id', arch.includes('!up.ok || !up.id'));
chk('Failed upload never deletes anything', arch.includes('results.failed++') && arch.includes('continue'));
chk('Thumbnail is never deleted', !/thumb: null|delete .*thumb/.test(PH));
chk('Stops early if sign-in is needed', arch.includes("up?.error === \"needs-signin\""));
chk('Storage write failure aborts that photo', arch.includes('if (!w.ok)'));
chk('Threshold is 80%', PH.includes('ARCHIVE_THRESHOLD = 0.8'));
chk('Oldest first', PH.includes('(a.takenAt || 0) - (b.takenAt || 0)'));
chk('Archives down past the threshold (no re-trigger loop)', PH.includes('targetRatio = 0.6'));

console.log('-- Display fallback chain --');
chk('CatchPhoto falls back to thumbnail', A.includes('state.url || state.thumb'));
chk('Tells you when the original is in Drive', A.includes('Full photo is in your Google Drive'));
chk('Handles needing sign-in to view', A.includes('connect Drive to view it'));
chk('Revokes object URLs on unmount', A.includes('revokeObjectURL'));

console.log('-- Camera --');
chk('Native camera handoff', A.includes('capture="environment"'));
chk('Separate "choose from library" path', A.includes('libRef'));
chk('Capture works without Drive connected', !/capture[\s\S]{0,400}drive\.connected/.test(A));

console.log('-- Gauge auto-selection --');
chk('Auto-selects nearest gauge', A.includes('autoSelectGauge'));
chk('Capped at 50 km', A.includes('st.distance <= 50'));
chk('Lazy — only when a spot is opened', A.includes('onAutoGauge(spot)'));
chk('Tried-once guard prevents repeat calls', A.includes('autoGaugeTried'));
chk('Never overwrites a manual choice', A.includes('if (!spot || spot.hydroStation'));
chk('Tells the user it was automatic', A.includes('Nearest gauge picked automatically'));

console.log('-- Deployment shell --');
chk('Client ID slot present in index.html', IDX.includes('window.LFC_GOOGLE_CLIENT_ID'));
/* The slot may legitimately be empty (template) or hold a real client ID (the
   deployed copy). A Google OAuth client ID is a public identifier — it ships in
   the HTML by design, and is not a secret. What must NOT happen is a malformed
   or placeholder value, which fails at sign-in rather than at build time. */
{ const m = IDX.match(/LFC_GOOGLE_CLIENT_ID\s*=\s*"([^"]*)"/);
  chk('Client ID slot is either empty or a well-formed Google client ID',
      !!m && (m[1]==='' || /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(m[1])),
      m ? (m[1] ? `${m[1].slice(0,12)}…` : 'empty') : 'slot not found'); }
chk('Privacy policy exists', PRIV.length > 1500, `${PRIV.length} chars`);
chk('Privacy names drive.file explicitly', PRIV.includes('drive.file'));
chk('Privacy states files are private', /created <strong>private<\/strong>/.test(PRIV));
chk('Privacy names both data services', PRIV.includes('Open-Meteo') && PRIV.includes('Environment and Climate Change Canada'));
chk('Privacy precached for offline', fs.readFileSync(`${DIST}/sw.js`,'utf8').includes('privacy.html'));
/* Read the version out of sw.js rather than hardcoding it here — a literal
   copy of "lfc-v5" sat in this file long after sw.js had moved to v6. */
chk('SW cache is versioned', /lfc-v\d+/.test(fs.readFileSync(`${DIST}/sw.js`,'utf8')),
    (fs.readFileSync(`${DIST}/sw.js`,'utf8').match(/lfc-v\d+/)||['none'])[0]);

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail?1:0);
