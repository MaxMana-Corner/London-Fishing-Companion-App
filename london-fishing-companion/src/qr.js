/* qr.js — a QR encoder, because this app cannot borrow one.

   The obvious way to make a QR code is an image service or a CDN library.
   Neither is available here: the app is offline-first and ships as static
   files, its service worker precaches everything it needs, and there is
   exactly one sanctioned network call in the whole codebase. A QR code that
   only appears when you have signal is useless for the thing it is for -
   showing somebody the app while standing next to them on a riverbank.

   So: byte mode, error correction level M, versions 1 to 10. That covers a
   URL up to 216 characters, which is far more than this app's address needs,
   and stops well short of the version-11+ tables nobody here would ever hit.

   Level M is the choice worth defending: it recovers from about 15% damage.
   L would make a slightly smaller code, but these get shown on a phone screen
   at an angle, in daylight, or printed on something that ends up in a tackle
   box. The extra redundancy is worth more than four fewer modules.

   Returns a matrix of booleans. Rendering is the caller's problem, which
   keeps this file testable without a DOM. */

/* ---------- Galois field GF(256), the arithmetic Reed-Solomon runs on ---- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;          // the QR primitive polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/* Generator polynomial for n error-correction codewords. */
function generator(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= mul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function eccFor(data, n) {
  const gen = generator(n);
  const res = new Array(n).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < n; i++) res[i] ^= mul(gen[i + 1] !== undefined ? gen[i + 1] : 0, factor);
  }
  return res;
}

/* ---------- version tables, level M only ----------
   [ecc codewords per block, group1 blocks, group1 data cw, group2 blocks, group2 data cw] */
const SPEC_M = {
  1:  [10, 1, 16, 0, 0],
  2:  [16, 1, 28, 0, 0],
  3:  [26, 1, 44, 0, 0],
  4:  [18, 2, 32, 0, 0],
  5:  [24, 2, 43, 0, 0],
  6:  [16, 4, 27, 0, 0],
  7:  [18, 4, 31, 0, 0],
  8:  [22, 2, 38, 2, 39],
  9:  [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};

/* Alignment pattern centres. Version 1 has none. */
const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/* The 18-bit version strings for 7 and up, straight from the spec - they are
   BCH-encoded constants and computing them would be showing off. */
const VERSION_BITS = { 7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3 };

const dataCapacity = (v) => {
  const [, g1, d1, g2, d2] = SPEC_M[v];
  return g1 * d1 + g2 * d2;
};

export const size = (v) => 17 + 4 * v;

/* ---------- bit buffer ---------- */
class Bits {
  constructor() { this.bits = []; }
  put(value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
  }
  get length() { return this.bits.length; }
}

/* ---------- encode the payload ---------- */
function encodeData(text, version) {
  const bytes = new TextEncoder().encode(text);
  const b = new Bits();
  b.put(0b0100, 4);                                  // byte mode
  /* Character count is 8 bits up to version 9 and 16 from version 10. Getting
     this boundary wrong produces a code that looks perfect and scans as
     gibberish, which is the worst kind of bug to have in a thing you cannot
     read yourself. */
  b.put(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) b.put(byte, 8);

  const capacityBits = dataCapacity(version) * 8;
  if (b.length > capacityBits) return null;

  b.put(0, Math.min(4, capacityBits - b.length));    // terminator
  while (b.length % 8 !== 0) b.bits.push(0);

  const codewords = [];
  for (let i = 0; i < b.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | b.bits[i + j];
    codewords.push(v);
  }
  /* Pad with the two alternating pad bytes the spec names. */
  const pads = [0xEC, 0x11];
  let p = 0;
  while (codewords.length < dataCapacity(version)) codewords.push(pads[p++ % 2]);
  return codewords;
}

/* Split into blocks, compute ECC per block, then interleave. Interleaving is
   the whole point of the block structure: a scratch across the code damages
   one codeword in each block rather than destroying one block entirely. */
function interleave(codewords, version) {
  const [ecCount, g1, d1, g2, d2] = SPEC_M[version];
  const blocks = [];
  let at = 0;
  for (let i = 0; i < g1; i++) { blocks.push(codewords.slice(at, at + d1)); at += d1; }
  for (let i = 0; i < g2; i++) { blocks.push(codewords.slice(at, at + d2)); at += d2; }

  const eccs = blocks.map((blk) => eccFor(blk, ecCount));

  const out = [];
  const maxData = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const blk of blocks) if (i < blk.length) out.push(blk[i]);
  }
  for (let i = 0; i < ecCount; i++) {
    for (const e of eccs) out.push(e[i]);
  }
  return out;
}

/* ---------- matrix ---------- */
function blank(n) {
  return {
    m: Array.from({ length: n }, () => new Array(n).fill(false)),
    reserved: Array.from({ length: n }, () => new Array(n).fill(false)),
  };
}

function placeFinder(g, r, c) {
  for (let i = -1; i <= 7; i++) {
    for (let j = -1; j <= 7; j++) {
      const y = r + i, x = c + j;
      if (y < 0 || x < 0 || y >= g.m.length || x >= g.m.length) continue;
      const on = (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
                 (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
                 (i >= 2 && i <= 4 && j >= 2 && j <= 4);
      g.m[y][x] = on;
      g.reserved[y][x] = true;
    }
  }
}

function placeAlignment(g, version) {
  const centres = ALIGN[version];
  const n = g.m.length;
  for (const r of centres) {
    for (const c of centres) {
      /* Skip the three that would sit on a finder pattern. */
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          g.m[r + i][c + j] = Math.max(Math.abs(i), Math.abs(j)) !== 1;
          g.reserved[r + i][c + j] = true;
        }
      }
    }
  }
}

function placeTiming(g) {
  const n = g.m.length;
  for (let i = 8; i < n - 8; i++) {
    const on = i % 2 === 0;
    g.m[6][i] = on; g.reserved[6][i] = true;
    g.m[i][6] = on; g.reserved[i][6] = true;
  }
}

function reserveFormat(g, version) {
  const n = g.m.length;
  for (let i = 0; i < 9; i++) {
    if (!g.reserved[8][i]) { g.reserved[8][i] = true; }
    if (!g.reserved[i][8]) { g.reserved[i][8] = true; }
  }
  for (let i = 0; i < 8; i++) {
    g.reserved[8][n - 1 - i] = true;
    g.reserved[n - 1 - i][8] = true;
  }
  g.m[n - 8][8] = true;                    // the always-dark module
  g.reserved[n - 8][8] = true;

  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        g.reserved[i][n - 11 + j] = true;
        g.reserved[n - 11 + j][i] = true;
      }
    }
  }
}

function placeVersionInfo(g, version) {
  if (version < 7) return;
  const bits = VERSION_BITS[version];
  const n = g.m.length;
  for (let i = 0; i < 18; i++) {
    const on = ((bits >> i) & 1) === 1;
    const r = Math.floor(i / 3), c = i % 3;
    g.m[r][n - 11 + c] = on;
    g.m[n - 11 + c][r] = on;
  }
}

/* Data is laid in two-module-wide columns, snaking bottom-to-top then
   top-to-bottom, skipping the vertical timing column. */
function placeData(g, data) {
  const n = g.m.length;
  let bitIndex = 0;
  let upward = true;
  for (let right = n - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;            // the timing column is not a data column
    for (let step = 0; step < n; step++) {
      const y = upward ? n - 1 - step : step;
      for (let k = 0; k < 2; k++) {
        const x = right - k;
        if (g.reserved[y][x]) continue;
        let on = false;
        if (bitIndex < data.length * 8) {
          const byte = data[bitIndex >> 3];
          on = ((byte >> (7 - (bitIndex & 7))) & 1) === 1;
        }
        g.m[y][x] = on;
        bitIndex++;
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/* The four penalty rules from the spec. Their only job is to pick the mask
   that scans most reliably - runs of the same colour, solid blocks, patterns
   that look like a finder, and an unbalanced light/dark ratio. */
function penalty(m) {
  const n = m.length;
  let score = 0;

  const runScore = (line) => {
    let s = 0, run = 1;
    for (let i = 1; i < n; i++) {
      if (line[i] === line[i - 1]) run++;
      else { if (run >= 5) s += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) s += 3 + (run - 5);
    return s;
  };
  for (let i = 0; i < n; i++) {
    score += runScore(m[i]);
    score += runScore(m.map((row) => row[i]));
  }

  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }

  const PAT = [true, false, true, true, true, false, true, false, false, false, false];
  const RPAT = PAT.slice().reverse();
  const hasAt = (line, i, pat) => pat.every((p, k) => line[i + k] === p);
  for (let i = 0; i < n; i++) {
    const row = m[i], col = m.map((r) => r[i]);
    for (let j = 0; j + 11 <= n; j++) {
      if (hasAt(row, j, PAT) || hasAt(row, j, RPAT)) score += 40;
      if (hasAt(col, j, PAT) || hasAt(col, j, RPAT)) score += 40;
    }
  }

  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  const pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

function formatBits(mask) {
  /* Level M is 0b00. BCH(15,5), then XOR with the spec's mask pattern. */
  let data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >> 9) & 1) * 0b10100110111);
  return ((data << 10) | rem) ^ 0b101010000010010;
}

function placeFormat(g, mask) {
  const bits = formatBits(mask);
  const n = g.m.length;
  const at = (i) => ((bits >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) g.m[8][i] = at(i);
  g.m[8][7] = at(6);
  g.m[8][8] = at(7);
  g.m[7][8] = at(8);
  for (let i = 9; i <= 14; i++) g.m[14 - i][8] = at(i);

  /* The second copy splits SEVEN bits down the lower-left and EIGHT along
     the top-right. Writing eight below ran one module too far, landing on
     (n-8, 8) - the always-dark module - and shifting every remaining bit of
     the copy by one.

     Nothing noticed for a while: scanners read the copy beside the top-left
     finder first, so codes still decoded. The second copy exists precisely
     for when the first is damaged, which is the case nobody tests by
     looking at a clean code on a screen. */
  for (let i = 0; i <= 6; i++) g.m[n - 1 - i][8] = at(i);
  for (let i = 7; i <= 14; i++) g.m[8][n - 15 + i] = at(i);
}

/* ---------- the only export that matters ---------- */
export function encode(text) {
  const t = String(text || "");
  if (!t) return null;

  let version = 0;
  for (let v = 1; v <= 10; v++) {
    if (encodeData(t, v)) { version = v; break; }
  }
  if (!version) return null;              // longer than 216 bytes; not our problem

  const codewords = encodeData(t, version);
  const final = interleave(codewords, version);
  const n = size(version);

  const build = (mask) => {
    const g = blank(n);
    placeFinder(g, 0, 0);
    placeFinder(g, 0, n - 7);
    placeFinder(g, n - 7, 0);
    placeAlignment(g, version);
    placeTiming(g);
    reserveFormat(g, version);
    placeVersionInfo(g, version);
    placeData(g, final);
    /* Mask only the data area - the function patterns are never masked. */
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!g.reserved[r][c] && MASKS[mask](r, c)) g.m[r][c] = !g.m[r][c];
      }
    }
    placeFormat(g, mask);
    return g.m;
  };

  let best = null, bestScore = Infinity, bestMask = 0;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(mask);
    const p = penalty(m);
    if (p < bestScore) { bestScore = p; best = m; bestMask = mask; }
  }
  return { matrix: best, version, size: n, mask: bestMask };
}

/* A scalable path, so the code stays crisp at any size and can be saved or
   printed. One path of rectangles beats one element per module: a version 4
   code is 1,089 modules and that many DOM nodes is a visible pause. */
export function toPath(matrix) {
  let d = "";
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix.length; c++) {
      if (matrix[r][c]) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  return d;
}
