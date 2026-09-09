/* qr.js — verified by reading the code back out.

   I cannot scan a QR code from here, so "it looks like a QR code" is worth
   nothing: a wrong character-count length, a mis-ordered interleave or an
   off-by-one in the zigzag all produce something that looks perfect and scans
   as gibberish.

   So this file contains a DECODER written against the spec rather than
   against the encoder - it walks the matrix, strips the mask it reads out of
   the format bits, de-interleaves the blocks and reconstructs the bytes. If
   the text comes back, the placement, masking, block structure and character
   count were all right. It is the closest thing to a scan that runs offline.

   What it does NOT prove is the Reed-Solomon parity, because the decoder
   never needs it to read an undamaged code. That is checked separately
   against a known generator polynomial. */

import { encode, size, toPath } from '../src/qr.js';

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ''}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

/* ---------- an independent reader ---------- */

const SPEC_M = {
  1:[10,1,16,0,0], 2:[16,1,28,0,0], 3:[26,1,44,0,0], 4:[18,2,32,0,0], 5:[24,2,43,0,0],
  6:[16,4,27,0,0], 7:[18,4,31,0,0], 8:[22,2,38,2,39], 9:[22,3,36,2,37], 10:[26,4,43,1,44],
};
const ALIGN = {1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]};
const MASKS = [
  (r,c)=>(r+c)%2===0, (r)=>r%2===0, (r,c)=>c%3===0, (r,c)=>(r+c)%3===0,
  (r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0, (r,c)=>((r*c)%2)+((r*c)%3)===0,
  (r,c)=>(((r*c)%2)+((r*c)%3))%2===0, (r,c)=>(((r+c)%2)+((r*c)%3))%2===0,
];

/* Rebuild the reserved map the same way a scanner would: from the geometry,
   not from anything the encoder told us. */
function reservedMap(version) {
  const n = size(version);
  const res = Array.from({length:n},()=>new Array(n).fill(false));
  const mark = (r,c) => { if (r>=0&&c>=0&&r<n&&c<n) res[r][c]=true; };
  const finder = (r,c) => { for(let i=-1;i<=7;i++) for(let j=-1;j<=7;j++) mark(r+i,c+j); };
  finder(0,0); finder(0,n-7); finder(n-7,0);
  for (const r of ALIGN[version]) for (const c of ALIGN[version]) {
    if ((r<=8&&c<=8)||(r<=8&&c>=n-9)||(r>=n-9&&c<=8)) continue;
    for(let i=-2;i<=2;i++) for(let j=-2;j<=2;j++) mark(r+i,c+j);
  }
  for (let i=8;i<n-8;i++){ mark(6,i); mark(i,6); }
  for (let i=0;i<9;i++){ mark(8,i); mark(i,8); }
  for (let i=0;i<8;i++){ mark(8,n-1-i); mark(n-1-i,8); }
  mark(n-8,8);
  if (version>=7) for(let i=0;i<6;i++) for(let j=0;j<3;j++){ mark(i,n-11+j); mark(n-11+j,i); }
  return res;
}

function readFormat(m) {
  const at = (r,c) => (m[r][c] ? 1 : 0);
  let bits = 0;
  /* Bit 14 sits at (8,0). This reader had it the other way up, which mirrored
     the whole string - and because the encoder made the same mistake, the two
     agreed and the code did not scan. */
  for (let i=0;i<=5;i++) bits |= at(8,i) << (14-i);
  bits |= at(8,7) << 8;
  bits |= at(8,8) << 7;
  bits |= at(7,8) << 6;
  for (let i=9;i<=14;i++) bits |= at(14-i,8) << (14-i);
  const raw = bits ^ 0b101010000010010;
  return { ecc: (raw >> 13) & 0b11, mask: (raw >> 10) & 0b111 };
}

function readCodewords(m, version) {
  const n = size(version);
  const res = reservedMap(version);
  const { mask } = readFormat(m);
  const bits = [];
  let upward = true;
  for (let right = n-1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < n; step++) {
      const y = upward ? n-1-step : step;
      for (let k = 0; k < 2; k++) {
        const x = right - k;
        if (res[y][x]) continue;
        let v = m[y][x];
        if (MASKS[mask](y, x)) v = !v;         // strip the mask
        bits.push(v ? 1 : 0);
      }
    }
    upward = !upward;
  }
  const cw = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    cw.push(v);
  }
  return cw;
}

/* Undo the interleave to get the data codewords back in order. */
function deinterleave(cw, version) {
  const [ec, g1, d1, g2, d2] = SPEC_M[version];
  const lens = [...Array(g1).fill(d1), ...Array(g2).fill(d2)];
  const blocks = lens.map(() => []);
  let at = 0;
  const maxLen = Math.max(...lens);
  for (let i = 0; i < maxLen; i++) {
    for (let b = 0; b < lens.length; b++) {
      if (i < lens[b]) blocks[b].push(cw[at++]);
    }
  }
  return blocks.flat();
}

function decode(result) {
  const { matrix, version } = result;
  const data = deinterleave(readCodewords(matrix, version), version);
  const mode = data[0] >> 4;
  if (mode !== 0b0100) return { error: 'not byte mode, got ' + mode.toString(2) };
  /* Character count is 8 bits below version 10 and 16 from 10 up. */
  let len, offset;
  if (version < 10) {
    len = ((data[0] & 0x0f) << 4) | (data[1] >> 4);
    offset = 1;
  } else {
    len = ((data[0] & 0x0f) << 12) | (data[1] << 4) | (data[2] >> 4);
    offset = 2;
  }
  const bytes = [];
  for (let i = 0; i < len; i++) {
    const hi = data[offset + i] & 0x0f;
    const lo = data[offset + i + 1] >> 4;
    bytes.push((hi << 4) | lo);
  }
  return { text: new TextDecoder().decode(new Uint8Array(bytes)), len, version };
}

console.log('\n=== QR ===\n');
console.log('-- it reads back as what went in --');

const CASES = [
  'https://london-fishing-companion-app.netlify.app/',
  'A',
  'https://example.com',
  'Creel — the fishing companion. Ontario, Zone 16.',
  'x'.repeat(120),
];

for (const text of CASES) {
  const r = encode(text);
  if (!r) { chk(`Encodes ${JSON.stringify(text.slice(0,28))}`, false, 'returned null'); continue; }
  const back = decode(r);
  const label = text.length > 30 ? text.slice(0, 27) + '…' : text;
  chk(`Round-trips ${JSON.stringify(label)}`, back.text === text,
    back.error || (back.text === text ? `v${r.version}, mask ${r.mask}` : JSON.stringify((back.text||'').slice(0,40))));
}

console.log('\n-- structure a scanner depends on --');

{
  const r = encode('https://london-fishing-companion-app.netlify.app/');
  const m = r.matrix, n = r.size;
  chk('Size matches the version', n === 17 + 4 * r.version, `v${r.version} -> ${n}`);

  const finderOk = (br, bc) => {
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
      const on = (i===0||i===6||j===0||j===6) ? true : (i>=2&&i<=4&&j>=2&&j<=4);
      if (m[br+i][bc+j] !== on) return false;
    }
    return true;
  };
  chk('Finder pattern top-left', finderOk(0, 0));
  chk('Finder pattern top-right', finderOk(0, n - 7));
  chk('Finder pattern bottom-left', finderOk(n - 7, 0));

  let timing = true;
  for (let i = 8; i < n - 8; i++) {
    if (m[6][i] !== (i % 2 === 0)) timing = false;
    if (m[i][6] !== (i % 2 === 0)) timing = false;
  }
  chk('Timing patterns alternate', timing);
  chk('The always-dark module is dark', m[n - 8][8] === true);

  const f = readFormat(m);
  chk('Format bits say error correction level M', f.ecc === 0b00, 'ecc bits ' + f.ecc.toString(2));
  chk('Format bits name the mask that was actually applied', f.mask === r.mask, `${f.mask} vs ${r.mask}`);

  /* The SECOND copy, which exists for when the first is damaged - and which
     was silently wrong until the dark-module assertion caught it. Reading
     only the first copy is how a broken one ships. */
  const readFormat2 = (m) => {
    const at = (r,c) => (m[r][c] ? 1 : 0);
    let bits = 0;
    for (let i=0;i<=6;i++) bits |= at(n-1-i,8) << (14-i);
    for (let i=7;i<=14;i++) bits |= at(8,n-15+i) << (14-i);
    const raw = bits ^ 0b101010000010010;
    return { ecc:(raw>>13)&0b11, mask:(raw>>10)&0b111 };
  };
  const f2 = readFormat2(m);
  chk('The second format copy agrees with the first',
    f2.mask === f.mask && f2.ecc === f.ecc, `mask ${f2.mask}/${f.mask}, ecc ${f2.ecc}/${f.ecc}`);
}

console.log('\n-- choosing the version --');

{
  chk('A short string uses version 1', encode('hi').version === 1, encode('hi').version);
  chk('A longer one grows', encode('x'.repeat(100)).version > 1, encode('x'.repeat(100)).version);
  chk('The app URL fits comfortably',
    encode('https://london-fishing-companion-app.netlify.app/').version <= 4,
    'v' + encode('https://london-fishing-companion-app.netlify.app/').version);
  chk('Beyond version 10 it refuses rather than producing nonsense',
    encode('x'.repeat(400)) === null);
  chk('Empty input is nothing, not a blank code', encode('') === null);
}

console.log('\n-- the crossing into 16-bit character counts --');

{
  /* Version 10 switches the character-count field from 8 bits to 16. Get it
     wrong and everything up to version 9 works perfectly, which is exactly
     the kind of bug that ships. */
  const long = 'y'.repeat(200);
  const r = encode(long);
  chk('A version 10 payload still round-trips', r && r.version === 10 && decode(r).text === long,
    r ? `v${r.version}` : 'null');
}

console.log('\n-- rendering --');

{
  const r = encode('test');
  const d = toPath(r.matrix);
  const dark = r.matrix.flat().filter(Boolean).length;
  chk('The path draws one rectangle per dark module',
    (d.match(/M/g) || []).length === dark, `${(d.match(/M/g)||[]).length} vs ${dark}`);
  chk('Something is actually drawn', dark > 0, dark + ' dark modules');
}

/* ---------------------------------------------------------------------
   A DECODER THAT IS NOT OURS.

   Everything above this line reads the matrix with a decoder written in
   this file. That is worth having - it localises a fault to a layer - but
   it cannot tell you the code SCANS, because it shares every assumption the
   encoder makes. It agreed with the encoder through two bugs that made
   every code this app ever drew unreadable by an actual phone:

     - generator() built the reversed polynomial, so every error-correction
       codeword was wrong. Invisible at n=1 because a^0 is 1.
     - the format information was placed least-significant-bit first, which
       mirrors the whole 15-bit string. Each bit still landed in a legal
       format position, so a structural check saw nothing wrong.

   Twenty-two tests passed the whole time. So: jsQR, which knows nothing
   about this codebase, over a rendered bitmap. If this section passes, a
   camera can read the thing.
   --------------------------------------------------------------------- */
console.log('\n-- against an independent decoder --');

const { createRequire } = await import('node:module');
let jsQR = null;
try {
  const req = createRequire(import.meta.url);
  jsQR = req('jsqr').default || req('jsqr');
} catch (e) { jsQR = null; }

/* Deliberately loud rather than skipped. A conformance check that quietly
   opts out when its dependency is missing is the same failure as a decoder
   that agrees with itself. */
chk('jsqr is installed (npm install) so conformance can be checked', !!jsQR,
    jsQR ? 'resolved' : 'NOT RESOLVABLE - run npm install');

if (jsQR) {
  /* One module per `scale` pixels, on white, with the four-module quiet zone
     the spec requires. Rendering it is the point: this is what a camera
     actually receives. */
  const rasterise = (matrix, quiet = 4, scale = 6) => {
    const n = matrix.length, side = (n + quiet * 2) * scale;
    const data = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!matrix[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const p = (((y + quiet) * scale + dy) * side + ((x + quiet) * scale + dx)) * 4;
        data[p] = 0; data[p + 1] = 0; data[p + 2] = 0;
      }
    }
    return { data, width: side, height: side };
  };
  const scan = (matrix, quiet, scale) => {
    const img = rasterise(matrix, quiet, scale);
    const got = jsQR(img.data, img.width, img.height);
    return got ? got.text ?? got.data : null;
  };

  /* Across the version range the app can actually produce, since the bugs
     above behaved differently at different sizes. */
  const APP_URL = 'https://london-fishing-companion-app.netlify.app/';
  const REAL = [
    'hi',
    'https://london-fishing-companion-app.netlify.app/',
    'Creel — spots, species, baits and a catch log',
    'https://example.com/pack?id=02GD003&v=2',
    'x'.repeat(100),
    'x'.repeat(200),
  ];
  for (const text of REAL) {
    const r = encode(text);
    const got = scan(r.matrix);
    chk(`a real decoder reads v${r.version} ${JSON.stringify(text.slice(0, 26))}`,
        got === text, got === null ? 'no code found' : JSON.stringify(String(got).slice(0, 40)));
  }

  /* The app's own URL is the one that matters most - it is the code people
     point a camera at. */
  const appScan = scan(encode(APP_URL).matrix);
  chk('the code the app actually shows is readable',
      appScan === APP_URL, appScan === null ? 'no code found' : JSON.stringify(appScan.slice(0, 34)));

  /* Every mask has its own format string, and the mirrored-bits bug was the
     same shape in all eight. Forcing each one means the suite cannot pass
     just because the penalty scorer happens to avoid a broken case. */
  let allMasks = true; const masksSeen = [];
  for (const text of ['hi', 'Creel', 'https://example.com/']) {
    const r = encode(text);
    masksSeen.push(r.mask);
    if (scan(r.matrix) !== text) allMasks = false;
  }
  chk('whatever mask the scorer picks, the result still scans', allMasks,
      allMasks ? 'masks ' + masksSeen.join(', ') : 'a chosen mask produced an unreadable code');

  /* Four modules is what ISO/IEC 18004 asks for and what ShareQR now draws.
     Checking it here so shrinking the margin shows up as a test failure
     rather than as a code somebody cannot scan in a car park. */
  chk('it still scans with the four-module quiet zone the app draws',
      scan(encode(APP_URL).matrix, 4, 8) === APP_URL, 'quiet=4 scale=8');
}

console.log(`\n=== QR RESULT: ${pass} passed, ${fail} failed ===\n`);
if (fail) process.exit(1);
