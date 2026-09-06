import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { sunTimes, moonPhase, solunar, activeWindow, windowScore, pressureTrend, fmtTime } from "./astro.js";
import { fetchWeather, findStations, fetchHydro, describeWeather, compassPoint, flowContext,
         weatherStale, hydroStale, pushPressureReading, agoLabel,
         fetchCommunityIndex, fetchCommunityStats, fetchCommunityPack,
         submitCommunityContent } from "./services.js";
import BaitArt from "./baitart.jsx";
import { HookArt, RigArt } from "./hookart.jsx";
import * as GD from "./gdrive.js";
import * as PH from "./photos.js";
import { KIND, SCHEMA_VERSION, buildExport, exportFilename, validateImport, planImport,
         migrateStore, summaryLines, shareJSON, readFile } from "./portability.js";
import { shapeIndex, shapeStats, withScores, filterEntries, sortEntries,
         describeCounts, tagCommunityRecords, isCommunityRecord, KIND_OF,
         buildSubmission, describeSubmission } from "./community.js";

/* ============================================================
   LONDON FISHING COMPANION
   A bank-angler's field tool for the Thames River system,
   Fisheries Management Zone 16, London Ontario.
   ============================================================ */

const CSS = `
:root{
  --ink:#1B2419;
  --ink2:#59654F;
  --ink3:#8A9382;
  --base:#E3E7DE;
  --card:#F6F8F3;
  --card2:#ECEFE7;
  --line:#C7CDBF;
  --line2:#DBE0D3;
  --deep:#2E4A55;
  --deep2:#4A6D78;
  --brass:#A8752B;
  --brass2:#C79A4E;
  --moss:#3D6B39;
  --rust:#8E2F2F;
  --shadow:0 1px 0 var(--line2);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.lfc{
  font-family:'Archivo',system-ui,-apple-system,'Segoe UI',sans-serif;
  background:var(--base); color:var(--ink);
  min-height:100vh; max-width:760px; margin:0 auto;
  padding-bottom:92px; position:relative;
  font-size:15px; line-height:1.45;
}
.lfc .serif{font-family:'Newsreader',Georgia,'Iowan Old Style',serif}
.lfc h1,.lfc h2,.lfc h3,.lfc h4{font-family:'Newsreader',Georgia,serif;font-weight:600;margin:0;line-height:1.15;letter-spacing:-0.01em}
.lfc h1{font-size:29px}
.lfc h2{font-size:22px}
.lfc h3{font-size:18px}
.lfc p{margin:0 0 10px}
.lfc button{font-family:inherit;font-size:inherit;cursor:pointer;border:none;background:none;color:inherit}
.lfc input,.lfc select,.lfc textarea{font-family:inherit;font-size:16px;width:100%;
  background:var(--card);border:1px solid var(--line);border-radius:3px;
  padding:11px 12px;color:var(--ink)}
.lfc textarea{min-height:78px;resize:vertical;line-height:1.4}
.lfc input:focus,.lfc select:focus,.lfc textarea:focus,.lfc button:focus-visible{
  outline:2px solid var(--deep);outline-offset:1px}

.pad{padding:0 16px}
.stack>*+*{margin-top:12px}
.row{display:flex;gap:10px;align-items:center}
.between{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.wrap{display:flex;flex-wrap:wrap;gap:6px}
.muted{color:var(--ink2)}
.tiny{font-size:12.5px;line-height:1.35}
.small{font-size:13.5px}
.num{font-variant-numeric:tabular-nums}

/* header */
.hdr{padding:18px 16px 12px;border-bottom:1px solid var(--line)}
.hdr .kick{font-size:12.5px;color:var(--ink2);letter-spacing:.02em}

/* season strip — the hero */
.seasonwrap{background:var(--deep);color:#EAF0F1;padding:16px}
.seasonwrap h2{color:#fff;font-size:20px}
.seasonwrap .date{font-size:12.5px;color:#A9C2C9;margin-top:2px}
.seasongrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:6px;margin-top:13px}
.sbadge{background:rgba(255,255,255,.07);border-left:3px solid var(--moss);
  padding:7px 9px;border-radius:2px}
.sbadge.shut{border-left-color:var(--rust);opacity:.62}
.sbadge .nm{font-size:13px;font-weight:500;color:#fff}
.sbadge .st{font-size:11.5px;color:#A9C2C9;margin-top:1px}

/* cards */
.card{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:14px}
.card.flat{background:var(--card2);border-color:var(--line2)}
.listbtn{display:block;width:100%;text-align:left;background:var(--card);
  border:1px solid var(--line);border-radius:4px;padding:13px 14px}
.listbtn:active{background:var(--card2)}

/* chips */
.chip{display:inline-block;font-size:12px;padding:3px 8px;border-radius:2px;
  background:var(--card2);border:1px solid var(--line2);color:var(--ink2);white-space:nowrap}
.chip.solid{background:var(--deep);border-color:var(--deep);color:#fff}
.chip.brass{background:#F2E6CF;border-color:#DEC79A;color:#6B4A15}
.chip.open{background:#DDEBD9;border-color:#B6D0B1;color:#2C5228}
.chip.shut{background:#F0DDDD;border-color:#D9B6B6;color:#722525}

/* access gauge */
.gauge{display:flex;gap:2px;align-items:flex-end;height:16px}
.gauge i{width:5px;background:var(--line);border-radius:1px;display:block}
.gauge i.on{background:var(--deep)}

/* tabs */
.tabbar{position:fixed;bottom:0;left:0;right:0;max-width:760px;margin:0 auto;
  background:var(--card);border-top:1px solid var(--line);
  display:grid;grid-template-columns:repeat(5,1fr);z-index:40;
  padding-bottom:env(safe-area-inset-bottom)}
.tabbar button{padding:10px 1px 12px;font-size:10.5px;color:var(--ink3);
  display:flex;flex-direction:column;align-items:center;gap:3px}
.tabbar button.on{color:var(--deep)}
.tabbar button.on svg{stroke:var(--deep)}
.tabbar svg{width:21px;height:21px;stroke:var(--ink3);fill:none;stroke-width:1.6}

.segbar{display:flex;border:1px solid var(--line);border-radius:4px;overflow:hidden;background:var(--card)}
.segbar button{flex:1;padding:9px 6px;font-size:13.5px;color:var(--ink2);border-right:1px solid var(--line2)}
.segbar button:last-child{border-right:none}
.segbar button.on{background:var(--deep);color:#fff}

/* buttons */
.btn{background:var(--deep);color:#fff;padding:13px 16px;border-radius:4px;
  font-size:15px;font-weight:500;width:100%;text-align:center;display:block}
.btn:active{background:#253D46}
.btn.ghost{background:transparent;color:var(--deep);border:1px solid var(--line)}
.btn.brass{background:var(--brass)}
.btn.danger{background:transparent;color:var(--rust);border:1px solid #D9B6B6}
.btn.sm{padding:9px 12px;font-size:13.5px;width:auto;display:inline-block}

/* sheet */
.scrim{position:fixed;inset:0;background:rgba(20,28,20,.5);z-index:50}
.sheet{position:fixed;inset:0;z-index:51;background:var(--base);
  overflow-y:auto;-webkit-overflow-scrolling:touch}
.sheethdr{position:sticky;top:0;background:var(--base);z-index:2;
  border-bottom:1px solid var(--line);padding:12px 16px;
  display:flex;justify-content:space-between;align-items:center;gap:12px}
.x{font-size:15px;color:var(--deep);padding:6px 2px;white-space:nowrap}

/* field */
.field label{display:block;font-size:13px;color:var(--ink2);margin-bottom:5px}
.optgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:7px}
.opt{border:1px solid var(--line);background:var(--card);border-radius:3px;
  padding:11px 8px;font-size:13.5px;text-align:center;color:var(--ink)}
.opt.on{background:var(--deep);border-color:var(--deep);color:#fff}

/* table */
.tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.tbl th{text-align:left;font-weight:500;color:var(--ink2);font-size:12.5px;
  padding:7px 8px;border-bottom:1px solid var(--line)}
.tbl td{padding:8px;border-bottom:1px solid var(--line2);vertical-align:top}
.tbl tr:last-child td{border-bottom:none}

/* prose */
.prose{font-family:'Newsreader',Georgia,serif;font-size:16.5px;line-height:1.58;color:#2A3327}
.prose p{margin:0 0 11px;max-width:66ch}

hr.rule{border:none;border-top:1px solid var(--line);margin:18px 0}
.divlabel{display:flex;align-items:center;gap:9px;color:var(--ink2);font-size:12.5px;margin:20px 0 9px}
.divlabel:after{content:"";flex:1;height:1px;background:var(--line)}

@media (prefers-reduced-motion:no-preference){
  .sheet{animation:rise .17s ease-out}
  @keyframes rise{from{transform:translateY(14px);opacity:.4}to{transform:none;opacity:1}}
}
`;

/* ============================ SEASON ENGINE ============================ */

const nthWeekday = (y, m, wd, n) => {
  const d = new Date(y, m, 1);
  let count = 0;
  while (d.getMonth() === m) {
    if (d.getDay() === wd) { count++; if (count === n) return new Date(y, m, d.getDate()); }
    d.setDate(d.getDate() + 1);
  }
  return null;
};
const D = (y, m, day) => new Date(y, m, day);
const SAT = 6;

// Window resolvers -> [start,end] pairs for a given year
const W = {
  allYear: (y) => [[D(y, 0, 1), D(y, 11, 31)]],
  bass: (y) => [[nthWeekday(y, 5, SAT, 4), D(y, 10, 30)]],
  walleye: (y) => [[D(y, 0, 1), D(y, 2, 15)], [nthWeekday(y, 4, SAT, 2), D(y, 11, 31)]],
  pike: (y) => [[D(y, 0, 1), D(y, 2, 31)], [nthWeekday(y, 4, SAT, 2), D(y, 11, 31)]],
  musky: (y) => [[nthWeekday(y, 5, SAT, 1), D(y, 11, 15)]],
  trout: (y) => [[nthWeekday(y, 3, SAT, 4), D(y, 8, 30)]],
  closed: () => [],
};

const SEASONS = {
  bass: { label: "4th Sat June – Nov 30", win: W.bass, limit: "S-6 / C-2 (largemouth + smallmouth combined)" },
  walleye: { label: "Jan 1 – Mar 15, 2nd Sat May – Dec 31", win: W.walleye, limit: "S-4 / C-2, max 1 over 46 cm" },
  pike: { label: "Jan 1 – Mar 31, 2nd Sat May – Dec 31", win: W.pike, limit: "S-6 / C-2" },
  musky: { label: "1st Sat June – Dec 15", win: W.musky, limit: "S-1 (must exceed 91 cm) / C-0" },
  trout: { label: "4th Sat April – Sep 30", win: W.trout, limit: "Rainbow S-2 / C-1 · Brown & brook S-5 / C-2" },
  troutThames: { label: "Open all year on the Thames main branch, Middlesex County", win: W.allYear, limit: "Zone-wide limits apply" },
  catfish: { label: "Open all year", win: W.allYear, limit: "S-12 / C-6" },
  perch: { label: "Open all year", win: W.allYear, limit: "S-50 / C-25" },
  crappie: { label: "Open all year", win: W.allYear, limit: "S-30 / C-10" },
  sunfish: { label: "Open all year", win: W.allYear, limit: "S-50 / C-25" },
  none: { label: "Open all year, no limit", win: W.allYear, limit: "No limit" },
  shut: { label: "Closed all year", win: W.closed, limit: "May not be retained" },
};

const isOpenOn = (key, date) => {
  const s = SEASONS[key]; if (!s) return true;
  const wins = s.win(date.getFullYear());
  return wins.some(([a, b]) => a && b && date >= a && date <= new Date(b.getFullYear(), b.getMonth(), b.getDate(), 23, 59));
};
const nextOpen = (key, date) => {
  const s = SEASONS[key]; if (!s) return null;
  for (const yr of [date.getFullYear(), date.getFullYear() + 1]) {
    for (const [a] of s.win(yr)) if (a && a > date) return a;
  }
  return null;
};
const fmtShort = (d) => d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
const fmtLong = (d) => d.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

/* ============================ STORAGE ============================ */

const K_CATALOG = "lfc:catalog";
const K_LOG = "lfc:log";
const K_SYNC = "lfc:sync";
const K_ENV = "lfc:env";      // cached weather/hydro per spot
const K_LIC = "lfc:licence";
const K_DRIVE = "lfc:drive";
const K_COMMUNITY = "lfc:community";   // cached directory + vote tallies
const K_DEVICE = "lfc:device";         // random per-install id, not identity
const K_SUBMISSIONS = "lfc:submissions";
const EMPTY_DRIVE = { connected: false, email: "", autoArchive: true, lastBackup: 0, lastArchive: 0 };  // licence reminder
const EMPTY_ENV = { weather: {}, hydro: {}, pressure: {} };
const EMPTY_LIC = { boughtOn: "", type: "1-year sport", notified: 0 };
const EMPTY_SYNC = { url: "", token: "", lastSync: 0, rev: 0, auto: true };
const stamp = (o) => ({ ...o, updatedAt: Date.now() });
const EMPTY_CATALOG = { spots: [], species: [], baits: [], knots: [], tips: [], photos: {} };
const EMPTY_LOG = { trips: [], catches: [] };

async function loadKey(key, fallback) {
  try {
    const r = await window.storage.get(key);
    if (!r || !r.value) return fallback;
    return { ...fallback, ...JSON.parse(r.value) };
  } catch { return fallback; }
}
async function saveKey(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); return true; }
  catch (e) { console.error("save failed", e); return false; }
}

/* A random per-install id so the community bridge can rate-limit without
   anyone needing an account. It identifies a copy of the app, not a
   person: clearing storage makes a new one, which is fine, because it is
   a spam brake rather than a login. Goes through the storage shim like
   everything else - App.jsx never touches localStorage directly. */
async function getDeviceId() {
  const have = await loadKey(K_DEVICE, null);
  if (typeof have === "string" && have) return have;
  const made = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  await saveKey(K_DEVICE, made);
  return made;
}

async function rememberSubmission(entry) {
  const list = await loadKey(K_SUBMISSIONS, []);
  const next = [entry, ...(Array.isArray(list) ? list : [])].slice(0, 50);
  await saveKey(K_SUBMISSIONS, next);
  return next;
}
const uid = () => Math.random().toString(36).slice(2, 10);

/* ============================ FISH ART ============================ */
/* Field-guide profiles drawn to the markings that actually separate
   these species on the bank. Colour + shape carry the ID. */

function Fish({ sp, h = 74 }) {
  const a = sp.art || {};
  const body = a.body || "#7C8B6E";
  const belly = a.belly || "#EDEBDD";
  const back = a.back || "#3E4A34";
  const id = "g" + sp.id;
  return (
    <svg viewBox="0 0 300 110" style={{ width: "100%", height: h, display: "block" }} role="img" aria-label={sp.name}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={back} /><stop offset=".55" stopColor={body} /><stop offset="1" stopColor={belly} />
        </linearGradient>
      </defs>
      {/* tail */}
      <path d={a.forked
        ? "M14 55 L44 34 L36 55 L44 76 Z"
        : "M14 55 L42 36 L40 55 L42 74 Z"} fill={back} opacity=".9" />
      {/* body */}
      <path d={a.deep
        ? "M40 55 C60 16 118 8 168 12 C222 17 268 32 286 55 C268 78 222 93 168 98 C118 102 60 94 40 55 Z"
        : a.slim
          ? "M40 55 C74 34 140 27 200 32 C246 36 276 44 288 55 C276 66 246 74 200 78 C140 83 74 76 40 55 Z"
          : "M40 55 C68 25 128 18 184 22 C232 26 272 38 288 55 C272 72 232 84 184 88 C128 92 68 85 40 55 Z"}
        fill={`url(#${id})`} />
      {/* dorsal */}
      {a.gar ? null : (
        <path d={a.spiny
          ? "M96 24 L112 8 L132 20 L152 6 L174 18 L188 24 Z"
          : "M150 22 L176 6 L206 14 L212 26 Z"} fill={back} opacity=".85" />
      )}
      {/* markings */}
      {a.marks === "vbars" && [0, 1, 2, 3, 4, 5].map(i => (
        <rect key={i} x={92 + i * 27} y={30} width="8" height="48" rx="3" fill={back} opacity=".38" />
      ))}
      {a.marks === "stripe" && <path d="M62 58 L120 55 L150 60 L190 54 L250 57 L286 55" stroke={back} strokeWidth="9" fill="none" opacity=".55" strokeLinecap="round" />}
      {a.marks === "hstripes" && [0, 1, 2, 3].map(i => (
        <path key={i} d={`M70 ${42 + i * 10} L286 ${40 + i * 10}`} stroke={back} strokeWidth="3" opacity=".45" />
      ))}
      {a.marks === "beans" && [[100, 40], [130, 62], [160, 36], [190, 60], [220, 44], [246, 66], [118, 76], [176, 76]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="9" ry="5" fill="#E9E4B8" opacity=".8" />
      ))}
      {a.marks === "spots" && [[110, 38], [140, 66], [170, 42], [200, 62], [228, 46], [250, 68], [126, 74], [186, 30]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.4" fill="#243026" opacity=".7" />
      ))}
      {a.marks === "speckle" && Array.from({ length: 26 }).map((_, i) => (
        <circle key={i} cx={70 + (i * 37) % 210} cy={26 + (i * 53) % 60} r="3" fill="#2C3A2C" opacity=".55" />
      ))}
      {a.marks === "scales" && Array.from({ length: 5 }).map((_, r) => (
        Array.from({ length: 9 }).map((_, c) => (
          <path key={`${r}${c}`} d={`M${74 + c * 24} ${32 + r * 12} a11 9 0 0 1 20 0`} stroke={back} strokeWidth="1.2" fill="none" opacity=".45" />
        ))
      ))}
      {/* barbels */}
      {a.barbels && [0, 1, 2].map(i => (
        <path key={i} d={`M286 ${50 + i * 5} q16 ${6 + i * 7} 4 ${18 + i * 8}`} stroke={back} strokeWidth="2" fill="none" opacity=".8" />
      ))}
      {/* white tail tip — walleye */}
      {a.whiteTip && <path d="M14 55 L42 36 L40 46 Z" fill="#F4F2E2" />}
      {/* gill / ear flap */}
      {a.earFlap && <ellipse cx="252" cy="52" rx="9" ry="12" fill={a.earFlap} />}
      <path d="M244 26 C238 44 238 66 244 84" stroke={back} strokeWidth="1.6" fill="none" opacity=".5" />
      {/* eye */}
      <circle cx="266" cy="47" r="8" fill="#F6F4E8" />
      <circle cx="266" cy="47" r="5" fill={a.eye || "#20281E"} />
      <circle cx="268" cy="45" r="1.7" fill="#fff" opacity=".85" />
      {/* jaw line — the largemouth/smallmouth tell */}
      <path d={a.bigJaw ? "M288 58 L252 70" : "M288 58 L264 68"} stroke={back} strokeWidth="1.8" opacity=".7" fill="none" />
    </svg>
  );
}

/* ============================ SPECIES DATA ============================ */

const SPECIES = [
  {
    id: "smb", name: "Smallmouth bass", sci: "Micropterus dolomieu", season: "bass",
    art: { body: "#8C7B4E", back: "#4A3F22", belly: "#E8E2C6", marks: "vbars", eye: "#8C2A18", spiny: true },
    idKey: [
      "Upper jaw ends level with the middle of the eye, never past it",
      "Reddish or bronze eye",
      "Dark vertical bars down the flank, not a horizontal stripe",
      "Bronze or olive body — locals call them 'brownies'",
    ],
    vs: "Largemouth: jaw hinge sits behind the eye and the flank carries one dark horizontal stripe.",
    habits: "Current-oriented and structure-bound. They hold on the downstream side of boulders, in the seam where fast water meets slow, and in the tail-out of every riffle. They feed hardest at first light and last light, and in summer they slide into the deeper holes by midday. Crayfish are the main food in the Thames, which is why brown and orange baits outfish everything else.",
    target: [
      "Cast upstream and let the bait tumble back with the current — a bait moving unnaturally against the flow gets refused",
      "Work the seam, not the fast water and not the slack — the line between them",
      "In low clear summer water, lengthen your leader and downsize; these fish spook badly",
      "After rain, when the river colours up, go bigger and louder",
    ],
    baits: ["tube", "grub", "jerkbait", "crank", "popper", "spinner", "crayfish"],
    where: ["springbank", "gibbons", "kilally", "meadowlily", "komoka", "fanshawe", "vauxhall"],
    size: "Thames average 0.5–1.5 lb; a 3 lb river smallmouth is a very good fish",
  },
  {
    id: "lmb", name: "Largemouth bass", sci: "Micropterus salmoides", season: "bass",
    art: { body: "#6E8449", back: "#2F4020", belly: "#EFEBD4", marks: "stripe", bigJaw: true, spiny: true },
    idKey: [
      "Upper jaw extends past the back of the eye",
      "One broken dark stripe running the length of the flank",
      "Deep notch between the spiny and soft dorsal fins",
      "Green rather than bronze",
    ],
    vs: "Smallmouth: jaw stops at mid-eye, red eye, vertical bars.",
    habits: "A cover ambush predator, not a current fish. In London that means the ponds. They sit under lily pads, against fallen timber, and along the inside edge of weed beds, and they will not chase far. Warm water makes them aggressive; cold water pushes them deep and slow.",
    target: [
      "Fish the edge of the pads, then work into them — the biggest fish are in the thickest cover",
      "Weightless soft plastics fall slowly and get eaten on the drop; count the fall and stay in contact",
      "Frogs over matted pads at dawn and dusk on Westminster Ponds and Dorchester Mill Pond",
      "If you get a blow-up and miss, cast straight back — they almost always eat twice",
    ],
    baits: ["senko", "texas", "frog", "spinnerbait", "chatterbait", "shiner"],
    where: ["westminster", "dorchester", "fanshawe"],
    size: "Westminster Ponds holds genuine 5 lb-plus fish",
  },
  {
    id: "pike", name: "Northern pike", sci: "Esox lucius", season: "pike",
    art: { body: "#5C6B3A", back: "#33401F", belly: "#EDE9CC", marks: "beans", slim: true },
    idKey: [
      "Light bean-shaped spots on a dark green body — the reverse of a muskie",
      "Duck-bill snout full of teeth",
      "Single soft dorsal set far back, near the tail",
      "Rounded tail lobes",
    ],
    vs: "Muskellunge: dark bars on a light body, pointed tail lobes. A muskie must exceed 91 cm to be kept and is C-0.",
    habits: "A weed-edge ambush hunter that sits motionless and accelerates. Cold water suits them — spring and late autumn are the big-fish windows, and they go sluggish in warm midsummer shallows. They will follow a lure to your feet and eat at the last second.",
    target: [
      "Always use a wire trace or a 40 lb fluorocarbon leader — pike teeth cut straight line",
      "Finish every retrieve with a slow figure-eight beside the bank; followers eat on the turn",
      "Work parallel to the weed edge rather than casting straight out over it",
      "Carry long-nose pliers and jaw spreaders, and never put fingers inside the gill plate",
    ],
    baits: ["spinnerbait", "spoon", "jerkbait", "spinner", "shiner"],
    where: ["fanshawe", "westminster", "dorchester", "greenway", "springbank"],
    size: "28-inch fish are caught in the Thames west end; Fanshawe holds bigger",
  },
  {
    id: "wall", name: "Walleye", sci: "Sander vitreus", season: "walleye",
    art: { body: "#9A8B4B", back: "#4E4220", belly: "#F0EAC8", eye: "#C9B96A", whiteTip: true, forked: true, slim: true },
    idKey: [
      "White tip on the lower lobe of the tail — the reliable tell",
      "Large glassy, reflective eye",
      "Dark blotch at the rear base of the spiny dorsal fin",
      "Olive-gold with fine mottling",
    ],
    vs: "Sauger: dark spots in rows on the dorsal fin, no white tail tip.",
    habits: "Light-sensitive. That single fact governs everything — they feed at dawn, at dusk, after dark, and all day when the river is stained and pushing. Bright, clear, low water means they sit deep and tight to the bottom and barely feed.",
    target: [
      "Fish the last hour of light and the first hour of dark, or fish a coloured river after rain",
      "Jig and minnow bounced on the bottom is the local standard and outfishes everything else",
      "Jointed Shad Raps work from shore at Fanshawe and trolled slowly along the old river channel",
      "Slow down. A walleye retrieve should feel too slow to be working",
    ],
    baits: ["jigminnow", "shadrap", "grub", "crank", "crawler"],
    where: ["komoka", "fanshawe", "springbank", "greenway"],
    size: "Max 1 fish over 46 cm may be retained in FMZ 16",
  },
  {
    id: "carp", name: "Common carp", sci: "Cyprinus carpio", season: "none",
    art: { body: "#8E7440", back: "#4A3A18", belly: "#E9DFBD", marks: "scales", barbels: true, deep: true },
    idKey: [
      "Two pairs of barbels at the corners of the mouth",
      "Very large, distinct scales",
      "Long dorsal fin with a serrated leading spine",
      "Thick-shouldered brassy gold body",
    ],
    vs: "Freshwater drum: no barbels, steeply humped back, silver rather than gold.",
    habits: "The biggest fish you will hook inside the city and the most abundant on the main branch. They graze the bottom in loose groups and give themselves away by clouding the water and rolling on the surface. Warm months are prime. They are strong, long-running, and will strip line.",
    target: [
      "Pre-bait a spot with loose corn, then fish a small patch of corn on a size 6 hook or a hair rig",
      "Bread works both floating on the surface and pinched on the bottom",
      "Set the rod on a rest with a loose drag — a carp will drag unattended tackle into the river",
      "The Forks, Greenway and lower Springbank are the proven London carp swims",
    ],
    baits: ["corn", "bread", "crawler"],
    where: ["forks", "greenway", "springbank", "thamespark", "vauxhall"],
    size: "Double-figure fish are routine; 20 lb-plus exist in the Thames",
  },
  {
    id: "cat", name: "Channel catfish", sci: "Ictalurus punctatus", season: "catfish",
    art: { body: "#6B6656", back: "#38352A", belly: "#E7E4D2", marks: "spots", barbels: true, forked: true, slim: true },
    idKey: [
      "Deeply forked tail — the tell against bullheads",
      "Scattered dark spots on the flanks, fading with age",
      "Four pairs of barbels; smooth scaleless skin",
      "Sharp spines in the dorsal and pectoral fins — handle with care",
    ],
    vs: "Brown bullhead: square or slightly rounded tail, no spots, chunkier head.",
    habits: "A nocturnal bottom scavenger that hunts by smell. They move into shallower runs at night and drop back to deep holes at first light. Warm, slightly coloured water after rain switches them on.",
    target: [
      "Fish after dark from a bank you scouted in daylight",
      "Chicken liver, cut bait, shrimp or a bunched nightcrawler on a sliding sinker rig",
      "Cast to the head or tail of a deep hole, not the middle",
      "Grip behind the pectoral spines, never over the top of them",
    ],
    baits: ["liver", "cutbait", "crawler"],
    where: ["greenway", "forks", "vauxhall", "meadowlily", "thamespark"],
    size: "12 lb-plus fish have come out of Greenway",
  },
  {
    id: "rock", name: "Rock bass", sci: "Ambloplites rupestris", season: "sunfish",
    art: { body: "#7B7350", back: "#42402A", belly: "#E4E2CA", eye: "#B32A18", marks: "speckle", deep: true, spiny: true },
    idKey: [
      "Bright red eye",
      "Rows of dark spots forming faint stripes along the flank",
      "Six spines in the anal fin — more than any sunfish",
      "Big mouth for its body size",
    ],
    vs: "Smallmouth bass: much longer body, vertical bars rather than dotted rows.",
    habits: "Everywhere the Thames has rock and shade, and completely undiscriminating. The most reliable fish in the river for a beginner or a child, and the one that saves a blank day.",
    target: ["Anything small dropped near rock will get eaten", "Great first-fish species — small jig or worm under a float", "They shoal, so where you get one, keep casting"],
    baits: ["grub", "worm", "spinner", "tube"],
    where: ["gibbons", "springbank", "kilally", "meadowlily", "komoka"],
    size: "Rarely over 10 inches",
  },
  {
    id: "bluegill", name: "Bluegill", sci: "Lepomis macrochirus", season: "sunfish",
    art: { body: "#5E7758", back: "#2E4030", belly: "#E9C77E", earFlap: "#1C2320", deep: true, spiny: true },
    idKey: [
      "Solid black ear flap with no coloured margin",
      "Dark smudge at the rear base of the soft dorsal fin",
      "Very small mouth",
      "Deep, plate-shaped body",
    ],
    vs: "Pumpkinseed: orange or red crescent on the edge of the ear flap and wavy blue face lines.",
    habits: "Pond and weed-edge fish that shoal thickly. In late spring they fan out saucer-shaped beds in the shallows and become extremely easy to catch.",
    target: ["Tiny hook — size 8 to 12 — with a fragment of worm under a small float", "Fish the beds in late spring, weed edges through summer", "Set the float shallow first, then deeper until you find them"],
    baits: ["worm", "waxworm", "microjig"],
    where: ["westminster", "dorchester", "fanshawe"],
    size: "4–7 inches typical",
  },
  {
    id: "pump", name: "Pumpkinseed", sci: "Lepomis gibbosus", season: "sunfish",
    art: { body: "#8C9440", back: "#4C5522", belly: "#F0B94E", earFlap: "#B4381E", marks: "speckle", deep: true, spiny: true },
    idKey: [
      "Bright orange or red crescent on the trailing edge of the ear flap",
      "Wavy blue lines across the cheek and gill cover",
      "Orange spotting over an olive-gold body",
      "Small mouth, very deep body",
    ],
    vs: "Bluegill: all-black ear flap, no orange margin.",
    habits: "Prefers still, shallow water with vegetation. Shares the pond edges with bluegill and is usually the more colourful of the two.",
    target: ["Same approach as bluegill — small hook, small bait, small float", "Works its way right up to the bank; you often do not need to cast far"],
    baits: ["worm", "waxworm", "microjig"],
    where: ["westminster", "dorchester", "springbank"],
    size: "4–8 inches",
  },
  {
    id: "crappie", name: "Black crappie", sci: "Pomoxis nigromaculatus", season: "crappie",
    art: { body: "#7E8878", back: "#3B4438", belly: "#EDEFE2", marks: "speckle", deep: true, spiny: true },
    idKey: [
      "Irregular black speckling scattered over silver-green, no ordered rows",
      "Seven or eight dorsal spines",
      "Very deep, compressed, almost circular body",
      "Papery thin mouth membrane",
    ],
    vs: "White crappie: five or six dorsal spines and faint vertical bars.",
    habits: "Schools suspend around submerged timber and deeper weed edges. Spring, as the water first warms, is by far the best window. They feed upward, so a bait above them beats a bait below them.",
    target: [
      "Small tube jigs, 2 inch, fished slowly and steadily",
      "Set your float so the jig sits just above the fish, never below",
      "Strike gently — a hard hookset tears the hook straight out of their mouth",
    ],
    baits: ["microjig", "tube", "minnow"],
    where: ["westminster", "dorchester", "fanshawe"],
    size: "8–12 inches",
  },
  {
    id: "perch", name: "Yellow perch", sci: "Perca flavescens", season: "perch",
    art: { body: "#C9A63C", back: "#4F5A22", belly: "#F2E6B4", marks: "vbars", slim: true, spiny: true },
    idKey: [
      "Six to eight bold dark vertical bars over a golden-yellow body",
      "Bright orange pelvic and anal fins",
      "Two separate dorsal fins",
      "Rough, sandpapery scales",
    ],
    vs: "Walleye: no bold bars, glassy eye, white tail tip.",
    habits: "Shoaling fish that patrol flats in loose groups. Fanshawe is the local perch water, best in autumn and through the ice. Where you catch one, there are usually thirty.",
    target: ["A small minnow or worm on a perch rig near the bottom", "Fish autumn flats and, when safe, through the ice", "Keep the bait moving in short lifts — they respond to motion"],
    baits: ["minnow", "worm", "microjig"],
    where: ["fanshawe"],
    size: "S-50 / C-25, open all year",
  },
  {
    id: "wbass", name: "White bass", sci: "Morone chrysops", season: "none",
    art: { body: "#A6B0AA", back: "#3F4A46", belly: "#F1F2EA", marks: "hstripes", forked: true },
    idKey: [
      "Several unbroken dark horizontal stripes on bright silver",
      "Deep, slab-sided body with a humped back",
      "Two separate dorsal fins",
      "Locals call them silver bass",
    ],
    vs: "Freshwater drum: no stripes, blunter head, and a distinctive drumming sound.",
    habits: "Travels in fast-moving schools that push baitfish to the surface. There is a well-known run to the Forks of the Thames in December, and they show up through the summer in the west end.",
    target: ["When a school shows, cast small spinners or jigs into it and retrieve fast", "Move as the school moves — they do not stay put", "December at the Forks is the traditional local window"],
    baits: ["spinner", "grub", "microjig"],
    where: ["forks", "springbank", "greenway"],
    size: "10–14 inches, caught in numbers",
  },
  {
    id: "drum", name: "Freshwater drum", sci: "Aplodinotus grunniens", season: "none",
    art: { body: "#A9A692", back: "#4C4B3C", belly: "#F0EEE0", deep: true, marks: "scales" },
    idKey: [
      "Steeply humped back and a blunt downturned mouth",
      "Long continuous dorsal fin with a notch",
      "Rounded rather than forked tail",
      "Dull silver; makes an audible grunting sound when landed",
    ],
    vs: "Carp: barbels at the mouth, gold rather than silver, no humped back.",
    habits: "A bottom feeder over gravel and sand that crushes molluscs and crayfish. Common in the main branch and often caught by accident by walleye and smallmouth anglers. Locals call them sheephead.",
    target: ["Bottom-bounced jigs and crawlers over gravel", "Not usually a target, but they fight hard and are worth enjoying when they come"],
    baits: ["jigminnow", "crawler", "tube"],
    where: ["forks", "springbank", "komoka"],
    size: "2–6 lb typical",
  },
  {
    id: "trout", name: "Migratory trout & salmon", sci: "Oncorhynchus / Salmo spp.", season: "troutThames",
    art: { body: "#8FA0A4", back: "#3E5158", belly: "#F2F0E6", marks: "speckle", forked: false, slim: true },
    idKey: [
      "Small fleshy adipose fin between the dorsal and the tail",
      "Rainbow trout: pink lateral band and heavy black spotting into the tail",
      "Brown trout: black and red spots with pale halos, spots not on the tail",
      "Chinook: black gums and a heavily spotted tail",
    ],
    vs: "Any bass or walleye: no adipose fin. That single fin settles it.",
    habits: "Occasional visitors this far up the Thames, not a resident population. Historically taken at Springbank and Delaware, most often in cold water with high flow. Treat every one as a bonus.",
    target: [
      "Cold water, high flow, spring and late autumn",
      "Spoons, spinners and drifted roe in the deeper runs",
      "Check the exceptions carefully — the Thames main branch in Middlesex County runs a different season to the rest of the zone",
    ],
    baits: ["spoon", "spinner", "crawler"],
    where: ["springbank", "kilally", "komoka"],
    size: "Rare but real — 10 lb rainbows have been reported at Springbank",
  },
  {
    id: "sucker", name: "White sucker", sci: "Catostomus commersonii", season: "none",
    art: { body: "#8A8578", back: "#4A473C", belly: "#EBE9DC", slim: true },
    idKey: [
      "Mouth on the underside of the head with thick fleshy lips",
      "No barbels",
      "Plain olive-brown, slightly paler on the belly",
      "Torpedo body with a large forked tail",
    ],
    vs: "Carp: barbels, larger scales, much deeper body.",
    habits: "A bottom feeder in warm shallow water throughout the river. Runs upstream in spring in numbers. Frequently caught on bottom-fished worms while you are after something else.",
    target: ["Worm on the bottom in a slow run", "Good bait indicator — where suckers feed, the bottom is soft and food-rich"],
    baits: ["worm", "crawler"],
    where: ["springbank", "gibbons", "meadowlily", "komoka"],
    size: "12–20 inches",
  },
];

/* ============================ BAITS & LURES ============================ */

const BAITS = [
  { id: "tube", name: "Tube jig", kind: "Soft plastic", sizes: "2.5–3 in, 1/8–1/4 oz head",
    colours: "Green pumpkin, crawfish orange, smoke",
    targets: ["smb", "rock", "crappie", "drum"],
    hook: "Internal tube jig head, size 1/0 — the weight sits inside the tube so it falls nose-down like a crayfish",
    rig: "Jig head inserted inside the tube body", float: "No — you need direct contact with the bottom",
    how: "Cast upstream at a 45-degree angle, let it sink, then hop it back with the current in short lifts. Most takes come as it falls. If you are not occasionally ticking bottom, go heavier.",
    when: "The single most productive smallmouth bait in the Thames, all season" },
  { id: "grub", name: "Curly-tail grub", kind: "Soft plastic", sizes: "3–4 in on 1/8 oz head",
    colours: "Pumpkinseed, white, chartreuse",
    targets: ["smb", "wall", "rock", "wbass"],
    hook: "Round or darter jig head, size 1 to 1/0", rig: "Threaded straight onto a jig head", float: "No",
    how: "Steady slow retrieve just off the bottom, with an occasional pause. The tail does the work — you do not need to add action.",
    when: "The most forgiving lure in the box. If you own one thing, own this." },
  { id: "senko", name: "Wacky-rigged stick worm", kind: "Soft plastic", sizes: "4–5 in, no weight",
    colours: "Green pumpkin, black-blue",
    targets: ["lmb", "smb"],
    hook: "Size 1 or 1/0 octopus or wacky hook through the middle of the worm; add an O-ring to make each worm last",
    rig: "Weightless, hooked through the middle so both ends shimmy on the fall", float: "No",
    how: "Cast past the cover, let it sink on a slack line, and watch the line rather than the lure. When the line jumps or moves sideways, reel down and lean into it.",
    when: "Pond largemouth, and clear calm days when nothing else gets bitten" },
  { id: "texas", name: "Texas-rigged worm or creature", kind: "Soft plastic", sizes: "4–6 in, 1/8–3/8 oz bullet weight",
    colours: "Green pumpkin, junebug",
    targets: ["lmb"],
    hook: "3/0 to 4/0 offset worm hook, point buried in the plastic so it comes through weed-free",
    rig: "Bullet weight above the hook, point tucked back into the body", float: "No",
    how: "Pitch into pads and timber, let it fall, shake twice, lift and move. Fish it slowly — this rig is for getting into places other lures cannot go.",
    when: "Heavy cover on Westminster Ponds and Dorchester Mill Pond" },
  { id: "frog", name: "Hollow-body frog", kind: "Topwater", sizes: "2.5 in",
    colours: "Black, white, green",
    targets: ["lmb", "pike"],
    hook: "Built-in double hook riding upward against the body",
    rig: "Tied straight to braid — you need zero stretch to drive those hooks home", float: "It is the float",
    how: "Walk it across matted pads with small rod twitches, pausing in every gap. When a fish blows up, wait until you feel the weight before setting.",
    when: "Dawn and dusk over pad mats from June to September" },
  { id: "spinnerbait", name: "Spinnerbait", kind: "Wire bait", sizes: "3/8 oz, willow or Colorado blade",
    colours: "White-chartreuse, all white",
    targets: ["pike", "lmb", "smb"],
    hook: "Fixed single hook on the wire arm; add a trailer hook when fish are short-striking",
    rig: "Tie straight to the wire arm", float: "No",
    how: "Slow-roll it just over the weed tops or bump it off timber. The deflection off cover triggers the strike more than the retrieve does.",
    when: "Coloured water and weed edges; near weedless, so fish it where you would not risk trebles" },
  { id: "chatterbait", name: "Bladed jig", kind: "Wire bait", sizes: "3/8 oz",
    colours: "White, black-blue",
    targets: ["lmb", "pike"],
    hook: "Fixed jig hook, plus a paddle-tail trailer",
    rig: "Trailer threaded on the hook shank", float: "No",
    how: "Steady retrieve with a hard vibration you should feel in the rod tip the whole way back. If the vibration stops, something has hold of it.",
    when: "Stained pond water and low light" },
  { id: "spinner", name: "Inline spinner", kind: "Hardware", sizes: "Size 2–3",
    colours: "Silver blade, brass blade",
    targets: ["smb", "rock", "pike", "wbass", "trout"],
    hook: "Factory treble — swap to a single inline hook if you are releasing everything",
    rig: "Small barrel swivel 18 in up the line to stop line twist", float: "No",
    how: "Cast across the current and retrieve just fast enough to feel the blade turning. Slower is almost always better than faster.",
    when: "The easiest lure for a beginner to fish correctly" },
  { id: "jerkbait", name: "Small jerkbait", kind: "Hard bait", sizes: "2.5–3.5 in suspending",
    colours: "Perch, silver-black, clown",
    targets: ["smb", "pike", "wall"],
    hook: "Two size 8–10 trebles as supplied; crush the barbs for easier release",
    rig: "Loop knot or small snap so it can swing freely", float: "No — it suspends",
    how: "Two sharp twitches, then a pause of three to five seconds. The pause is where the bite happens. In cold water, make the pause twice as long.",
    when: "Very small jerkbaits have a long local reputation on the Thames" },
  { id: "crank", name: "Squarebill crankbait", kind: "Hard bait", sizes: "2 in, shallow diving",
    colours: "Craw orange, chartreuse-black",
    targets: ["smb", "lmb", "wall"],
    hook: "Two size 6–8 trebles",
    rig: "Tie direct or use a small snap", float: "Floats at rest, dives on retrieve",
    how: "Deliberately bump it into rock and timber. The deflection is what triggers the strike — a crankbait that never touches anything catches far less.",
    when: "Covering water fast to find where the fish are holding" },
  { id: "shadrap", name: "Jointed diving minnow", kind: "Hard bait", sizes: "3–5 in jointed",
    colours: "Perch, blue-silver",
    targets: ["wall", "pike"],
    hook: "Two or three small trebles",
    rig: "Loop knot for maximum wobble", float: "No",
    how: "Cast and retrieve very slowly from shore, or troll it along the old river channel at Fanshawe at walking pace.",
    when: "The bait Fanshawe walleye anglers have used from shore and boat for decades" },
  { id: "popper", name: "Topwater popper", kind: "Topwater", sizes: "2–3 in",
    colours: "Bone, frog, silver",
    targets: ["smb", "lmb", "pike"],
    hook: "Two small trebles; consider replacing the rear treble with a feathered one",
    rig: "Loop knot so it sits and pops freely", float: "It is the float",
    how: "Cast, let the rings settle completely, then one sharp pop and wait. Impatience kills more topwater fish than anything else.",
    when: "First and last light in summer, low clear water" },
  { id: "spoon", name: "Casting spoon", kind: "Hardware", sizes: "1/2–3/4 oz",
    colours: "Five of Diamonds, silver, brass",
    targets: ["pike", "trout"],
    hook: "Single treble; a wire trace is mandatory for pike",
    rig: "Snap swivel to prevent twist", float: "No",
    how: "Cast long, let it flutter down, then retrieve with an occasional pause so it flashes and falls. The flutter on the drop draws pike in.",
    when: "Cold-water pike, spring and late autumn" },
  { id: "jigminnow", name: "Jig and minnow", kind: "Live bait rig", sizes: "1/8–1/4 oz jig head",
    colours: "Chartreuse, orange, plain lead",
    targets: ["wall", "perch", "drum"],
    hook: "Jig head size 2 to 1/0; hook the minnow once through both lips so it swims naturally",
    rig: "Jig head only, no extra weight", float: "Optional — a slip float suspends it over snaggy bottom",
    how: "Lift twelve inches, let it fall on a semi-slack line, pause, repeat. Almost every take comes on the fall or the pause.",
    when: "The local standard for walleye at Komoka, Delaware and Fanshawe" },
  { id: "minnow", name: "Minnow under a float", kind: "Live bait", sizes: "2–3 in shiners or dace",
    colours: "n/a",
    targets: ["perch", "crappie", "pike"],
    hook: "Size 4–6 baitholder through the back, just behind the dorsal fin",
    rig: "Slip float, split shot 12 in above the hook", float: "Yes — a slip float lets you fish deep and still cast",
    how: "Set the depth so the minnow sits just above weed or bottom. Let the float drift with the current. When it goes under, count two before lifting.",
    when: "Fanshawe perch in autumn, pond crappie in spring" },
  { id: "shiner", name: "Large shiner or sucker", kind: "Live bait", sizes: "4–6 in",
    colours: "n/a",
    targets: ["pike", "lmb"],
    hook: "Size 1/0–2/0 single or a small quick-strike rig, on a wire trace for pike",
    rig: "Free-lined or under a large float", float: "Yes, a large sliding float",
    how: "Cast to the weed edge and let the bait swim. Give a pike line when it takes, then set once it has turned and moved off.",
    when: "Cold water when pike will not chase a lure" },
  { id: "crawler", name: "Nightcrawler", kind: "Live bait", sizes: "Whole or half",
    colours: "n/a",
    targets: ["cat", "drum", "sucker", "carp", "wall"],
    hook: "Size 4–8 baitholder with the barbs on the shank that stop the worm sliding down",
    rig: "Sliding sinker rig on the bottom, or under a float in slow water", float: "Either, depending on target",
    how: "On the bottom, cast out, tighten gently, and set the rod so you can see the tip. Let it develop — do not strike at the first tap.",
    when: "The most versatile bait in Ontario. Nothing refuses a worm." },
  { id: "worm", name: "Piece of worm under a float", kind: "Live bait", sizes: "Half-inch fragment",
    colours: "n/a",
    targets: ["bluegill", "pump", "rock", "perch", "sucker"],
    hook: "Size 8–12 fine-wire hook — small enough for a panfish mouth",
    rig: "Small waggler float, one split shot", float: "Yes — this is the classic float application",
    how: "Set shallow first, about two feet, and go deeper until you find them. Recast every few minutes to keep the bait moving.",
    when: "The best way to get anyone catching their first fish" },
  { id: "waxworm", name: "Wax worm", kind: "Live bait", sizes: "One or two on the hook",
    colours: "n/a",
    targets: ["bluegill", "pump", "perch"],
    hook: "Size 10–12 fine wire, or tipped on a micro jig",
    rig: "Under a small float or on a micro jig", float: "Yes",
    how: "Tip a small jig and give it the tiniest lift-and-drop. Panfish inhale it.",
    when: "Cold water and hard-fished ponds, and through the ice" },
  { id: "microjig", name: "Micro jig", kind: "Soft plastic", sizes: "1/32–1/16 oz, 1–2 in body",
    colours: "Pink-white, chartreuse, black",
    targets: ["crappie", "bluegill", "perch", "wbass"],
    hook: "Integrated size 6–8 jig hook",
    rig: "Alone, or suspended under a small float", float: "Often — a float keeps it in the strike zone at a fixed depth",
    how: "Barely move it. A slow steady draw with tiny shakes is all that is needed. Set the float so the jig sits above the school.",
    when: "Spring crappie in the ponds, and panfish year-round" },
  { id: "corn", name: "Sweetcorn", kind: "Bait", sizes: "3–6 grains",
    colours: "n/a",
    targets: ["carp"],
    hook: "Size 6–8 wide-gape, or a hair rig with the corn on a short hair below the hook",
    rig: "Running lead of 1–2 oz above a swivel, 12 in hooklength", float: "No — fish it hard on the bottom",
    how: "Scatter two handfuls of loose corn into a swim, then fish two or three grains on the hook in the middle of it. Give it thirty minutes before you move.",
    when: "The London carp bait. Cheap, effective, and available anywhere." },
  { id: "bread", name: "Bread", kind: "Bait", sizes: "Flake or a torn crust",
    colours: "n/a",
    targets: ["carp"],
    hook: "Size 6 wide-gape, bread pinched onto the shank",
    rig: "Free-lined on the surface, or bottom-fished with a light lead", float: "Floating crust is its own float",
    how: "Throw a few torn pieces of crust in and watch. When carp start taking them confidently, put one on a hook and drift it in among them.",
    when: "Warm summer afternoons when carp are cruising the surface" },
  { id: "liver", name: "Chicken liver", kind: "Bait", sizes: "Thumb-sized piece",
    colours: "n/a",
    targets: ["cat"],
    hook: "Size 2–2/0 wide-gape, or a treble to hold the soft bait on",
    rig: "Sliding sinker rig; use bait thread or a mesh to stop it flying off the cast", float: "No",
    how: "Cast gently, not hard. Let the scent trail develop for fifteen or twenty minutes before recasting.",
    when: "After dark for channel cats at Greenway and the east-end parks" },
  { id: "cutbait", name: "Cut bait", kind: "Bait", sizes: "1–2 in chunk of oily fish",
    colours: "n/a",
    targets: ["cat"],
    hook: "Size 1/0–3/0 circle hook — the fish hooks itself, no strike needed",
    rig: "Sliding sinker on the bottom", float: "No",
    how: "With a circle hook, do not strike. When the rod loads up, simply lift and start reeling.",
    when: "Big channel cats, warm nights, coloured water" },
  { id: "crayfish", name: "Live or soft-plastic crayfish", kind: "Bait", sizes: "2–3 in",
    colours: "Brown, orange, olive",
    targets: ["smb", "rock"],
    hook: "Size 2–1/0 through the tail so it swims backwards naturally",
    rig: "One or two split shot, drifted through a riffle", float: "No",
    how: "Let it tumble naturally through the current with just enough weight to keep contact. This is the Thames smallmouth's main food.",
    when: "Any smallmouth situation on the river" },
];

/* ============================ HOOK REFERENCE ============================ */

const HOOK_GUIDE = [
  { art: "finewire", size: "10–12", type: "Fine-wire baitholder", use: "Worm fragments, wax worms", sp: "Bluegill, pumpkinseed" },
  { art: "baitholder", size: "8", type: "Baitholder", use: "Half a worm under a float", sp: "Rock bass, perch, small panfish" },
  { art: "widegape", size: "6", type: "Wide-gape or hair rig", use: "Corn, bread", sp: "Carp" },
  { art: "baitholderworm", size: "4–6", type: "Baitholder", use: "Whole nightcrawler, minnow", sp: "Catfish, perch, sucker, drum" },
  { art: "octopus", size: "1–1/0", type: "Octopus / wacky", use: "Wacky-rigged stick worm", sp: "Largemouth, smallmouth" },
  { art: "tubehead", size: "1/0", type: "Tube jig head (internal)", use: "Tube baits", sp: "Smallmouth" },
  { art: "jighead", size: "2–1/0", type: "Round jig head", use: "Grubs, jig and minnow", sp: "Walleye, smallmouth, drum" },
  { art: "offset", size: "3/0–4/0", type: "Offset worm hook", use: "Texas-rigged plastics", sp: "Largemouth in cover" },
  { art: "wiretrace", size: "1/0–2/0", type: "Single, on a wire trace", use: "Live shiner or sucker", sp: "Northern pike" },
  { art: "circle", size: "1/0–3/0", type: "Circle hook", use: "Cut bait on the bottom", sp: "Channel catfish" },
  { art: "treble", size: "6–10", type: "Treble (factory)", use: "Cranks, jerkbaits, spoons", sp: "All predators — crush barbs to release cleanly" },
];

const FLOAT_GUIDE = [
  { rig: "float", when: "Use a float", why: "You need the bait at a set depth above weed, snags or a suspended school — panfish, crappie, perch, live-baiting pike." },
  { rig: "slipfloat", when: "Use a slip float", why: "You need to fish deeper than your rod is long. The float slides down to the bait for casting and stops at your bead on the way back up." },
  { rig: "running", when: "Fish the bottom instead", why: "Your target feeds on the bottom and you want the bait still — carp, catfish, drum, sucker. A running lead lets the fish move without feeling resistance." },
  { rig: "weightless", when: "Fish weightless", why: "Clear, calm, pressured water where a slow natural fall is the whole trigger — wacky worms for pond largemouth." },
  { rig: "splitshot", when: "Add split shot", why: "You need a live bait to get down through current without deadening it. Two small shot beat one big one." },
  { rig: "swivel", when: "Add a barrel swivel", why: "You are throwing anything that spins — inline spinners and spoons — and want to avoid a twisted mess of line." },
  { rig: "leader", when: "Add a wire or heavy fluoro leader", why: "Pike are possible. Their teeth cut through mainline. This is not optional at Fanshawe, Westminster or Dorchester." },
];

/* ============================ LOCATIONS ============================ */
/* depth: cross-section from your bank out to the far bank, in feet.
   hot:   index positions in the depth array that hold fish, with a note. */

const SPOTS = [
  {
    id: "springbank", name: "Springbank Park", area: "West end", water: "Thames — main branch",
    addr: "1085 Commissioners Rd W", ll: [42.9584, -81.3222],
    blurb: "The longest continuous walkable shoreline in the city, roughly 30 km of trail along the river. With the dam gone this stretch now runs shallower and faster than it did for a century.",
    depth: [0, 1, 2, 3.5, 5, 6.5, 7, 6, 4, 2.5, 1, 0],
    hot: [{ i: 3, n: "Gravel shelf — smallmouth at first light" }, { i: 6, n: "Main channel hole — carp, cats, walleye" }, { i: 9, n: "Inside slack — panfish and cruising carp" }],
    density: { smb: 4, carp: 5, cat: 3, wall: 2, pike: 2, rock: 4, drum: 3, sucker: 3, trout: 1, pump: 3, wbass: 3 },
    access: { parking: 5, walk: 5, footing: 4, amenities: 5, cost: 5 },
    accessNote: "Paved trail to the water at multiple points, large free lots at Springbank Gate and Storybook, clean washrooms, LTC service. The most accessible fishing in London.",
    bank: "Mixed — mown grass, some rip-rap and gravel bar",
    hazards: "Trail closures continue around the dam site while restoration finishes. Check london.ca before parking there.",
    best: [4, 5, 6, 8, 9, 10],
    tip: "The lower reaches below the old dam are the productive part. Walk past the crowds at Storybook.",
  },
  {
    id: "greenway", name: "Greenway Park", area: "West-central", water: "Thames — main branch",
    addr: "Terry Fox Pkwy", ll: [42.9764, -81.2733],
    blurb: "Deeper, slower water with easy bank access and a boat launch. The classic London spot for sitting behind two rods on the bottom.",
    depth: [0, 1.5, 3, 5, 7, 8.5, 9, 8, 6, 3.5, 1.5, 0],
    hot: [{ i: 4, n: "Drop-off — cast to the lip, not over it" }, { i: 6, n: "Deep hole — big cats after dark" }, { i: 2, n: "Margin — carp graze right against the bank" }],
    density: { carp: 5, cat: 5, pike: 3, smb: 2, wall: 2, drum: 3, wbass: 3, rock: 3 },
    access: { parking: 5, walk: 5, footing: 4, amenities: 4, cost: 5 },
    accessNote: "Free lot, level ground, boat access point. Short carry from car to water.",
    bank: "Grass down to a soft silt margin",
    hazards: "Soft mud at the waterline after rain.",
    best: [5, 6, 7, 8, 9],
    tip: "Twelve-pound-plus channel cats have come out of here. Fish it after dark with liver on a sliding lead.",
  },
  {
    id: "forks", name: "Harris Park & the Forks", area: "Downtown", water: "Thames — north and south branches meet",
    addr: "531 Ridout St N", ll: [42.9853, -81.2567],
    blurb: "Where the two branches join, under the fountain. Pavement to water's edge and bus routes at the door — the easiest fishing in the city, and the carp capital of London.",
    depth: [0, 2, 4, 5.5, 6, 6.5, 6, 5, 3.5, 2, 1, 0],
    hot: [{ i: 4, n: "Confluence seam — everything funnels through it" }, { i: 8, n: "Slack inside — carp and drum" }],
    density: { carp: 5, cat: 4, drum: 4, wbass: 4, rock: 3, smb: 2, pike: 1 },
    access: { parking: 4, walk: 5, footing: 5, amenities: 2, cost: 5 },
    accessNote: "Paved right to the bank, flat, LTC routes adjacent. No washrooms — that is the one weakness.",
    bank: "Hard surface and engineered stone",
    hazards: "Busy park; watch your backcast for pedestrians and cyclists.",
    best: [5, 6, 7, 8, 9, 11],
    tip: "There is a long-standing December run of white bass here. It is slow, silty water — do not expect much smallmouth.",
  },
  {
    id: "gibbons", name: "Gibbons Park", area: "North, by Western", water: "Thames — north branch",
    addr: "2A Grosvenor St", ll: [42.9984, -81.2607],
    blurb: "Riffle-and-pool water below the university. The best light-tackle smallmouth in the city core.",
    depth: [0, 0.5, 1.5, 2.5, 3.5, 4, 3.5, 2.5, 1.5, 0.8, 0],
    hot: [{ i: 2, n: "Head of the riffle — hold above it and cast up" }, { i: 5, n: "Pool — the deepest holding water" }, { i: 7, n: "Tail-out — smallmouth stage here at dusk" }],
    density: { smb: 4, rock: 5, sucker: 4, carp: 2, pump: 3 },
    access: { parking: 4, walk: 4, footing: 3, amenities: 4, cost: 5 },
    accessNote: "Free lot, paved trail, washrooms and playground. Short scramble down the bank to fishable water.",
    bank: "Gravel and cobble, wadeable in low summer flow",
    hazards: "Uneven bottom with unexpected holes. Wade only where you can see the bottom.",
    best: [5, 6, 7, 8, 9, 10],
    tip: "Small jerkbaits and tubes. Fish upstream and let the bait come back to you naturally.",
  },
  {
    id: "kilally", name: "Kilally Meadows ESA", area: "Northeast", water: "Thames — north branch",
    addr: "Edgevalley Rd", ll: [43.0331, -81.2320],
    blurb: "North branch below the Fanshawe dam, so the water runs colder and clearer than anywhere else in the city. This is where the trout exception matters.",
    depth: [0, 1, 2, 3, 4.5, 5, 4, 3, 2, 1, 0],
    hot: [{ i: 4, n: "Cold deep run — best trout chance in London" }, { i: 2, n: "Boulder seam — smallmouth" }],
    density: { smb: 4, rock: 4, trout: 2, sucker: 3, carp: 1 },
    access: { parking: 3, walk: 3, footing: 3, amenities: 1, cost: 5 },
    accessNote: "Trailhead parking, then a walk in along the Thames Valley Parkway. No washrooms.",
    bank: "Natural, wooded, some steep sections",
    hazards: "ESA rules apply — stay on marked trails, no hunting, licence required.",
    best: [4, 5, 6, 9, 10],
    tip: "The North Thames main branch in Middlesex County is open all year for brown and rainbow trout at S-5 / C-2. Read the exception carefully.",
  },
  {
    id: "meadowlily", name: "Meadowlily Woods ESA", area: "Southeast", water: "Thames — main branch",
    addr: "Meadowlily Rd S", ll: [42.9717, -81.1869],
    blurb: "The quiet one. Wooded banks, undercut holes and gravel bars, with far fewer people than the downtown parks.",
    depth: [0, 1.5, 3, 4.5, 6, 6.5, 5.5, 4, 2, 1, 0],
    hot: [{ i: 1, n: "Undercut bank — smallmouth sit tight underneath" }, { i: 5, n: "Deep hole — catfish after dark" }, { i: 8, n: "Gravel bar tail-out" }],
    density: { smb: 4, cat: 4, rock: 4, carp: 3, sucker: 3, drum: 2 },
    access: { parking: 3, walk: 2, footing: 2, amenities: 1, cost: 5 },
    accessNote: "Free street parking, then a real hike in on natural trail with roots and elevation. No washrooms, no paved surface.",
    bank: "Natural, steep in places, tree-lined",
    hazards: "Steep descents to the water and slippery clay after rain. Not suitable for limited mobility.",
    best: [5, 6, 7, 8, 9, 10],
    tip: "Worth the walk if you want to fish without an audience. Undercut banks are the spot.",
  },
  {
    id: "vauxhall", name: "Vauxhall Park", area: "East end", water: "Thames — main branch",
    addr: "54 Price St", ll: [42.9738, -81.2082],
    blurb: "The east-end access locals have fished for decades. Unglamorous and consistently productive.",
    depth: [0, 1.5, 3, 4.5, 5.5, 6, 5, 3.5, 2, 1, 0],
    hot: [{ i: 4, n: "Channel — carp and cats" }, { i: 2, n: "Shallow gravel — smallmouth at dusk" }],
    density: { carp: 4, cat: 4, smb: 3, rock: 3, drum: 2 },
    access: { parking: 4, walk: 4, footing: 3, amenities: 2, cost: 5 },
    accessNote: "Street and lot parking, short flat walk. Minimal facilities.",
    bank: "Grass and gravel",
    hazards: "Nothing unusual — standard river caution.",
    best: [5, 6, 7, 8, 9],
    tip: "Between the rail trestle and the Horton bridge there is deeper holding water worth finding.",
  },
  {
    id: "thamespark", name: "Thames Park", area: "Central south", water: "Thames — main branch",
    addr: "15 Ridout St S", ll: [42.9756, -81.2534],
    blurb: "Central, easy, and overlooked. Good bottom-fishing water with a paved trail and full park facilities.",
    depth: [0, 2, 3.5, 5, 6, 6.5, 5.5, 4, 2.5, 1, 0],
    hot: [{ i: 5, n: "Main channel — carp and cats" }, { i: 8, n: "Inside bend slack" }],
    density: { carp: 4, cat: 3, smb: 2, drum: 2, rock: 3 },
    access: { parking: 5, walk: 5, footing: 4, amenities: 4, cost: 5 },
    accessNote: "Large lot, paved paths, pool and playground on site. Very family-friendly.",
    bank: "Mown grass with a gentle slope",
    hazards: "Busy in summer.",
    best: [5, 6, 7, 8, 9],
    tip: "A good place to bring someone who has never fished. Facilities cover the boredom problem.",
  },
  {
    id: "westminster", name: "Westminster Ponds / Pond Mills", area: "South", water: "Still water — five connected ponds",
    addr: "696 Wellington Rd", ll: [42.9477, -81.2269],
    blurb: "Five or six connected ponds minutes from the core, all lily-pad edges and weed lines. The best largemouth water inside the city and the reason to own a frog.",
    depth: [0, 2, 4, 7, 11, 15, 16, 14, 9, 5, 2, 0],
    hot: [{ i: 2, n: "Pad edge — largemouth ambush lane" }, { i: 4, n: "Weed line drop — pike patrol this" }, { i: 6, n: "Basin — crappie suspend here in spring" }],
    density: { lmb: 5, bluegill: 5, pump: 4, crappie: 4, pike: 3 },
    access: { parking: 4, walk: 3, footing: 1, amenities: 2, cost: 5 },
    accessNote: "Parking off Wellington and Commissioners, then boardwalk and natural trail. Getting to fishable shoreline is the hard part.",
    bank: "Boggy, soft, undercut at the pad fringe",
    hazards: "Serious: the lily-pad fringe is boggy and full of holes. Anglers report going from one metre to two metres of water in a single step. Do not wade here.",
    best: [5, 6, 7, 8, 9],
    tip: "A float tube or kickboat unlocks this place completely. From shore, fish the accessible pad edges and be patient.",
  },
  {
    id: "fanshawe", name: "Fanshawe Conservation Area", area: "Northeast", water: "Reservoir — 228 ha",
    addr: "1424 Clarke Rd", ll: [43.0355, -81.1884],
    blurb: "London's only real lake fishery, and the only local water that holds a proper walleye and perch population. Entry fee applies.",
    depth: [0, 3, 6, 10, 15, 22, 28, 24, 16, 9, 4, 0],
    hot: [{ i: 6, n: "Old river channel — deepest, coolest water in summer" }, { i: 2, n: "Weedy bay — pike and largemouth" }, { i: 9, n: "Flats — autumn perch schools" }, { i: 4, n: "Near the dam and canoe launch — shore walleye" }],
    density: { wall: 4, pike: 4, perch: 5, smb: 3, lmb: 3, crappie: 2, bluegill: 3 },
    access: { parking: 4, walk: 4, footing: 4, amenities: 5, cost: 2 },
    accessNote: "Full facilities, camping, washrooms, TackleShare rod-and-reel loans through OFAH. But there is an entry fee, and outboards must be under 10 hp.",
    bank: "Managed shoreline, docks, launch",
    hazards: "Open water and wind. Wear a PFD if you are afloat.",
    best: [4, 5, 6, 9, 10, 1],
    tip: "It is not easy fishing. Targeting offshore, unseen structure — especially the old river channel through the middle — pays off far more than fishing the visible bank.",
  },
  {
    id: "komoka", name: "Komoka Provincial Park", area: "15 min west", water: "Thames — main branch, downstream",
    addr: "503 Gideon Dr", ll: [42.9530, -81.3840],
    blurb: "Cleaner, faster Thames water west of the city. Consistently the best local shot at walleye and better-average smallmouth.",
    depth: [0, 1, 3, 5, 7, 8, 7, 5, 3, 1.5, 0],
    hot: [{ i: 3, n: "Current seam off the point" }, { i: 5, n: "Deep run — walleye at dusk" }, { i: 8, n: "Gravel tail-out — smallmouth" }],
    density: { smb: 5, wall: 4, rock: 4, drum: 3, carp: 3, sucker: 3, trout: 2 },
    access: { parking: 3, walk: 3, footing: 3, amenities: 2, cost: 3 },
    accessNote: "Paid parking, 2-hour or 4-hour passes. The payment machine is unreliable — bring coins and a backup plan. Then a walk to the river.",
    bank: "Natural, gravel and clay, some steep descents",
    hazards: "$95 fines for dogs off leash. Steep riverbank in places.",
    best: [4, 5, 6, 9, 10, 11],
    tip: "The Delaware and Kilworth bridge stretches nearby are long-standing local walleye spots, best in cold water before and after summer.",
  },
  {
    id: "dorchester", name: "Dorchester Mill Pond", area: "20 min east", water: "Still water — mill pond",
    addr: "Mill Pond, Thames Centre", ll: [42.9872, -81.0663],
    blurb: "A textbook largemouth and pike pond with a decent crappie population, and a proper ecotrail around it. Electric motors only.",
    depth: [0, 2, 4, 6, 9, 11, 12, 10, 7, 4, 2, 0],
    hot: [{ i: 2, n: "Concrete blocks by the entrance — easy shore access" }, { i: 4, n: "Weed line — pike and largemouth" }, { i: 6, n: "Basin — spring crappie" }],
    density: { lmb: 5, pike: 4, crappie: 4, bluegill: 4, pump: 3 },
    access: { parking: 5, walk: 4, footing: 4, amenities: 3, cost: 5 },
    accessNote: "Free parking on-street and in two lots. Portable toilet on site, ice cream shop at the trail entrance. Concrete blocks near the entrance make solid casting platforms.",
    bank: "Concrete blocks, then natural shoreline and boardwalk",
    hazards: "Discarded line and tackle along the popular stretches — take a bag.",
    best: [4, 5, 6, 7, 8, 9],
    tip: "Worth the drive for the largemouth. Kayak-friendly with an easy launch just right of the entrance.",
  },
];

const ACCESS_PARTS = [
  ["parking", "Parking"], ["walk", "Walk to water"], ["footing", "Bank footing"],
  ["amenities", "Washrooms & facilities"], ["cost", "Free to fish"],
];
const accessScore = (a) => Math.round(ACCESS_PARTS.reduce((s, [k]) => s + (a[k] || 0), 0) / ACCESS_PARTS.length);

/* ============================ KNOTS ============================ */

const KNOTS = [
  {
    id: "clinch", name: "Improved clinch", use: "Tying a hook, lure or swivel to monofilament or fluorocarbon",
    strength: "Around 95% of line strength", diff: "Start here",
    steps: [
      "Pass 6 inches of line through the hook eye.",
      "Twist the tag end around the standing line five times.",
      "Bring the tag back through the small loop right above the hook eye.",
      "Then pass it through the big loop you just created — this is the 'improved' part and it is what stops it slipping.",
      "Wet the knot with saliva, pull the standing line slowly until the coils bed down neatly, and trim the tag to 2 mm.",
    ],
    fail: "If it slips, you skipped the second loop or you pulled it tight dry. Always wet it.",
  },
  {
    id: "palomar", name: "Palomar", use: "Braided line to anything. The strongest simple knot there is.",
    strength: "Close to 100%", diff: "Start here",
    steps: [
      "Double 6 inches of line and pass the loop through the hook eye.",
      "Tie a loose overhand knot with the doubled line — do not tighten it.",
      "Pass the loop over the entire hook or lure.",
      "Wet it and pull both the standing line and the tag together until it seats.",
      "Trim the tag.",
    ],
    fail: "Make sure the loop passes cleanly over the hook point and does not cross the knot. A crossed Palomar fails at half strength.",
  },
  {
    id: "uni", name: "Uni knot", use: "One knot for everything — hooks, spool arbors, and joining two lines",
    strength: "Around 90%", diff: "Worth learning second",
    steps: [
      "Pass the line through the eye and double it back alongside itself, forming a loop.",
      "Wrap the tag end around both strands and through the loop, six times.",
      "Wet it and pull the tag to close the coils into a barrel.",
      "Slide the barrel down to the eye by pulling the standing line, and trim.",
    ],
    fail: "Fewer than five wraps in slippery fluorocarbon will slip. Use six or seven.",
  },
  {
    id: "loop", name: "Non-slip loop knot", use: "Jerkbaits, jointed minnows and topwater — anything that needs free movement",
    strength: "Around 85–90%", diff: "Once you are comfortable",
    steps: [
      "Tie a loose overhand knot in the line about 6 inches from the end, leaving it open.",
      "Pass the tag through the hook eye and back through the overhand knot.",
      "Wrap the tag around the standing line four or five times.",
      "Bring the tag back through the overhand knot, entering from the same side it exited.",
      "Wet, pull the standing line and the tag together, then set the loop size before final tightening.",
    ],
    fail: "A lure tied on tight swims worse. This is the difference between a jerkbait that catches and one that does not.",
  },
  {
    id: "surgeon", name: "Double surgeon's", use: "Joining your mainline to a leader — braid to fluorocarbon",
    strength: "Around 90%, and it is fast", diff: "Once you are comfortable",
    steps: [
      "Lay the two lines alongside each other with about 8 inches of overlap.",
      "Treat the doubled section as one line and tie a simple overhand knot.",
      "Pass the same ends through a second time — that is the double.",
      "Wet thoroughly and pull all four ends apart at once, slowly.",
      "Trim both tags flush.",
    ],
    fail: "Pulling only two of the four ends creates a lopsided knot that fails under load. Pull all four.",
  },
  {
    id: "hair", name: "Hair rig (carp)", use: "Presenting corn or bread off the hook rather than on it",
    strength: "n/a — a rig, not a knot", diff: "Carp-specific",
    steps: [
      "Tie a small loop in one end of a 10-inch hooklength.",
      "Pass the other end through the back of the hook eye and lay it along the shank so the loop hangs 1 cm below the bend.",
      "Whip the line down the shank seven or eight times, trapping it.",
      "Pass the end back through the hook eye from front to back and pull tight.",
      "Thread corn onto the hair with a baiting needle and hold it on with a small boilie stop.",
    ],
    fail: "The whole point is that the hook is exposed. If the bait covers the hook point, the rig will not hook fish.",
  },
];

/* ============================ TIPS ============================ */

const TIPS = [
  { id: "t1", cat: "Reading water", title: "Fish the seam, not the fast or the slow",
    body: "Every riffle on the Thames has a visible line where fast water meets slow. Smallmouth and walleye sit on the slow side of that line and dart into the fast water to feed. Cast into the fast water and let your bait swing across the seam." },
  { id: "t2", cat: "Reading water", title: "Structure beats open water, every time",
    body: "A single boulder, a fallen tree, a bridge pier, a weed edge, a drop-off. If there is nothing for a fish to relate to, there is no fish. Cast to something, not at nothing." },
  { id: "t3", cat: "Reading water", title: "Deep holes hold fish through the middle of the day",
    body: "In summer, fish move shallow at dawn and dusk and drop back into the deepest available water when the sun is high. If you are fishing at noon, fish deep and slow or accept a hard day." },
  { id: "t4", cat: "Conditions", title: "Watch the river level, not just the weather",
    body: "UTRCA publishes Thames levels at thamesriver.on.ca. The recommended paddling flow is 15 cubic metres per second on the north and south branches and 20 on the main branch. Those numbers are also a reasonable proxy for whether the bank is fishable and safe." },
  { id: "t5", cat: "Conditions", title: "Colour after rain is an opportunity",
    body: "Stained water makes walleye feed all day instead of only at dusk, and lets you get closer to spooky smallmouth. Go bigger, brighter and noisier when the river colours up." },
  { id: "t6", cat: "Conditions", title: "Low clear summer water demands a lighter approach",
    body: "In August the Thames runs low and clear and the fish become genuinely spooky. Lengthen your leader, downsize the bait, stay off the skyline, and fish first and last light." },
  { id: "t7", cat: "Handling", title: "Keep the fish in the water",
    body: "Keep fish in the water as much as possible. Wet your hands or use wetted gloves before touching one, never touch the gills or eyes, and hold the fish horizontally supporting its belly rather than suspending it vertically." },
  { id: "t8", cat: "Handling", title: "Have the camera ready before you hook up",
    body: "Photograph fish in the water where you can, and have the camera set before the fish is landed rather than fumbling for it while the fish is out of the water." },
  { id: "t9", cat: "Handling", title: "Cut the line on a deeply hooked fish",
    body: "Remove hooks while the fish is still in the water where possible, using pliers. If it is deeply hooked, cut the line or the hook shank and leave the hook in place — that fish survives far better than one you dig around inside." },
  { id: "t10", cat: "Handling", title: "Release properly",
    body: "Lower the fish gently back into the water rather than dropping it. If it cannot swim away immediately, hold it upright in the current until it goes on its own." },
  { id: "t11", cat: "Rules", title: "Closed season means you cannot target them at all",
    body: "Casting to spawning smallmouth in May is a violation even if you release every fish. Targeting a species during its closed season is the offence, not keeping it." },
  { id: "t12", cat: "Rules", title: "Do not move bait in or out of the zone",
    body: "FMZ 16 sits in the Southern Bait Management Zone. Live or dead baitfish and leeches may not be transported into or out of a Bait Management Zone. Preserved dead bait is exempt. Buy locally, use locally, and never dump a bait bucket." },
  { id: "t13", cat: "Rules", title: "Know who needs a licence",
    body: "Anglers aged 18 to 64 need a licence. Those outside that range do not, but carry all the same rights and responsibilities. For 2026 an Ontario resident pays $26.57 for a 1-year sport licence or $15.07 conservation, plus $8.57 for the three-year Outdoors Card. The 1-day sport licence at $12.21 is the only one that does not need a card." },
  { id: "t14", cat: "Rules", title: "Warmouth may not be kept",
    body: "Warmouth is listed as endangered in Ontario and may not be caught or possessed under a recreational fishing licence. It looks like a rock bass with a bigger mouth — if in doubt, release immediately." },
  { id: "t15", cat: "Safety", title: "Wade only where you can see the bottom",
    body: "The Thames bottom is uneven and there may be holes or deeper areas close to you. If you cannot see the bottom, do not step there. The Westminster Ponds pad fringe is the worst offender in the region." },
  { id: "t16", cat: "Safety", title: "The Thames is not drinking water",
    body: "Carry your own water. Also consult the Guide to Eating Ontario Sport Fish before keeping anything from an urban river running through a city of 400,000." },
  { id: "t17", cat: "Gear", title: "One rod covers ninety percent of London",
    body: "A 6'6\" to 7' medium spinning rod with a 2500-size reel, 10 lb braid and an 8 lb fluorocarbon leader handles smallmouth, walleye, pond largemouth and light carp work. Add a heavier bottom rod only when you get serious about carp and cats." },
  { id: "t18", cat: "Gear", title: "Crush your barbs",
    body: "Barbless hooks come out of fish faster and cleanly, and out of your own hand faster too. The Fish & Paddle Guide recommends them for catch and release, and you lose far fewer fish than people claim." },
  { id: "t19", cat: "Gear", title: "Carry a line bin",
    body: "Discarded monofilament is the single most visible fishing problem on London's banks, especially at Dorchester and the Forks. Bring a small bag out with you and leave with more line than you brought." },
  { id: "t20", cat: "Getting started", title: "Borrow before you buy",
    body: "The conservation areas partner with OFAH on TackleShare, which loans rod, reel and tackle at no charge — a library service for fishing gear. Use it before spending money." },
];

const CONDITIONS = {
  sky: ["Clear", "Part cloud", "Overcast", "Rain", "Snow"],
  wind: ["Calm", "Light", "Moderate", "Strong"],
  clarity: ["Gin clear", "Slight stain", "Stained", "Muddy"],
  level: ["Very low", "Normal", "High", "Flood"],
  moon: ["New", "Waxing", "Full", "Waning"],
};


/* ============================ LURE & BAIT ART ============================ */
/* Drawn to the features that identify each one in the hand or on a shop peg:
   blade shape, lip angle, hook geometry, how it sits in the water. Same
   approach as the fish profiles, and it keeps the app free of external
   image requests. */

const LURE_ART = {
  tube: "tube", grub: "grub", senko: "senko", texas: "texas", frog: "frog",
  spinnerbait: "spinnerbait", chatterbait: "chatterbait", spinner: "spinner",
  jerkbait: "jerkbait", crank: "crank", shadrap: "shadrap", popper: "popper",
  spoon: "spoon", jigminnow: "jigminnow", minnow: "minnow", shiner: "shiner",
  crawler: "crawler", worm: "worm", waxworm: "waxworm", microjig: "microjig",
  corn: "corn", bread: "bread", liver: "liver", cutbait: "cutbait", crayfish: "crayfish",
};

const KIND_FALLBACK = {
  "Soft plastic": "grub", "Hard bait": "crank", "Topwater": "popper",
  "Wire bait": "spinnerbait", "Hardware": "spinner", "Live bait": "crawler",
  "Bait": "bread", "Live bait rig": "jigminnow", "Fly": "spinner",
};

const lureArtType = (b) => LURE_ART[b.id] || KIND_FALLBACK[b.kind] || "grub";

const C = {
  steel: "#8D96A0", steelDark: "#5A646E", lead: "#6E7379",
  brass: "#B8892F", brassDark: "#8A6520", silver: "#C3CAD0",
  green: "#6E8449", greenDark: "#3F5228", pumpkin: "#9A7A3C",
  craw: "#A75B28", white: "#EFEFE6", chart: "#C8D24A",
  flesh: "#B8705C", fleshDark: "#8A4A3A", corn: "#E3C246",
  bread: "#E8DBB6", liver: "#7A3038", line: "#2A3327",
};

/* shared bits */
const Hook = ({ x = 0, y = 0, s = 1, flip = false, color = C.steel }) => (
  <g transform={`translate(${x},${y}) scale(${flip ? -s : s},${s})`}>
    <path d="M0 0 L0 26 q0 14 -13 14 q-13 0 -13 -12 q0 -9 8 -11"
      stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M-18 17 l6 -7 l1 8 z" fill={color} />
    <circle cx="0" cy="-2" r="4" fill="none" stroke={color} strokeWidth="2.5" />
  </g>
);

const Treble = ({ x, y, s = 1, color = C.steel }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <circle cx="0" cy="0" r="3.4" fill="none" stroke={color} strokeWidth="2" />
    <path d="M0 3 L0 14" stroke={color} strokeWidth="2.2" />
    <path d="M0 14 q-9 0 -9 -8 M0 14 q9 0 9 -8 M0 14 l0 -3" stroke={color} strokeWidth="2.2" fill="none" />
    <path d="M-9 6 l3 -4 l1 5 z M9 6 l-3 -4 l-1 5 z" fill={color} />
  </g>
);

const JigHead = ({ x, y, s = 1, color = C.lead }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <path d="M0 0 q16 -3 20 9 q3 10 -8 12 q-13 2 -16 -8 z" fill={color} />
    <circle cx="15" cy="6" r="2.6" fill="#EFEFE6" />
    <circle cx="15" cy="6" r="1.3" fill="#20281E" />
    <path d="M2 2 l-9 -6" stroke={color} strokeWidth="3" strokeLinecap="round" />
  </g>
);

const Blade = ({ x, y, kind, color = C.silver }) => {
  if (kind === "colorado") return <ellipse cx={x} cy={y} rx="11" ry="14" fill={color} stroke={C.steelDark} strokeWidth="1.2" />;
  if (kind === "hex") return <path d={`M${x - 14} ${y} l7 -11 h14 l7 11 l-7 11 h-14 z`} fill={color} stroke={C.steelDark} strokeWidth="1.2" />;
  return <path d={`M${x} ${y - 17} q10 17 0 34 q-10 -17 0 -34`} fill={color} stroke={C.steelDark} strokeWidth="1.2" />;
};

const Skirt = ({ x, y, color = C.white }) => (
  <g>{[0, 1, 2, 3, 4, 5].map(i => (
    <path key={i} d={`M${x} ${y} q18 ${-9 + i * 4} 34 ${-14 + i * 6}`} stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round" opacity={.55 + i * .07} />
  ))}</g>
);

const Float = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <path d="M0 -16 q9 6 9 15 q0 11 -9 15 q-9 -4 -9 -15 q0 -9 9 -15z" fill="#C4402F" />
    <path d="M0 4 q9 3 9 10 q0 11 -9 15 q-9 -4 -9 -15 q0 -7 9 -10z" fill={C.white} />
    <path d="M0 -16 L0 -30" stroke={C.steelDark} strokeWidth="2.2" />
  </g>
);

const Waterline = ({ y = 34 }) => (
  <path d={`M4 ${y} q22 -5 44 0 t44 0 t44 0 t44 0 t44 0`} stroke="#9FC0C8" strokeWidth="2" fill="none" opacity=".85" />
);

function Lure({ b, h = 66 }) {
  const t = lureArtType(b);
  const body = (() => {
    switch (t) {
      case "tube": return (<>
        <path d="M60 42 q0 -16 34 -16 q34 0 34 16 q0 13 -34 13 q-34 0 -34 -13z" fill={C.craw} />
        {[0, 1, 2, 3, 4, 5, 6].map(i => (
          <path key={i} d={`M126 ${34 + i * 2.4} q26 ${-8 + i * 3} 44 ${-12 + i * 5}`} stroke={C.craw} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity={.6 + i * .05} />
        ))}
        <JigHead x={44} y={30} s={.95} />
        <path d="M40 28 L22 22" stroke={C.line} strokeWidth="1.6" />
      </>);
      case "grub": return (<>
        <path d="M66 42 q0 -13 30 -13 q30 0 30 13 q0 12 -30 12 q-30 0 -30 -12z" fill={C.pumpkin} />
        <path d="M126 40 q30 -6 34 12 q4 18 -16 20 q-16 2 -14 -12 q2 -11 12 -8"
          stroke={C.pumpkin} strokeWidth="8" fill="none" strokeLinecap="round" />
        <JigHead x={50} y={30} />
        <path d="M46 28 L26 22" stroke={C.line} strokeWidth="1.6" />
      </>);
      case "senko": return (<>
        <path d="M34 44 q40 -12 78 -12 q38 0 42 12 q-4 12 -42 12 q-38 0 -78 -12z" fill={C.greenDark} />
        <circle cx="96" cy="44" r="7" fill="none" stroke="#D8613A" strokeWidth="3" />
        <Hook x={96} y={30} s={.85} />
        <path d="M96 26 L96 8" stroke={C.line} strokeWidth="1.6" />
        <text x="150" y="76" fontSize="10" fill={C.line} opacity=".6">hooked mid-body</text>
      </>);
      case "texas": return (<>
        <path d="M96 20 l22 12 l-22 12 z" fill={C.brass} />
        <path d="M118 32 q34 -8 52 4 q16 10 4 22 q-12 11 -22 0" stroke={C.greenDark} strokeWidth="10" fill="none" strokeLinecap="round" />
        <Hook x={124} y={26} s={.8} />
        <path d="M96 26 L58 22" stroke={C.line} strokeWidth="1.6" />
        <text x="40" y="70" fontSize="10" fill={C.line} opacity=".6">bullet weight · point buried</text>
      </>);
      case "frog": return (<>
        <path d="M62 42 q0 -18 40 -18 q40 0 40 18 q0 16 -40 16 q-40 0 -40 -16z" fill={C.green} />
        <path d="M138 34 q26 -12 40 -2 q-14 6 -14 14 q14 4 8 12 q-16 4 -34 -8" fill={C.green} opacity=".9" />
        <path d="M64 34 q-18 -10 -30 -2 q12 5 12 12 q-12 5 -6 12 q14 3 26 -8" fill={C.green} opacity=".9" />
        <circle cx="86" cy="28" r="5" fill={C.white} /><circle cx="86" cy="28" r="2.5" fill="#20281E" />
        <circle cx="112" cy="28" r="5" fill={C.white} /><circle cx="112" cy="28" r="2.5" fill="#20281E" />
        <path d="M92 50 q10 8 20 0" stroke={C.steel} strokeWidth="3" fill="none" />
        <Waterline y={62} />
      </>);
      case "spinnerbait": return (<>
        <path d="M56 30 L104 16 L150 26" stroke={C.steel} strokeWidth="3" fill="none" strokeLinejoin="round" />
        <Blade x={150} y={26} kind="willow" />
        <Blade x={104} y={17} kind="colorado" color={C.brass} />
        <JigHead x={44} y={34} s={.95} />
        <Skirt x={68} y={44} color={C.chart} />
        <path d="M56 30 L38 20" stroke={C.line} strokeWidth="1.6" />
      </>);
      case "chatterbait": return (<>
        <Blade x={52} y={38} kind="hex" />
        <JigHead x={64} y={30} s={.95} />
        <Skirt x={90} y={42} color={C.white} />
        <path d="M124 42 q28 -6 34 8 q6 14 -12 16 q-12 1 -10 -9" stroke={C.white} strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M40 36 L22 30" stroke={C.line} strokeWidth="1.6" />
      </>);
      case "spinner": return (<>
        <path d="M42 40 L172 40" stroke={C.steel} strokeWidth="2.6" />
        <Blade x={86} y={40} kind="willow" color={C.brass} />
        <ellipse cx="126" cy="40" rx="16" ry="8" fill={C.brassDark} />
        <ellipse cx="146" cy="40" rx="7" ry="6" fill={C.brass} />
        <circle cx="44" cy="40" r="5" fill="none" stroke={C.steel} strokeWidth="2.4" />
        <Treble x={174} y={40} s={1.1} />
        <path d="M40 40 L18 34" stroke={C.line} strokeWidth="1.6" />
      </>);
      case "jerkbait": return (<>
        <path d="M52 40 q34 -18 78 -14 q40 4 52 14 q-12 11 -52 15 q-44 4 -78 -15z" fill="#A9B4BC" />
        <path d="M52 40 q34 -18 78 -14 q40 4 52 14" fill="#4A5A64" opacity=".55" />
        <path d="M52 40 l-18 14 q-4 5 3 6 q10 1 17 -10z" fill={C.steelDark} />
        <circle cx="168" cy="34" r="5" fill={C.white} /><circle cx="168" cy="34" r="2.5" fill="#20281E" />
        <Treble x={96} y={56} /><Treble x={140} y={56} />
        <path d="M34 54 L16 60" stroke={C.line} strokeWidth="1.6" />
      </>);
      case "crank": return (<>
        <path d="M64 40 q10 -22 50 -22 q46 0 58 22 q-12 22 -58 22 q-40 0 -50 -22z" fill={C.craw} />
        <path d="M64 40 q10 -22 50 -22 q46 0 58 22" fill="#7A3E17" opacity=".5" />
        <path d="M64 30 l-24 6 l0 16 l24 -6z" fill={C.steelDark} opacity=".9" />
        <circle cx="158" cy="32" r="5" fill={C.white} /><circle cx="158" cy="32" r="2.5" fill="#20281E" />
        <Treble x={104} y={62} /><Treble x={148} y={62} />
        <path d="M40 36 L18 32" stroke={C.line} strokeWidth="1.6" />
        <text x="26" y="76" fontSize="10" fill={C.line} opacity=".6">square lip deflects off cover</text>
      </>);
      case "jointed": return (<>
        <path d="M48 40 q22 -14 52 -12 l2 26 q-32 2 -54 -14z" fill="#93A3A8" />
        <path d="M106 28 q40 2 62 12 q-22 12 -62 14z" fill="#93A3A8" />
        <circle cx="103" cy="40" r="3.4" fill={C.steelDark} />
        <path d="M48 40 l-18 12 q-4 5 3 6 q10 1 17 -10z" fill={C.steelDark} />
        <circle cx="156" cy="34" r="4.6" fill={C.white} /><circle cx="156" cy="34" r="2.3" fill="#20281E" />
        <Treble x={80} y={56} /><Treble x={130} y={56} />
        <text x="34" y="76" fontSize="10" fill={C.line} opacity=".6">hinged body · wide slow wobble</text>
      </>);
      case "popper": return (<>
        <path d="M60 38 q6 -16 40 -16 q44 0 58 16 q-14 16 -58 16 q-34 0 -40 -16z" fill={C.bread} />
        <path d="M60 38 q-8 -10 -10 -14 q14 -4 14 -2z" fill="#C9B98E" />
        <ellipse cx="58" cy="38" rx="7" ry="12" fill="#C9B98E" />
        <ellipse cx="58" cy="38" rx="4" ry="8" fill="#8A7D5B" />
        <circle cx="140" cy="32" r="4.6" fill={C.white} /><circle cx="140" cy="32" r="2.3" fill="#20281E" />
        <Treble x={100} y={54} /><Treble x={150} y={54} />
        <Waterline y={40} />
        <text x="40" y="76" fontSize="10" fill={C.line} opacity=".6">cupped face · pop, then wait</text>
      </>);
      case "spoon": return (<>
        <path d="M70 22 q40 -6 62 18 q-22 24 -62 18 q-16 -18 0 -36z" fill={C.brass} stroke={C.brassDark} strokeWidth="1.4" />
        <path d="M78 30 q30 -2 44 10 q-16 12 -44 10 q-10 -10 0 -20z" fill="#D9AE55" opacity=".7" />
        <circle cx="64" cy="40" r="5" fill="none" stroke={C.steel} strokeWidth="2.4" />
        <Treble x={142} y={40} s={1.15} />
        <path d="M60 40 L22 34" stroke={C.line} strokeWidth="1.6" />
      </>);
      case "jigminnow": return (<>
        <JigHead x={48} y={30} s={1.05} />
        <path d="M78 40 q26 -13 56 -10 q26 3 32 10 q-6 8 -32 11 q-30 3 -56 -11z" fill="#A6B0AA" />
        <path d="M78 40 q26 -13 56 -10" stroke="#5D6A66" strokeWidth="2" fill="none" opacity=".6" />
        <path d="M166 40 l16 -10 l-4 10 l4 10z" fill="#7C8880" />
        <circle cx="150" cy="36" r="3.4" fill="#20281E" />
        <path d="M44 28 L22 22" stroke={C.line} strokeWidth="1.6" />
        <text x="34" y="74" fontSize="10" fill={C.line} opacity=".6">hooked through both lips</text>
      </>);
      case "floatminnow": return (<>
        <Float x={52} y={26} s={.95} />
        <path d="M52 42 L52 62" stroke={C.line} strokeWidth="1.5" />
        <circle cx="52" cy="52" r="3.4" fill={C.lead} />
        <path d="M52 62 q30 6 62 4" stroke={C.line} strokeWidth="1.5" fill="none" />
        <path d="M114 66 q22 -11 46 -9 q20 2 26 9 q-6 7 -26 9 q-24 2 -46 -9z" fill="#A6B0AA" />
        <path d="M186 66 l14 -8 l-3 8 l3 8z" fill="#7C8880" />
        <circle cx="172" cy="63" r="3" fill="#20281E" />
        <Waterline y={30} />
      </>);
      case "shiner": return (<>
        <path d="M54 44 q36 -20 84 -17 q40 3 50 17 q-10 14 -50 17 q-48 3 -84 -17z" fill="#B3BEB6" />
        <path d="M54 44 q36 -20 84 -17 q40 3 50 17" fill="#6C7A72" opacity=".45" />
        <path d="M188 44 l18 -12 l-5 12 l5 12z" fill="#7C8880" />
        <circle cx="172" cy="39" r="4.4" fill={C.white} /><circle cx="172" cy="39" r="2.2" fill="#20281E" />
        <Hook x={112} y={22} s={.8} />
        <path d="M112 18 q-30 -8 -56 -2" stroke={C.steelDark} strokeWidth="2.4" fill="none" strokeDasharray="5 3" />
        <text x="26" y="76" fontSize="10" fill={C.line} opacity=".6">wire trace for pike</text>
      </>);
      case "crawler": return (<>
        <Hook x={70} y={16} s={1.15} />
        <path d="M70 24 q22 6 6 20 q-18 15 4 24 q22 9 44 -2 q20 -10 34 2"
          stroke={C.fleshDark} strokeWidth="11" fill="none" strokeLinecap="round" />
        <path d="M70 24 q22 6 6 20 q-18 15 4 24 q22 9 44 -2 q20 -10 34 2"
          stroke={C.flesh} strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M70 12 L44 6" stroke={C.line} strokeWidth="1.6" />
      </>);
      case "floatworm": return (<>
        <Float x={54} y={24} s={.8} />
        <path d="M54 38 L54 56" stroke={C.line} strokeWidth="1.5" />
        <circle cx="54" cy="48" r="3" fill={C.lead} />
        <path d="M54 56 q26 8 54 6" stroke={C.line} strokeWidth="1.5" fill="none" />
        <Hook x={112} y={58} s={.62} />
        <path d="M110 70 q14 6 22 -4" stroke={C.flesh} strokeWidth="7" fill="none" strokeLinecap="round" />
        <Waterline y={28} />
        <text x="140" y="40" fontSize="10" fill={C.line} opacity=".6">set shallow first</text>
      </>);
      case "waxworm": return (<>
        <Hook x={92} y={18} s={.9} />
        <ellipse cx="82" cy="52" rx="17" ry="9" fill="#E8DCA8" transform="rotate(-12 82 52)" />
        {[0, 1, 2, 3].map(i => <path key={i} d={`M${72 + i * 7} 45 q3 8 0 14`} stroke="#C9BC85" strokeWidth="1.6" fill="none" />)}
        <path d="M92 14 L66 8" stroke={C.line} strokeWidth="1.6" />
      </>);
      case "microjig": return (<>
        <JigHead x={78} y={36} s={.62} />
        <path d="M96 44 q22 -6 30 4 q6 8 -6 12 q-10 3 -12 -4" stroke="#D77FA0" strokeWidth="6" fill="none" strokeLinecap="round" />
        {[0, 1, 2].map(i => <path key={i} d={`M126 ${46 + i * 3} q14 ${-2 + i * 3} 22 ${i * 4}`} stroke="#D77FA0" strokeWidth="2" fill="none" strokeLinecap="round" />)}
        <path d="M76 34 L52 28" stroke={C.line} strokeWidth="1.6" />
        <text x="46" y="72" fontSize="10" fill={C.line} opacity=".6">1/32 oz · barely move it</text>
      </>);
      case "hairrig": return (<>
        <Hook x={96} y={16} s={1.1} flip />
        <path d="M96 42 L96 58" stroke={C.steel} strokeWidth="2" />
        {[0, 1, 2].map(i => (
          <g key={i}><ellipse cx={96 + i * 15} cy={62} rx="8" ry="6.5" fill={C.corn} stroke="#B79A2C" strokeWidth="1" /></g>
        ))}
        <path d="M96 12 L60 6" stroke={C.line} strokeWidth="1.6" />
        <text x="24" y="74" fontSize="10" fill={C.line} opacity=".6">bait on the hair, hook point clear</text>
      </>);
      case "bread": return (<>
        <Hook x={104} y={14} s={1} />
        <path d="M78 40 q6 -18 30 -16 q26 2 26 18 q0 16 -26 17 q-26 1 -30 -19z" fill={C.bread} stroke="#C9B98E" strokeWidth="1.2" />
        {[[92, 38], [108, 46], [120, 36], [100, 56], [118, 56]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.6" fill="#D2C29A" />
        ))}
        <Waterline y={30} />
        <text x="30" y="76" fontSize="10" fill={C.line} opacity=".6">crust floats · flake sinks slowly</text>
      </>);
      case "liver": return (<>
        <Hook x={100} y={14} s={1.05} />
        <path d="M76 44 q4 -16 26 -16 q24 0 28 16 q4 18 -22 20 q-28 2 -32 -20z" fill={C.liver} />
        <path d="M88 38 q12 -6 24 2" stroke="#5C2029" strokeWidth="2" fill="none" opacity=".7" />
        <path d="M100 10 L70 4" stroke={C.line} strokeWidth="1.6" />
        <text x="30" y="76" fontSize="10" fill={C.line} opacity=".6">cast gently · scent trail does the work</text>
      </>);
      case "cutbait": return (<>
        <g transform="translate(100,16)">
          <path d="M0 0 L0 22 q0 16 -15 16 q-14 0 -14 -13 q0 -10 9 -12" stroke={C.steel} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M-20 13 q7 -2 8 4" stroke={C.steel} strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="0" cy="-2" r="4" fill="none" stroke={C.steel} strokeWidth="2.5" />
        </g>
        <path d="M74 46 l26 -10 l30 8 l-6 22 l-30 6z" fill="#9AA39A" />
        <path d="M74 46 l26 -10 l30 8" fill="#6E786E" opacity=".6" />
        {[0, 1, 2].map(i => <path key={i} d={`M${84 + i * 14} 48 l-3 22`} stroke="#5C6660" strokeWidth="1.4" opacity=".6" />)}
        <text x="24" y="78" fontSize="10" fill={C.line} opacity=".6">circle hook · do not strike, just lift</text>
      </>);
      case "crayfish": return (<>
        <path d="M78 44 q22 -14 48 -10 q22 4 26 12 q-6 10 -26 13 q-28 4 -48 -15z" fill={C.craw} />
        {[0, 1, 2, 3].map(i => (
          <path key={i} d={`M${96 + i * 13} 54 q4 12 -6 16`} stroke="#8A4A1E" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        ))}
        {[0, 1, 2, 3].map(i => (
          <path key={"u" + i} d={`M${96 + i * 13} 36 q4 -11 -6 -15`} stroke="#8A4A1E" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        ))}
        <path d="M152 40 q22 -12 34 -2 q-12 4 -12 10 q12 4 2 10 q-14 2 -24 -8z" fill={C.craw} />
        <path d="M186 34 q10 -8 16 -2 M186 46 q10 8 16 2" stroke="#8A4A1E" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M78 44 l-16 -12 l4 14 l-6 12 l18 -6z" fill="#8A4A1E" />
        <circle cx="164" cy="36" r="2.6" fill="#20281E" />
        <text x="30" y="78" fontSize="10" fill={C.line} opacity=".6">swims backwards · the Thames staple</text>
      </>);
      default: return (<>
        <path d="M70 42 q0 -13 30 -13 q30 0 30 13 q0 12 -30 12 q-30 0 -30 -12z" fill={C.pumpkin} />
        <JigHead x={54} y={30} />
      </>);
    }
  })();

  return (
    <svg viewBox="0 0 220 88" style={{ width: "100%", height: h, display: "block" }}
      role="img" aria-label={`Illustration of ${b.name}`}>
      {body}
    </svg>
  );
}

/* ============================ SHARED UI ============================ */

function Sheet({ title, onClose, children, action }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheethdr">
          <h3 style={{ flex: 1, minWidth: 0 }}>{title}</h3>
          {action}
          <button className="x" onClick={onClose}>Close</button>
        </div>
        <div style={{ padding: "16px 16px 64px" }}>{children}</div>
      </div>
    </>
  );
}

const Gauge = ({ v, max = 5 }) => (
  <span className="gauge" aria-label={`${v} of ${max}`}>
    {Array.from({ length: max }).map((_, i) => (
      <i key={i} className={i < v ? "on" : ""} style={{ height: 6 + i * 2.5 }} />
    ))}
  </span>
);

function Field({ label, hint, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="tiny muted" style={{ marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

function Choice({ options, value, onChange, multi }) {
  const sel = multi ? (value || []) : value;
  return (
    <div className="optgrid">
      {options.map((o) => {
        const val = typeof o === "string" ? o : o.v;
        const lab = typeof o === "string" ? o : o.l;
        const on = multi ? sel.includes(val) : sel === val;
        return (
          <button key={val} type="button" className={"opt" + (on ? " on" : "")}
            onClick={() => onChange(multi ? (on ? sel.filter(x => x !== val) : [...sel, val]) : val)}>
            {lab}
          </button>
        );
      })}
    </div>
  );
}

function BarList({ data, unit = "", accent = "var(--deep)" }) {
  const max = Math.max(1, ...data.map(d => d.v));
  if (!data.length) return <p className="muted small">Nothing logged yet.</p>;
  return (
    <div className="stack" style={{ marginTop: 4 }}>
      {data.map((d) => (
        <div key={d.k}>
          <div className="between" style={{ marginBottom: 3 }}>
            <span className="small">{d.k}</span>
            <span className="small num muted">{d.v}{unit}</span>
          </div>
          <div style={{ height: 7, background: "var(--line2)", borderRadius: 1 }}>
            <div style={{ width: `${(d.v / max) * 100}%`, height: "100%", background: accent, borderRadius: 1 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Cross-section of the water at a spot */
function DepthChart({ spot }) {
  const d = spot.depth, maxD = Math.max(...d), W = 300, H = 108;
  const step = W / (d.length - 1);
  const pts = d.map((v, i) => `${i * step},${8 + (v / maxD) * (H - 26)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} role="img"
        aria-label={`Depth cross-section, maximum ${maxD} feet`}>
        <defs>
          <linearGradient id={"dg" + spot.id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9FC0C8" /><stop offset="1" stopColor="#223C46" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={W} height="8" fill="#C7CDBF" />
        <polygon points={`0,8 ${pts} ${W},8`} fill={`url(#dg${spot.id})`} />
        {[0.25, 0.5, 0.75].map((f, i) => (
          <line key={i} x1="0" y1={8 + f * (H - 26)} x2={W} y2={8 + f * (H - 26)}
            stroke="#fff" strokeOpacity=".18" strokeDasharray="3 5" />
        ))}
        {spot.hot.map((h, i) => (
          <g key={i}>
            <circle cx={h.i * step} cy={8 + (d[h.i] / maxD) * (H - 26) - 9} r="6.5" fill="var(--brass)" />
            <text x={h.i * step} y={8 + (d[h.i] / maxD) * (H - 26) - 5.6} fontSize="9" fill="#fff"
              textAnchor="middle" fontWeight="600">{i + 1}</text>
          </g>
        ))}
        <text x="3" y={H - 3} fontSize="9" fill="var(--ink2)">your bank</text>
        <text x={W - 3} y={H - 3} fontSize="9" fill="var(--ink2)" textAnchor="end">far bank</text>
        <text x={W - 3} y={H - 16} fontSize="9.5" fill="#fff" textAnchor="end" fontWeight="600">
          max {maxD} ft
        </text>
      </svg>
      <ol style={{ margin: "10px 0 0", padding: 0, listStyle: "none" }} className="stack">
        {spot.hot.map((h, i) => (
          <li key={i} className="row small" style={{ alignItems: "flex-start" }}>
            <span style={{
              background: "var(--brass)", color: "#fff", width: 17, height: 17, borderRadius: 9,
              fontSize: 10.5, display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1, fontWeight: 600
            }}>{i + 1}</span>
            <span>{h.n} <span className="muted num">· {spot.depth[h.i]} ft</span></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const DENSITY_WORDS = { 5: "Abundant", 4: "Common", 3: "Regular", 2: "Occasional", 1: "Rare" };

/* ============================ SCREENS: SPOTS ============================ */

function SeasonHero({ today }) {
  const keys = ["bass", "walleye", "pike", "musky", "catfish", "perch", "crappie", "sunfish"];
  const names = { bass: "Bass", walleye: "Walleye", pike: "Northern pike", musky: "Muskellunge",
    catfish: "Channel catfish", perch: "Yellow perch", crappie: "Crappie", sunfish: "Sunfish" };
  return (
    <div className="seasonwrap">
      <h2>Open right now in Zone 16</h2>
      <div className="date">{fmtLong(today)} · Fisheries Management Zone 16</div>
      <div className="seasongrid">
        {keys.map((k) => {
          const open = isOpenOn(k, today);
          const nx = open ? null : nextOpen(k, today);
          return (
            <div key={k} className={"sbadge" + (open ? "" : " shut")}>
              <div className="nm">{names[k]}</div>
              <div className="st">{open ? "Open" : nx ? `Opens ${fmtShort(nx)}` : "Closed"}</div>
            </div>
          );
        })}
      </div>
      <div className="tiny" style={{ color: "#A9C2C9", marginTop: 12 }}>
        Carp, drum, white bass and sucker have no closed season. Lake sturgeon is closed all year.
        Always confirm against the current Ontario Fishing Regulations Summary before you fish.
      </div>
    </div>
  );
}

function SpotsScreen({ spots, allSpecies, onOpen, onAdd }) {
  const [filter, setFilter] = useState("all");
  const today = new Date();
  const filters = [
    { v: "all", l: "All" }, { v: "river", l: "River" }, { v: "still", l: "Ponds & lake" },
    { v: "easy", l: "Easy access" },
  ];
  const shown = spots.filter((s) => {
    if (filter === "river") return s.water.includes("Thames");
    if (filter === "still") return !s.water.includes("Thames");
    if (filter === "easy") return accessScore(s.access) >= 4;
    return true;
  });
  return (
    <>
      <div className="hdr">
        <div className="kick">London, Ontario · Thames River watershed</div>
        <h1 style={{ marginTop: 3 }}>Where to fish</h1>
      </div>
      <SeasonHero today={today} />
      <div className="pad" style={{ paddingTop: 16 }}>
        <div className="segbar">
          {filters.map(f => (
            <button key={f.v} className={filter === f.v ? "on" : ""} onClick={() => setFilter(f.v)}>{f.l}</button>
          ))}
        </div>
        <div className="stack" style={{ marginTop: 14 }}>
          {shown.map((s) => {
            const sc = accessScore(s.access);
            const top = Object.entries(s.density || {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
              .map(([id]) => allSpecies.find(x => x.id === id)?.name).filter(Boolean);
            return (
              <button key={s.id} className="listbtn" onClick={() => onOpen(s)}>
                <div className="between">
                  <h3 style={{ flex: 1 }}>{s.name}</h3>
                  <Gauge v={sc} />
                </div>
                <div className="tiny muted" style={{ marginTop: 3 }}>{s.area} · {s.water}</div>
                <div className="wrap" style={{ marginTop: 8 }}>
                  {top.map(n => <span key={n} className="chip">{n}</span>)}
                  {s.custom && <span className="chip brass">Yours</span>}
                </div>
              </button>
            );
          })}
        </div>
        <button className="btn ghost" style={{ marginTop: 14 }} onClick={onAdd}>Add a spot of your own</button>
        <p className="tiny muted" style={{ marginTop: 12 }}>
          The access gauge scores parking, walk to the water, bank footing, facilities and cost.
          Five bars means you can park and cast without a scramble.
        </p>
      </div>
    </>
  );
}

function SpotDetail({ spot, allSpecies, env, busy, onClose, onDelete, onLogHere, onRefreshEnv, onPickStation, onAutoGauge }) {
  useEffect(() => { if (onAutoGauge) onAutoGauge(spot); }, [spot.id]);
  const sc = accessScore(spot.access);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dens = Object.entries(spot.density || {})
    .map(([id, v]) => ({ sp: allSpecies.find(s => s.id === id), v }))
    .filter(x => x.sp).sort((a, b) => b.v - a.v);
  return (
    <Sheet title={spot.name} onClose={onClose}>
      <div className="stack">
        <div className="tiny muted">{spot.area} · {spot.water} · {spot.addr}</div>
        <p className="prose" style={{ margin: 0 }}>{spot.blurb}</p>

        <div className="divlabel">Conditions</div>
        <ConditionsPanel spot={spot} env={env} busy={busy}
          onRefresh={() => onRefreshEnv(spot)} onPickStation={() => onPickStation(spot)} />

        <div className="divlabel">Water depth and where fish hold</div>
        <div className="card"><DepthChart spot={spot} /></div>

        <div className="divlabel">Fish density</div>
        <div className="card stack">
          {dens.map(({ sp, v }) => (
            <div key={sp.id} className="between">
              <span className="small">{sp.name}</span>
              <span className="row" style={{ gap: 8 }}>
                <span className="tiny muted">{DENSITY_WORDS[v]}</span><Gauge v={v} />
              </span>
            </div>
          ))}
        </div>

        <div className="divlabel">Access rating {sc}/5</div>
        <div className="card stack">
          {ACCESS_PARTS.map(([k, l]) => (
            <div key={k} className="between">
              <span className="small">{l}</span><Gauge v={spot.access[k] || 0} />
            </div>
          ))}
          <p className="small muted" style={{ margin: "6px 0 0" }}>{spot.accessNote}</p>
          <div className="tiny muted">Bank: {spot.bank}</div>
        </div>

        {spot.hazards && (
          <div className="card" style={{ borderLeft: "3px solid var(--rust)" }}>
            <div className="small" style={{ color: "var(--rust)", fontWeight: 500, marginBottom: 4 }}>Watch out</div>
            <div className="small">{spot.hazards}</div>
          </div>
        )}

        <div className="divlabel">Best months</div>
        <div className="wrap">
          {months.map((m, i) => (
            <span key={m} className={"chip" + ((spot.best || []).includes(i + 1) ? " solid" : "")}>{m}</span>
          ))}
        </div>

        {spot.tip && (
          <div className="card flat" style={{ borderLeft: "3px solid var(--brass)" }}>
            <div className="small">{spot.tip}</div>
          </div>
        )}

        <button className="btn" onClick={() => onLogHere(spot)}>Start a trip here</button>
        {spot.ll && (
          <a className="btn ghost" href={`https://www.google.com/maps/search/?api=1&query=${spot.ll[0]},${spot.ll[1]}`}
            target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Open in Maps</a>
        )}
        {spot.custom && <button className="btn danger" onClick={() => onDelete(spot.id)}>Delete this spot</button>}
      </div>
    </Sheet>
  );
}

/* ============================ SCREENS: ENCYCLOPEDIA ============================ */

function GuideScreen({ allSpecies, allBaits, spots, photos, onOpenSpecies, onOpenBait, onAddSpecies, onAddBait }) {
  const [tab, setTab] = useState("species");
  const [q, setQ] = useState("");
  const [filterSp, setFilterSp] = useState("");
  const today = new Date();

  const sp = allSpecies.filter(s => !q || (s.name + " " + (s.sci || "")).toLowerCase().includes(q.toLowerCase()));
  const ba = allBaits.filter(b =>
    (!q || b.name.toLowerCase().includes(q.toLowerCase())) &&
    (!filterSp || (b.targets || []).includes(filterSp)));

  return (
    <>
      <div className="hdr">
        <div className="kick">Field guide</div>
        <h1 style={{ marginTop: 3 }}>Encyclopedia</h1>
      </div>
      <div className="pad" style={{ paddingTop: 14 }}>
        <div className="segbar">
          <button className={tab === "species" ? "on" : ""} onClick={() => setTab("species")}>Fish</button>
          <button className={tab === "baits" ? "on" : ""} onClick={() => setTab("baits")}>Baits & lures</button>
          <button className={tab === "hooks" ? "on" : ""} onClick={() => setTab("hooks")}>Hooks & rigs</button>
        </div>

        {tab !== "hooks" && (
          <input style={{ marginTop: 12 }} placeholder={tab === "species" ? "Search fish" : "Search baits and lures"}
            value={q} onChange={e => setQ(e.target.value)} />
        )}

        {tab === "species" && (
          <>
            <div className="stack" style={{ marginTop: 14 }}>
              {sp.map((s) => {
                const open = isOpenOn(s.season, today);
                const photo = photos[s.id];
                return (
                  <button key={s.id} className="listbtn" onClick={() => onOpenSpecies(s)} style={{ padding: 0, overflow: "hidden" }}>
                    <div style={{ background: "#CBD4C6", borderBottom: "1px solid var(--line2)" }}>
                      {photo
                        ? <img src={photo} alt={s.name} style={{ width: "100%", height: 118, objectFit: "cover", display: "block" }} />
                        : <Fish sp={s} h={104} />}
                    </div>
                    <div style={{ padding: "11px 14px 13px" }}>
                      <div className="between">
                        <h3>{s.name}</h3>
                        <span className={"chip " + (open ? "open" : "shut")}>{open ? "In season" : "Closed"}</span>
                      </div>
                      <div className="tiny muted serif" style={{ fontStyle: "italic", marginTop: 2 }}>{s.sci}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <button className="btn ghost" style={{ marginTop: 14 }} onClick={onAddSpecies}>Add a species</button>
          </>
        )}

        {tab === "baits" && (
          <>
            <div className="wrap" style={{ marginTop: 12 }}>
              <button className={"chip" + (!filterSp ? " solid" : "")} onClick={() => setFilterSp("")}>Everything</button>
              {allSpecies.slice(0, 10).map(s => (
                <button key={s.id} className={"chip" + (filterSp === s.id ? " solid" : "")}
                  onClick={() => setFilterSp(filterSp === s.id ? "" : s.id)}>{s.name}</button>
              ))}
            </div>
            <div className="stack" style={{ marginTop: 14 }}>
              {ba.map((b) => {
                const photo = photos[b.id];
                return (
                <button key={b.id} className="listbtn" onClick={() => onOpenBait(b)}
                  style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ background: "#CBD4C6", borderBottom: "1px solid var(--line2)" }}>
                    {photo
                      ? <img src={photo} alt={b.name} style={{ width: "100%", height: 128, objectFit: "cover", display: "block" }} />
                      : <BaitArt b={b} h={118} />}
                  </div>
                  <div style={{ padding: "11px 14px 13px" }}>
                    <div className="between">
                      <h3 style={{ fontSize: 17 }}>{b.name}</h3>
                      <span className="chip">{b.kind}</span>
                    </div>
                    <div className="tiny muted" style={{ marginTop: 4 }}>{b.sizes}</div>
                    <div className="wrap" style={{ marginTop: 8 }}>
                      {(b.targets || []).slice(0, 4).map(t => {
                        const s = allSpecies.find(x => x.id === t);
                        return s ? <span key={t} className="chip">{s.name}</span> : null;
                      })}
                    </div>
                  </div>
                </button>
              );})}
              {!ba.length && <p className="muted small">No baits match that filter yet. Add one of your own.</p>}
            </div>
            <button className="btn ghost" style={{ marginTop: 14 }} onClick={onAddBait}>Add a bait or lure</button>
          </>
        )}

        {tab === "hooks" && (
          <div className="stack" style={{ marginTop: 14 }}>
            <p className="small muted" style={{ margin: 0 }}>
              Hook sizes run backwards: the bigger the number, the smaller the hook, until you
              reach 1 and it flips to 1/0, 2/0 and upward. A size 10 is tiny; a 4/0 is not.
            </p>
            {HOOK_GUIDE.map((h, i) => (
              <div key={i} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ background: "#CBD4C6", borderBottom: "1px solid var(--line2)" }}>
                  <HookArt type={h.art} h={132} />
                </div>
                <div style={{ padding: "12px 14px 14px" }}>
                  <div className="between">
                    <h3 style={{ fontSize: 17 }}>{h.type}</h3>
                    <span className="chip num">{h.size}</span>
                  </div>
                  <div className="small" style={{ marginTop: 6 }}>{h.use}</div>
                  <div className="tiny muted" style={{ marginTop: 4 }}>{h.sp}</div>
                </div>
              </div>
            ))}
            <div className="divlabel">Floats, weights and leaders</div>
            <div className="stack">
              {FLOAT_GUIDE.map((f, i) => (
                <div key={i} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ background: "#CBD4C6", borderBottom: "1px solid var(--line2)" }}>
                    <RigArt type={f.rig} h={128} />
                  </div>
                  <div style={{ padding: "12px 14px 14px" }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>{f.when}</div>
                    <div className="small muted">{f.why}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SpeciesDetail({ sp, allBaits, spots, photo, onClose, onSetPhoto, onDelete, onOpenBait }) {
  const today = new Date();
  const open = isOpenOn(sp.season, today);
  const nx = open ? null : nextOpen(sp.season, today);
  const seas = SEASONS[sp.season] || SEASONS.none;
  const baits = (sp.baits || []).map(id => allBaits.find(b => b.id === id)).filter(Boolean);
  const where = (sp.where || []).map(id => spots.find(s => s.id === id)).filter(Boolean);
  const [url, setUrl] = useState(photo || "");
  return (
    <Sheet title={sp.name} onClose={onClose}>
      <div className="stack">
        <div className="card" style={{ padding: 0, overflow: "hidden", background: "#CBD4C6" }}>
          {photo
            ? <img src={photo} alt={sp.name} style={{ width: "100%", display: "block" }} />
            : <Fish sp={sp} h={140} />}
        </div>
        <div className="between">
          <div className="serif muted" style={{ fontStyle: "italic" }}>{sp.sci}</div>
          <span className={"chip " + (open ? "open" : "shut")}>
            {open ? "In season" : nx ? `Opens ${fmtShort(nx)}` : "Closed"}
          </span>
        </div>

        <div className="divlabel">How to tell it apart</div>
        <div className="card">
          <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">
            {(sp.idKey || []).map((k, i) => <li key={i} className="small">{k}</li>)}
          </ul>
          {sp.vs && (
            <div className="small" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line2)" }}>
              <span className="muted">Not to be confused with — </span>{sp.vs}
            </div>
          )}
        </div>

        <div className="divlabel">Habits</div>
        <p className="prose" style={{ margin: 0 }}>{sp.habits}</p>

        {(sp.target || []).length > 0 && <>
          <div className="divlabel">How to target it</div>
          <div className="card stack">
            {sp.target.map((t, i) => (
              <div key={i} className="row" style={{ alignItems: "flex-start" }}>
                <span style={{ width: 5, height: 5, borderRadius: 3, background: "var(--brass)", marginTop: 8, flexShrink: 0 }} />
                <span className="small">{t}</span>
              </div>
            ))}
          </div>
        </>}

        {baits.length > 0 && <>
          <div className="divlabel">What it eats</div>
          <div className="stack">
            {baits.map(b => (
              <button key={b.id} className="listbtn" onClick={() => onOpenBait(b)}>
                <div className="row" style={{ alignItems: "center", gap: 11 }}>
                  <span style={{ width: 74, flexShrink: 0, background: "#CBD4C6", borderRadius: 3, overflow: "hidden" }}>
                    <BaitArt b={b} h={40} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div className="between"><span style={{ fontWeight: 500 }}>{b.name}</span><span className="chip">{b.kind}</span></div>
                    <div className="tiny muted" style={{ marginTop: 3 }}>{b.hook}</div>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>}

        {where.length > 0 && <>
          <div className="divlabel">Where to find it in London</div>
          <div className="wrap">{where.map(s => <span key={s.id} className="chip">{s.name}</span>)}</div>
        </>}

        <div className="divlabel">Season and limits — Zone 16</div>
        <div className="card">
          <div className="small"><span className="muted">Season · </span>{seas.label}</div>
          <div className="small" style={{ marginTop: 5 }}><span className="muted">Limit · </span>{seas.limit}</div>
          {sp.size && <div className="small muted" style={{ marginTop: 5 }}>{sp.size}</div>}
        </div>

        <div className="divlabel">Your photo</div>
        <Field label="Paste a photo link to replace the illustration"
          hint="Any image URL works — your own catch photo hosted anywhere, or a reference shot. It stays on this device.">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <div className="row">
          <button className="btn sm" onClick={() => onSetPhoto(sp.id, url.trim())}>Save photo</button>
          {photo && <button className="btn sm ghost" onClick={() => { setUrl(""); onSetPhoto(sp.id, ""); }}>Remove</button>}
        </div>
        {sp.custom && <button className="btn danger" onClick={() => onDelete(sp.id)}>Delete this species</button>}
      </div>
    </Sheet>
  );
}

function BaitDetail({ b, allSpecies, photo, onClose, onDelete, onSetPhoto }) {
  const targets = (b.targets || []).map(id => allSpecies.find(s => s.id === id)).filter(Boolean);
  const [url, setUrl] = useState(photo || "");
  return (
    <Sheet title={b.name} onClose={onClose}>
      <div className="stack">
        <div className="card" style={{ padding: 0, overflow: "hidden", background: "#CBD4C6" }}>
          {photo
            ? <img src={photo} alt={b.name} style={{ width: "100%", display: "block" }} />
            : <BaitArt b={b} h={168} />}
        </div>
        <div className="wrap">
          <span className="chip solid">{b.kind}</span>
          {b.sizes && <span className="chip">{b.sizes}</span>}
        </div>
        {b.when && <p className="prose" style={{ margin: 0 }}>{b.when}</p>}

        <div className="divlabel">How to fish it</div>
        <p className="prose" style={{ margin: 0 }}>{b.how}</p>

        <div className="divlabel">Rigging</div>
        <div className="card stack">
          <div><div className="tiny muted">Hook</div><div className="small">{b.hook}</div></div>
          {b.rig && <div><div className="tiny muted">Rig</div><div className="small">{b.rig}</div></div>}
          {b.float && <div><div className="tiny muted">Float or weight</div><div className="small">{b.float}</div></div>}
          {b.colours && b.colours !== "n/a" && <div><div className="tiny muted">Colours that work here</div><div className="small">{b.colours}</div></div>}
        </div>

        {targets.length > 0 && <>
          <div className="divlabel">Works on</div>
          <div className="wrap">{targets.map(s => <span key={s.id} className="chip">{s.name}</span>)}</div>
        </>}
        <div className="divlabel">Your photo</div>
        <Field label="Paste a photo link to replace the illustration"
          hint="A shot of your own — the exact colour you fish, or how you rig it. Stored on this device and included in your Field Guide Pack.">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <div className="row">
          <button className="btn sm" onClick={() => onSetPhoto(b.id, url.trim())}>Save photo</button>
          {photo && <button className="btn sm ghost" onClick={() => { setUrl(""); onSetPhoto(b.id, ""); }}>Remove</button>}
        </div>
        {b.custom && <button className="btn danger" onClick={() => onDelete(b.id)}>Delete this bait</button>}
      </div>
    </Sheet>
  );
}

/* ============================ SCREENS: RESOURCES ============================ */

function KnotDiagram({ step, total }) {
  const t = step / Math.max(1, total - 1);
  return (
    <svg viewBox="0 0 200 70" style={{ width: "100%", height: 62, display: "block" }} aria-hidden="true">
      <circle cx="164" cy="35" r="11" fill="none" stroke="var(--ink2)" strokeWidth="3" />
      <path d="M10 35 H150" stroke="var(--deep)" strokeWidth="2.5" fill="none" />
      {step >= 1 && <path d="M150 35 q22 -18 26 2 q-6 16 -22 4" stroke="var(--deep)" strokeWidth="2.5" fill="none" />}
      {step >= 2 && Array.from({ length: 5 }).map((_, i) => (
        <path key={i} d={`M${106 + i * 9} 28 q4.5 7 0 14`} stroke="var(--brass)" strokeWidth="2.2" fill="none"
          opacity={i / 5 <= t + 0.35 ? 1 : 0.2} />
      ))}
      {step >= 3 && <path d="M154 47 q-30 12 -52 -4" stroke="var(--brass)" strokeWidth="2.2" fill="none" strokeDasharray="4 3" />}
      {step >= total - 1 && <text x="60" y="64" fontSize="9" fill="var(--ink2)">seated and trimmed</text>}
    </svg>
  );
}

function KnotCard({ k, onDelete }) {
  const [i, setI] = useState(0);
  const steps = Array.isArray(k.steps) && k.steps.length ? k.steps : ["No steps recorded yet."];
  return (
    <div className="card">
      <div className="between">
        <h3 style={{ fontSize: 17 }}>{k.name}</h3>
        <span className="row" style={{ gap: 7 }}>
          <span className="chip brass">{k.diff}</span>
          {onDelete && <button className="tiny" style={{ color: "var(--rust)" }} onClick={onDelete}>Delete</button>}
        </span>
      </div>
      <div className="tiny muted" style={{ marginTop: 3 }}>{k.use} · {k.strength}</div>
      <div style={{ background: "var(--card2)", borderRadius: 3, padding: "8px 6px", margin: "11px 0 9px" }}>
        <KnotDiagram step={i} total={steps.length} />
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <span style={{
          background: "var(--deep)", color: "#fff", width: 21, height: 21, borderRadius: 11,
          fontSize: 12, display: "grid", placeItems: "center", flexShrink: 0, fontWeight: 600
        }}>{i + 1}</span>
        <span className="small" style={{ flex: 1 }}>{steps[i]}</span>
      </div>
      <div className="row" style={{ marginTop: 11 }}>
        <button className="btn sm ghost" disabled={i === 0} onClick={() => setI(i - 1)}
          style={{ opacity: i === 0 ? .4 : 1 }}>Back</button>
        <button className="btn sm" disabled={i >= steps.length - 1} onClick={() => setI(i + 1)}
          style={{ opacity: i >= steps.length - 1 ? .4 : 1 }}>Next step</button>
        <span className="tiny muted num" style={{ marginLeft: "auto" }}>{i + 1} of {steps.length}</span>
      </div>
      {k.fail && <div className="tiny" style={{ marginTop: 11, paddingTop: 9, borderTop: "1px solid var(--line2)", color: "var(--rust)" }}>
        {k.fail}
      </div>}
    </div>
  );
}

function LearnScreen({ tips, knots, onAddTip, onDeleteTip, onAddKnot, onDeleteKnot }) {
  const [tab, setTab] = useState("knots");
  const cats = [...new Set(tips.map(t => t.cat))];
  const today = new Date();
  const regRows = [
    ["Largemouth & smallmouth bass", "bass"], ["Walleye & sauger", "walleye"],
    ["Northern pike", "pike"], ["Muskellunge", "musky"], ["Channel catfish", "catfish"],
    ["Yellow perch", "perch"], ["Crappie", "crappie"], ["Sunfish", "sunfish"],
    ["Rainbow, brown & brook trout", "trout"], ["Carp, drum, sucker, bullhead", "none"],
    ["Lake sturgeon", "shut"],
  ];
  return (
    <>
      <div className="hdr">
        <div className="kick">Skills, rules and reference</div>
        <h1 style={{ marginTop: 3 }}>Resources</h1>
      </div>
      <div className="pad" style={{ paddingTop: 14 }}>
        <div className="segbar">
          <button className={tab === "knots" ? "on" : ""} onClick={() => setTab("knots")}>Knots</button>
          <button className={tab === "tips" ? "on" : ""} onClick={() => setTab("tips")}>Tips</button>
          <button className={tab === "regs" ? "on" : ""} onClick={() => setTab("regs")}>Rules</button>
        </div>

        {tab === "knots" && (
          <div className="stack" style={{ marginTop: 14 }}>
            <p className="small muted" style={{ margin: 0 }}>
              Wet every knot before you pull it tight. A dry knot burns the line and fails at half its strength.
            </p>
            {knots.map(k => <KnotCard key={k.id} k={k} onDelete={k.custom ? () => onDeleteKnot(k.id) : null} />)}
            <button className="btn ghost" onClick={onAddKnot}>Add a knot</button>
          </div>
        )}

        {tab === "tips" && (
          <div style={{ marginTop: 14 }}>
            {cats.map(c => (
              <div key={c}>
                <div className="divlabel">{c}</div>
                <div className="stack">
                  {tips.filter(t => t.cat === c).map(t => (
                    <div key={t.id} className="card">
                      <div className="between">
                        <h3 style={{ fontSize: 16.5 }}>{t.title}</h3>
                        {t.custom && <button className="tiny" style={{ color: "var(--rust)" }}
                          onClick={() => onDeleteTip(t.id)}>Delete</button>}
                      </div>
                      <p className="small" style={{ margin: "6px 0 0" }}>{t.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button className="btn ghost" style={{ marginTop: 18 }} onClick={onAddTip}>Add your own tip</button>
          </div>
        )}

        {tab === "regs" && (
          <div className="stack" style={{ marginTop: 14 }}>
            <div className="card">
              <h3 style={{ marginBottom: 8 }}>Seasons and limits, Zone 16</h3>
              <table className="tbl">
                <thead><tr><th>Species</th><th>Season</th><th>Limit</th></tr></thead>
                <tbody>
                  {regRows.map(([label, key]) => {
                    const s = SEASONS[key], open = isOpenOn(key, today);
                    return (
                      <tr key={label}>
                        <td style={{ fontWeight: 500 }}>{label}
                          <div><span className={"chip " + (open ? "open" : "shut")} style={{ marginTop: 4 }}>
                            {open ? "Open today" : "Closed today"}</span></div></td>
                        <td className="small">{s.label}</td>
                        <td className="small">{s.limit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="tiny muted" style={{ marginTop: 10 }}>
                S = sport licence, C = conservation licence. Waterbody exceptions override these.
              </p>
            </div>
            <div className="card flat">
              <h3 style={{ fontSize: 16.5, marginBottom: 6 }}>Local exceptions that matter</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }} className="stack small">
                <li>The Thames main branch in Middlesex County is open all year for Atlantic salmon, brown trout, Pacific salmon and rainbow trout, with zone-wide limits applying.</li>
                <li>The North Thames main branch in Middlesex County is open all year for brown and rainbow trout at S-5 and C-2.</li>
                <li>The Thames fish sanctuary — no fishing March 15 to the Friday before the second Saturday in May — runs between the Pittock dam and Highway 59 near Woodstock, not in London.</li>
                <li>Warmouth is endangered and may not be caught or possessed under a recreational fishing licence.</li>
              </ul>
            </div>
            <div className="card flat">
              <h3 style={{ fontSize: 16.5, marginBottom: 6 }}>Licence, 2026</h3>
              <table className="tbl">
                <tbody>
                  <tr><td>Outdoors Card, 3 years</td><td className="num">$8.57</td></tr>
                  <tr><td>1-year sport, Ontario resident</td><td className="num">$26.57</td></tr>
                  <tr><td>1-year conservation, Ontario resident</td><td className="num">$15.07</td></tr>
                  <tr><td>1-day sport — no card needed</td><td className="num">$12.21</td></tr>
                </tbody>
              </table>
              <p className="tiny muted" style={{ marginTop: 8 }}>
                Before HST. Anglers 18 to 64 need a licence. Buy at huntandfishontario.com or ServiceOntario, 100 Dundas St.
              </p>
            </div>
            <div className="card flat">
              <h3 style={{ fontSize: 16.5, marginBottom: 6 }}>Local shops and services</h3>
              <div className="stack small">
                <div><strong>Angling Sports</strong>, 681 Highbury Ave N — full live bait counter, open seven days</div>
                <div><strong>Forest City Fly Shop</strong>, 96 Rectory St — closed Sunday and Monday, bring cash</div>
                <div><strong>Lambeth Rod and Tackle</strong>, 2404 Main St</div>
                <div><strong>UTRCA river levels</strong> — thamesriver.on.ca</div>
                <div><strong>Report a poacher</strong> — 1-877-847-7667</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ============================ SCREENS: LOG ============================ */

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowHM = () => new Date().toTimeString().slice(0, 5);
const hoursBetween = (a, b) => {
  if (!a || !b) return 0;
  const [ah, am] = a.split(":").map(Number), [bh, bm] = b.split(":").map(Number);
  let d = (bh * 60 + bm) - (ah * 60 + am);
  if (d < 0) d += 1440;
  return d / 60;
};

function TripForm({ trip, prefillSpotId, spots, onSave, onClose, onDelete }) {
  const [f, setF] = useState(trip || {
    id: uid(), date: todayISO(), spotId: prefillSpotId || spots[0]?.id || "", start: nowHM(), end: "",
    sky: "Part cloud", wind: "Light", airTemp: "", clarity: "Slight stain", level: "Normal",
    waterTemp: "", moon: "", notes: "",
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Sheet title={trip ? "Edit trip" : "New trip"} onClose={onClose}
      action={<button className="btn sm" onClick={() => onSave(f)}>Save</button>}>
      <div className="stack">
        <Field label="Where"><select value={f.spotId} onChange={e => set("spotId", e.target.value)}>
          {spots.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></Field>
        <div className="row">
          <Field label="Date"><input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
        </div>
        <div className="row">
          <div style={{ flex: 1 }}><Field label="Started"><input type="time" value={f.start} onChange={e => set("start", e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Finished"><input type="time" value={f.end} onChange={e => set("end", e.target.value)} /></Field></div>
        </div>
        <div className="divlabel">Conditions</div>
        <Field label="Sky"><Choice options={CONDITIONS.sky} value={f.sky} onChange={v => set("sky", v)} /></Field>
        <Field label="Wind"><Choice options={CONDITIONS.wind} value={f.wind} onChange={v => set("wind", v)} /></Field>
        <Field label="Water clarity"><Choice options={CONDITIONS.clarity} value={f.clarity} onChange={v => set("clarity", v)} /></Field>
        <Field label="River or pond level"><Choice options={CONDITIONS.level} value={f.level} onChange={v => set("level", v)} /></Field>
        <div className="row">
          <div style={{ flex: 1 }}><Field label="Air °C"><input type="number" value={f.airTemp} onChange={e => set("airTemp", e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Water °C"><input type="number" value={f.waterTemp} onChange={e => set("waterTemp", e.target.value)} /></Field></div>
        </div>
        <Field label="Notes" hint="What you tried, what the water looked like, what you would do differently.">
          <textarea value={f.notes} onChange={e => set("notes", e.target.value)} />
        </Field>
        <button className="btn" onClick={() => onSave(f)}>{trip ? "Save changes" : "Start this trip"}</button>
        {trip && <button className="btn danger" onClick={() => onDelete(trip.id)}>Delete trip and its catches</button>}
      </div>
    </Sheet>
  );
}

function CatchForm({ item, prefillTripId, trips, allSpecies, allBaits, spots, onSave, onClose, onDelete }) {
  const [f, setF] = useState(item || {
    id: uid(), tripId: prefillTripId || trips[0]?.id || "", speciesId: "", length: "", weight: "",
    date: todayISO(), time: nowHM(), baitId: "", hook: "", depth: "", released: true,
    photo: "", photoId: "", notes: "",
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const sp = allSpecies.find(s => s.id === f.speciesId);
  const suggested = sp ? (sp.baits || []).map(id => allBaits.find(b => b.id === id)).filter(Boolean) : allBaits;
  const chosenBait = allBaits.find(b => b.id === f.baitId);
  const today = new Date();
  const legal = sp ? isOpenOn(sp.season, new Date(f.date + "T12:00:00")) : true;

  return (
    <Sheet title={item ? "Edit catch" : "Log a catch"} onClose={onClose}
      action={<button className="btn sm" onClick={() => onSave(f)} disabled={!f.speciesId}
        style={{ opacity: f.speciesId ? 1 : .4 }}>Save</button>}>
      <div className="stack">
        <Field label="What did you catch">
          <select value={f.speciesId} onChange={e => set("speciesId", e.target.value)}>
            <option value="">Choose a species</option>
            {allSpecies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        {sp && !legal && (
          <div className="card" style={{ borderLeft: "3px solid var(--rust)" }}>
            <div className="small" style={{ color: "var(--rust)" }}>
              {sp.name} is out of season on that date in Zone 16 — {SEASONS[sp.season]?.label}. Release it and log it as released.
            </div>
          </div>
        )}
        {sp && <div className="card" style={{ padding: 0, overflow: "hidden", background: "#CBD4C6" }}><Fish sp={sp} h={78} /></div>}

        <div className="row">
          <div style={{ flex: 1 }}><Field label="Length (in)"><input type="number" step="0.25" value={f.length} onChange={e => set("length", e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Weight (lb)"><input type="number" step="0.1" value={f.weight} onChange={e => set("weight", e.target.value)} /></Field></div>
        </div>
        <div className="row">
          <div style={{ flex: 1 }}><Field label="Date"><input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Time"><input type="time" value={f.time} onChange={e => set("time", e.target.value)} /></Field></div>
        </div>

        <Field label="Trip" hint="Leave on 'No trip' for a quick one-off catch.">
          <select value={f.tripId} onChange={e => set("tripId", e.target.value)}>
            <option value="">No trip</option>
            {trips.map(t => {
              const s = spots.find(x => x.id === t.spotId);
              return <option key={t.id} value={t.id}>{t.date} · {s ? s.name : "Unknown"}</option>;
            })}
          </select>
        </Field>

        <Field label="Bait or lure" hint={sp ? `Showing what usually works for ${sp.name.toLowerCase()} first.` : undefined}>
          <select value={f.baitId} onChange={e => set("baitId", e.target.value)}>
            <option value="">Not recorded</option>
            <optgroup label={sp ? "Usual for this species" : "All"}>
              {suggested.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </optgroup>
            <optgroup label="Everything else">
              {allBaits.filter(b => !suggested.includes(b)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </optgroup>
          </select>
        </Field>
        {chosenBait && (
          <div className="card flat" style={{ padding: 0, overflow: "hidden", marginTop: -4 }}>
            <div style={{ background: "#CBD4C6" }}><BaitArt b={chosenBait} h={64} /></div>
            <div className="tiny muted" style={{ padding: "8px 11px" }}>Usual hook — {chosenBait.hook}</div>
          </div>
        )}

        <Field label="Hook and rig you actually used"><input value={f.hook} onChange={e => set("hook", e.target.value)}
          placeholder="e.g. 1/0 tube jig head, 8 lb fluoro leader" /></Field>
        <div className="row">
          <div style={{ flex: 1 }}><Field label="Depth (ft)"><input type="number" step="0.5" value={f.depth} onChange={e => set("depth", e.target.value)} /></Field></div>
        </div>
        <Field label="Kept or released">
          <Choice options={[{ v: true, l: "Released" }, { v: false, l: "Kept" }]}
            value={f.released} onChange={v => set("released", v)} />
        </Field>
        <div className="divlabel">Photo</div>
        <PhotoCapture value={f.photoId} onChange={(id) => set("photoId", id)} />
        <Field label="Or paste a photo link" hint="Optional — if the picture already lives somewhere online.">
          <input value={f.photo} onChange={e => set("photo", e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Notes"><textarea value={f.notes} onChange={e => set("notes", e.target.value)} /></Field>
        <button className="btn" disabled={!f.speciesId} style={{ opacity: f.speciesId ? 1 : .4 }}
          onClick={() => onSave(f)}>{item ? "Save changes" : "Log this catch"}</button>
        {item && <button className="btn danger" onClick={() => onDelete(item.id)}>Delete this catch</button>}
      </div>
    </Sheet>
  );
}

function LogScreen({ log, spots, allSpecies, allBaits, sync, onSync, onNewTrip, onEditTrip, onNewCatch, onEditCatch }) {
  const trips = [...log.trips].sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  const loose = log.catches.filter(c => !c.tripId || !log.trips.find(t => t.id === c.tripId));
  const nm = (arr, id) => arr.find(x => x.id === id)?.name;
  return (
    <>
      <div className="hdr">
        <div className="between">
          <div>
            <div className="kick">Your season</div>
            <h1 style={{ marginTop: 3 }}>Log</h1>
          </div>
          <button className="small" style={{ color: "var(--deep)" }} onClick={onSync}>
            {sync?.url ? (sync.lastSync ? "Synced" : "Sync") : "Connect Sheets"}
          </button>
        </div>
      </div>
      <div className="pad" style={{ paddingTop: 14 }}>
        <div className="row">
          <button className="btn" onClick={onNewTrip}>New trip</button>
          <button className="btn brass" onClick={() => onNewCatch(null)}>Log a catch</button>
        </div>

        {!trips.length && !loose.length && (
          <div className="card" style={{ marginTop: 16, textAlign: "center", padding: "26px 18px" }}>
            <h3>Nothing logged yet</h3>
            <p className="small muted" style={{ margin: "8px 0 0" }}>
              Start a trip when you get to the water, then log each fish as you catch it.
              Once you have a few sessions in, Stats will start showing you which baits and
              conditions are actually working for you.
            </p>
          </div>
        )}

        {trips.map(t => {
          const spot = spots.find(s => s.id === t.spotId);
          const cs = log.catches.filter(c => c.tripId === t.id);
          const hrs = hoursBetween(t.start, t.end);
          return (
            <div key={t.id} style={{ marginTop: 16 }}>
              <div className="card" style={{ borderLeft: "3px solid var(--deep)" }}>
                <div className="between">
                  <h3 style={{ fontSize: 17 }}>{spot ? spot.name : "Unknown spot"}</h3>
                  <button className="tiny" style={{ color: "var(--deep)" }} onClick={() => onEditTrip(t)}>Edit</button>
                </div>
                <div className="tiny muted" style={{ marginTop: 3 }}>
                  {t.date} · {t.start}{t.end ? `–${t.end}` : ""}{hrs ? ` · ${hrs.toFixed(1)} h` : ""}
                </div>
                <div className="wrap" style={{ marginTop: 8 }}>
                  <span className="chip">{t.sky}</span><span className="chip">Wind {t.wind.toLowerCase()}</span>
                  <span className="chip">{t.clarity}</span><span className="chip">Level {t.level.toLowerCase()}</span>
                  {t.airTemp && <span className="chip num">{t.airTemp}°C air</span>}
                  {t.waterTemp && <span className="chip num">{t.waterTemp}°C water</span>}
                </div>
                {t.notes && <p className="small" style={{ margin: "10px 0 0" }}>{t.notes}</p>}
                <div className="tiny muted" style={{ marginTop: 10 }}>
                  {cs.length ? `${cs.length} fish` : "No fish logged"}
                </div>
                {cs.length > 0 && (
                  <div className="stack" style={{ marginTop: 8 }}>
                    {cs.map(c => {
                      const pic = !!(c.photoId || c.photo);
                      return (
                      <button key={c.id} className="listbtn" style={{ padding: pic ? 0 : "9px 11px", overflow: "hidden" }} onClick={() => onEditCatch(c)}>
                        {c.photoId
                          ? <CatchPhoto photoId={c.photoId} height={150} />
                          : c.photo && <CatchLinkPhoto url={c.photo} height={150} />}
                        <div className="between" style={pic ? { padding: "9px 11px 0" } : undefined}>
                          <span className="small" style={{ fontWeight: 500 }}>{nm(allSpecies, c.speciesId) || "Fish"}</span>
                          <span className="tiny num muted">
                            {c.length ? `${c.length}"` : ""}{c.weight ? ` · ${c.weight} lb` : ""} · {c.time}
                          </span>
                        </div>
                        {c.baitId && <div className="tiny muted" style={{ marginTop: 2, padding: pic ? "0 11px 9px" : 0 }}>{nm(allBaits, c.baitId)}</div>}
                      </button>
                      );
                    })}
                  </div>
                )}
                <button className="btn ghost sm" style={{ marginTop: 11, width: "100%" }}
                  onClick={() => onNewCatch(t.id)}>Add a fish to this trip</button>
              </div>
            </div>
          );
        })}

        {loose.length > 0 && <>
          <div className="divlabel">Catches without a trip</div>
          <div className="stack">
            {loose.map(c => (
              <button key={c.id} className="listbtn" onClick={() => onEditCatch(c)}>
                <div className="between">
                  <span style={{ fontWeight: 500 }}>{nm(allSpecies, c.speciesId) || "Fish"}</span>
                  <span className="tiny num muted">{c.date} · {c.time}</span>
                </div>
                <div className="tiny muted" style={{ marginTop: 3 }}>
                  {c.length ? `${c.length} in` : "no measurement"}{c.baitId ? ` · ${nm(allBaits, c.baitId)}` : ""}
                </div>
              </button>
            ))}
          </div>
        </>}
      </div>
    </>
  );
}

/* ============================ SCREENS: STATS ============================ */

function StatsScreen({ log, spots, allSpecies, allBaits }) {
  const { trips, catches } = log;
  const nm = (arr, id) => arr.find(x => x.id === id)?.name || "Not recorded";
  const hours = trips.reduce((s, t) => s + hoursBetween(t.start, t.end), 0);
  const bySpecies = useMemo(() => {
    const m = {}; catches.forEach(c => { const n = nm(allSpecies, c.speciesId); m[n] = (m[n] || 0) + 1; });
    return Object.entries(m).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  }, [catches, allSpecies]);
  const bySpot = useMemo(() => {
    const m = {};
    catches.forEach(c => {
      const t = trips.find(x => x.id === c.tripId);
      const n = t ? nm(spots, t.spotId) : "No trip recorded";
      m[n] = (m[n] || 0) + 1;
    });
    return Object.entries(m).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  }, [catches, trips, spots]);
  const byBait = useMemo(() => {
    const m = {}; catches.forEach(c => { if (c.baitId) { const n = nm(allBaits, c.baitId); m[n] = (m[n] || 0) + 1; } });
    return Object.entries(m).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v).slice(0, 8);
  }, [catches, allBaits]);
  const byMonth = useMemo(() => {
    const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const m = {}; catches.forEach(c => { const i = Number((c.date || "").slice(5, 7)) - 1; if (i >= 0) m[M[i]] = (m[M[i]] || 0) + 1; });
    return M.filter(x => m[x]).map(k => ({ k, v: m[k] }));
  }, [catches]);
  const byCondition = useMemo(() => {
    const m = {};
    catches.forEach(c => {
      const t = trips.find(x => x.id === c.tripId);
      if (t?.clarity) m[t.clarity] = (m[t.clarity] || 0) + 1;
    });
    return Object.entries(m).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  }, [catches, trips]);
  const bests = useMemo(() => {
    const m = {};
    catches.forEach(c => {
      if (!c.length) return;
      const n = nm(allSpecies, c.speciesId);
      if (!m[n] || Number(c.length) > Number(m[n].length)) m[n] = c;
    });
    return Object.entries(m).sort((a, b) => Number(b[1].length) - Number(a[1].length));
  }, [catches, allSpecies]);

  const kept = catches.filter(c => c.released === false).length;
  const stat = (v, l) => (
    <div className="card" style={{ padding: "13px 12px" }}>
      <div className="num serif" style={{ fontSize: 27, lineHeight: 1.05 }}>{v}</div>
      <div className="tiny muted" style={{ marginTop: 3 }}>{l}</div>
    </div>
  );

  return (
    <>
      <div className="hdr">
        <div className="kick">Everything you have logged</div>
        <h1 style={{ marginTop: 3 }}>Stats</h1>
      </div>
      <div className="pad" style={{ paddingTop: 16 }}>
        {!catches.length && !trips.length ? (
          <div className="card" style={{ textAlign: "center", padding: "26px 18px" }}>
            <h3>No numbers yet</h3>
            <p className="small muted" style={{ margin: "8px 0 0" }}>
              Log a trip and a few fish and this page fills in — which spot produces, which bait
              earns its place in the box, and what water clarity actually gets you bites.
            </p>
          </div>
        ) : (
          <div className="stack">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9 }}>
              {stat(trips.length, "Trips")}
              {stat(catches.length, "Fish")}
              {stat(hours ? hours.toFixed(0) : "—", "Hours on the bank")}
              {stat(bySpecies.length, "Species")}
              {stat(hours ? (catches.length / hours).toFixed(2) : "—", "Fish per hour")}
              {stat(kept, "Kept")}
            </div>

            <div className="divlabel">Personal bests</div>
            {bests.length ? (
              <div className="card stack">
                {bests.map(([n, c]) => (
                  <div key={n} className="between">
                    <span className="small">{n}</span>
                    <span className="small num">
                      {c.length}"{c.weight ? ` · ${c.weight} lb` : ""} <span className="muted">{c.date}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : <p className="muted small">Record a length on a catch and your bests will appear here.</p>}

            <div className="divlabel">Fish by species</div>
            <BarList data={bySpecies} />

            <div className="divlabel">Fish by spot</div>
            <BarList data={bySpot} accent="var(--deep2)" />

            <div className="divlabel">What is actually catching them</div>
            <BarList data={byBait} accent="var(--brass)" />

            <div className="divlabel">By month</div>
            <BarList data={byMonth} accent="var(--moss)" />

            {byCondition.length > 0 && <>
              <div className="divlabel">By water clarity</div>
              <BarList data={byCondition} accent="var(--deep2)" />
              <p className="tiny muted">
                Enough sessions here and this chart tells you something real: most London anglers
                find stained water outfishes gin-clear water on the Thames.
              </p>
            </>}
          </div>
        )}
      </div>
    </>
  );
}

/* ============================ GUIDED ADD WIZARDS ============================ */

function Wizard({ title, steps, onDone, onClose, intro }) {
  const [i, setI] = useState(-1);
  const [data, setData] = useState({});
  const set = (k, v) => setData(p => ({ ...p, [k]: v }));
  const step = steps[i];
  const ok = !step || !step.required || (data[step.key] !== undefined && String(data[step.key]).trim() !== "");
  const last = i === steps.length - 1;

  return (
    <Sheet title={title} onClose={onClose}>
      {i < 0 ? (
        <div className="stack">
          <p className="prose" style={{ margin: 0 }}>{intro}</p>
          <div className="card flat">
            <div className="tiny muted" style={{ marginBottom: 7 }}>You will be asked about</div>
            <ol style={{ margin: 0, paddingLeft: 18 }} className="stack small">
              {steps.map(s => <li key={s.key}>{s.q}</li>)}
            </ol>
          </div>
          <button className="btn" onClick={() => setI(0)}>Start</button>
        </div>
      ) : (
        <div className="stack">
          <div className="tiny muted num">Step {i + 1} of {steps.length}</div>
          <div style={{ height: 3, background: "var(--line2)", borderRadius: 2 }}>
            <div style={{ width: `${((i + 1) / steps.length) * 100}%`, height: "100%", background: "var(--brass)", borderRadius: 2 }} />
          </div>
          <h3 style={{ marginTop: 6 }}>{step.q}</h3>
          {step.help && <p className="small muted" style={{ margin: 0 }}>{step.help}</p>}

          {step.type === "text" && <input autoFocus value={data[step.key] || ""} onChange={e => set(step.key, e.target.value)} placeholder={step.ph} />}
          {step.type === "long" && <textarea autoFocus value={data[step.key] || ""} onChange={e => set(step.key, e.target.value)} placeholder={step.ph} />}
          {step.type === "list" && (
            <>
              <textarea autoFocus value={data[step.key] || ""} onChange={e => set(step.key, e.target.value)} placeholder={step.ph} />
              <div className="tiny muted">One per line.</div>
            </>
          )}
          {step.type === "choice" && <Choice options={step.options} value={data[step.key]} onChange={v => set(step.key, v)} />}
          {step.type === "multi" && <Choice options={step.options} value={data[step.key] || []} onChange={v => set(step.key, v)} multi />}
          {step.type === "scale" && (
            <Choice options={[1, 2, 3, 4, 5].map(n => ({ v: n, l: step.labels?.[n - 1] || String(n) }))}
              value={data[step.key]} onChange={v => set(step.key, v)} />
          )}

          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn ghost" onClick={() => (i === 0 ? setI(-1) : setI(i - 1))}>Back</button>
            <button className="btn" disabled={!ok} style={{ opacity: ok ? 1 : .4 }}
              onClick={() => (last ? onDone(data) : setI(i + 1))}>{last ? "Save" : "Next"}</button>
          </div>
          {!step.required && <button className="tiny muted" style={{ textAlign: "center", width: "100%" }}
            onClick={() => (last ? onDone(data) : setI(i + 1))}>Skip this one</button>}
        </div>
      )}
    </Sheet>
  );
}

const lines = (s) => (s || "").split("\n").map(x => x.trim()).filter(Boolean);

function AddSpotWizard({ allSpecies, onDone, onClose }) {
  const steps = [
    { key: "name", q: "What do you call this spot?", type: "text", required: true, ph: "e.g. The bend below the trestle" },
    { key: "area", q: "Roughly where is it?", type: "text", ph: "e.g. East end, off Hamilton Rd" },
    { key: "water", q: "What kind of water?", type: "choice", required: true,
      options: ["Thames — main branch", "Thames — north branch", "Thames — south branch", "Still water — pond", "Reservoir", "Creek"] },
    { key: "blurb", q: "Describe it in a sentence or two", type: "long", help: "What you would tell a friend who had never been.", ph: "Slow deep water on the outside of the bend, gravel on the inside…" },
    { key: "maxDepth", q: "How deep does it get, roughly?", type: "choice",
      options: [{ v: 3, l: "Under 3 ft" }, { v: 6, l: "3–6 ft" }, { v: 10, l: "6–10 ft" }, { v: 18, l: "10–20 ft" }, { v: 30, l: "Over 20 ft" }] },
    { key: "shape", q: "What does the bottom do as you go out?", type: "choice",
      options: [{ v: "gradual", l: "Shelves out gradually" }, { v: "steep", l: "Drops off fast" }, { v: "flat", l: "Shallow and flat" }, { v: "bowl", l: "Deep bowl in the middle" }] },
    { key: "hot", q: "Where do the fish actually sit?", type: "list", help: "The specific bits that hold fish.", ph: "Boulder seam by the willow\nDeep hole under the far bank" },
    { key: "species", q: "What have you caught here?", type: "multi", options: allSpecies.map(s => ({ v: s.id, l: s.name })) },
    { key: "parking", q: "How is the parking?", type: "scale", labels: ["None", "Rough", "OK", "Good", "Lot at the water"] },
    { key: "walk", q: "How far to the water?", type: "scale", labels: ["Long hike", "10+ min", "5 min", "2 min", "Park and cast"] },
    { key: "footing", q: "What is the bank like underfoot?", type: "scale", labels: ["Treacherous", "Awkward", "Manageable", "Solid", "Flat and firm"] },
    { key: "amenities", q: "Washrooms and facilities?", type: "scale", labels: ["Nothing", "Bins only", "Portable toilet", "Washrooms", "Full facilities"] },
    { key: "cost", q: "Does it cost anything?", type: "scale", labels: ["Expensive", "Notable fee", "Small fee", "Paid parking", "Free"] },
    { key: "hazards", q: "Anything to watch out for?", type: "long", ph: "Soft mud after rain, steep descent at the north end…" },
    { key: "best", q: "When is it best?", type: "multi",
      options: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => ({ v: i + 1, l: m })) },
    { key: "tip", q: "One thing you would tell someone fishing it first time", type: "long", ph: "Fish the far seam, not the near slack." },
    { key: "coords", q: "Coordinates, if you have them", type: "text",
      help: "Long-press the spot in Google Maps and copy what it shows. This unlocks sunrise, feeding windows, weather and river gauges for this spot.",
      ph: "42.9584, -81.3222" },
  ];
  const build = (d) => {
    const max = d.maxDepth || 8;
    const shapes = {
      gradual: [0, .15, .3, .5, .7, .9, 1, .85, .6, .35, .15, 0],
      steep: [0, .4, .8, 1, .95, .9, .85, .7, .45, .2, .05, 0],
      flat: [0, .3, .5, .6, .65, .7, .7, .65, .55, .35, .15, 0],
      bowl: [0, .1, .25, .5, .8, 1, 1, .9, .6, .3, .1, 0],
    };
    const prof = (shapes[d.shape] || shapes.gradual).map(f => Math.round(f * max * 10) / 10);
    const hotLines = lines(d.hot);
    const idxs = [3, 6, 9];
    let ll = null;
    if (typeof d.coords === "string" && d.coords.trim()) {
      const m = d.coords.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
      if (m) {
        const la = parseFloat(m[1]), lo = parseFloat(m[2]);
        if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) ll = [la, lo];
      }
    }
    return {
      id: uid(), custom: true, _v: SCHEMA_VERSION, updatedAt: Date.now(),
      name: d.name, area: d.area || "Custom", water: d.water || "Thames — main branch",
      addr: "", ll, hydroStation: "", blurb: d.blurb || "",
      depth: prof,
      hot: hotLines.length ? hotLines.slice(0, 3).map((n, i) => ({ i: idxs[i], n })) : [{ i: 6, n: "Deepest water" }],
      density: Object.fromEntries((d.species || []).map(s => [s, 4])),
      access: { parking: d.parking || 3, walk: d.walk || 3, footing: d.footing || 3, amenities: d.amenities || 2, cost: d.cost || 5 },
      accessNote: "Your own notes on getting in.", bank: "As you described it",
      hazards: d.hazards || "", best: d.best || [], tip: d.tip || "",
    };
  };
  return <Wizard title="Add a spot" steps={steps} onClose={onClose} onDone={(d) => onDone(build(d))}
    intro="Add a place you fish that is not already in here. Answer what you know and skip the rest — the app will draw a depth profile and work out an access rating from your answers." />;
}

function AddSpeciesWizard({ onDone, onClose }) {
  const steps = [
    { key: "name", q: "What is the fish called?", type: "text", required: true, ph: "e.g. Bowfin" },
    { key: "sci", q: "Scientific name, if you know it", type: "text", ph: "Amia calva" },
    { key: "idKey", q: "How do you tell it apart on the bank?", type: "list", ph: "Long dorsal fin down the whole back\nBony plate under the jaw" },
    { key: "vs", q: "What is it most often mistaken for?", type: "text", ph: "Northern pike — but the dorsal fin runs the whole length" },
    { key: "habits", q: "What are its habits?", type: "long", ph: "Where it sits, what it eats, when it feeds…" },
    { key: "target", q: "How do you target it?", type: "list", ph: "Fish slow near weed edges\nUse a heavy leader" },
    { key: "season", q: "What season applies in Zone 16?", type: "choice",
      options: [{ v: "none", l: "Open all year" }, { v: "bass", l: "Bass season" }, { v: "walleye", l: "Walleye season" },
      { v: "pike", l: "Pike season" }, { v: "sunfish", l: "Sunfish" }, { v: "crappie", l: "Crappie" }, { v: "trout", l: "Trout" }] },
    { key: "colour", q: "What colour is it, broadly?", type: "choice",
      options: [{ v: "#7C8B6E", l: "Olive" }, { v: "#8C7B4E", l: "Bronze" }, { v: "#5C6B3A", l: "Dark green" },
      { v: "#A6B0AA", l: "Silver" }, { v: "#9A8B4B", l: "Gold" }, { v: "#6B6656", l: "Grey-brown" }] },
    { key: "marks", q: "What markings does it carry?", type: "choice",
      options: [{ v: "", l: "Plain" }, { v: "vbars", l: "Vertical bars" }, { v: "stripe", l: "Side stripe" },
      { v: "hstripes", l: "Horizontal stripes" }, { v: "spots", l: "Dark spots" }, { v: "beans", l: "Light spots" },
      { v: "speckle", l: "Speckled" }, { v: "scales", l: "Big scales" }] },
  ];
  return <Wizard title="Add a species" steps={steps} onClose={onClose}
    intro="Add a fish the guide does not cover yet. The app draws a rough profile from the colour and markings you pick, and you can replace it with a real photo afterwards."
    onDone={(d) => onDone({
      id: uid(), custom: true, _v: SCHEMA_VERSION, updatedAt: Date.now(), name: d.name, sci: d.sci || "", season: d.season || "none",
      art: { body: d.colour || "#7C8B6E", back: "#3E4A34", belly: "#EDEBDD", marks: d.marks || "" },
      idKey: lines(d.idKey), vs: d.vs || "", habits: d.habits || "", target: lines(d.target),
      baits: [], where: [], size: "",
    })} />;
}

function AddBaitWizard({ allSpecies, onDone, onClose }) {
  const steps = [
    { key: "name", q: "What is it called?", type: "text", required: true, ph: "e.g. Ned rig" },
    { key: "kind", q: "What type is it?", type: "choice", required: true,
      options: ["Soft plastic", "Hard bait", "Topwater", "Wire bait", "Hardware", "Live bait", "Bait", "Live bait rig", "Fly"] },
    { key: "sizes", q: "What size and weight do you use?", type: "text", ph: "2.75 in on a 1/10 oz head" },
    { key: "colours", q: "Which colours work around here?", type: "text", ph: "Green pumpkin, coffee" },
    { key: "targets", q: "What does it catch?", type: "multi", options: allSpecies.map(s => ({ v: s.id, l: s.name })) },
    { key: "hook", q: "What hook goes with it?", type: "text", required: true, ph: "Size 1 mushroom jig head" },
    { key: "rig", q: "How is it rigged?", type: "text", ph: "Glued to a mushroom head, nothing else" },
    { key: "float", q: "Float, weight, or neither?", type: "text", ph: "No float — you need bottom contact" },
    { key: "how", q: "How do you fish it?", type: "long", ph: "Cast, let it fall on slack line, drag it an inch at a time…" },
    { key: "when", q: "When does it come out of the box?", type: "long", ph: "Bright cold days when nothing is chasing." },
  ];
  return <Wizard title="Add a bait or lure" steps={steps} onClose={onClose}
    intro="Add something you fish that is not in the encyclopedia. Once it is saved you can pick it when logging a catch, and it will show up in your bait stats."
    onDone={(d) => onDone({
      id: uid(), custom: true, _v: SCHEMA_VERSION, updatedAt: Date.now(), name: d.name, kind: d.kind, sizes: d.sizes || "", colours: d.colours || "",
      targets: d.targets || [], hook: d.hook, rig: d.rig || "", float: d.float || "", how: d.how || "", when: d.when || "",
    })} />;
}

function AddTipWizard({ onDone, onClose }) {
  const steps = [
    { key: "cat", q: "What is this about?", type: "choice", required: true,
      options: ["Reading water", "Conditions", "Handling", "Rules", "Safety", "Gear", "Getting started"] },
    { key: "title", q: "Sum it up in a short line", type: "text", required: true, ph: "Fish the shade line in August" },
    { key: "body", q: "Now explain it", type: "long", required: true, ph: "Once the sun is high the fish sit under the far bank trees…" },
  ];
  return <Wizard title="Add a tip" steps={steps} onClose={onClose}
    intro="Something you learned the hard way. It gets filed alongside the built-in tips so you find it again next season."
    onDone={(d) => onDone({ id: uid(), custom: true, _v: SCHEMA_VERSION, updatedAt: Date.now(), cat: d.cat, title: d.title, body: d.body })} />;
}


/* ============================ GOOGLE SHEETS SYNC ============================ */
/* Talks to an Apps Script web app. Content-Type is text/plain deliberately —
   it keeps the request "simple" so the browser skips the CORS preflight that
   Apps Script cannot answer. */

/* This is the ONE sanctioned fetch outside services.js and gdrive.js. Sheets
   sync predates that rule and is a separate, optional system (see the skill's
   invariant #2). It throws rather than returning { ok } because every caller
   already wraps it in try/catch — but it still needs the timeout every other
   request in the app has, or a hung Apps Script call leaves the Sync panel
   spinning with no way out. Apps Script redirects to a googleusercontent.com
   host, which can be slow, so this is looser than the 9s in services.js. */
const SYNC_TIMEOUT_MS = 30000;

async function callSync(url, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SYNC_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: ctl.signal,
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error("Sync timed out. Check the web app URL, or try again on a better connection.");
    }
    throw new Error("Could not reach the sync script. Check your connection and the web app URL.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Server replied ${res.status}`);
  const out = await res.json();
  if (!out.ok) throw new Error(out.error || "Sync refused");
  return out;
}

const mergeById = (a = [], b = []) => {
  const m = new Map();
  a.forEach((x) => x?.id && m.set(x.id, x));
  b.forEach((x) => {
    if (!x?.id) return;
    const have = m.get(x.id);
    if (!have || Number(x.updatedAt || 0) >= Number(have.updatedAt || 0)) m.set(x.id, x);
  });
  return [...m.values()];
};

function SyncPanel({ sync, setSync, log, catalog, applyRemote, allSpecies, allBaits, onClose }) {
  const [f, setF] = useState(sync);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Names are denormalised on the way out so the spreadsheet is readable
  // by someone who has never seen the app.
  const outbound = () => ({
    trips: log.trips,
    catches: log.catches.map((c) => ({
      ...c,
      speciesName: allSpecies.find((s) => s.id === c.speciesId)?.name || "",
      baitName: allBaits.find((b) => b.id === c.baitId)?.name || "",
    })),
    catalog,
  });

  const run = async (action) => {
    if (!f.url.trim()) { setMsg({ bad: true, t: "Add your web app URL first." }); return; }
    setBusy(action); setMsg(null);
    try {
      const out = await callSync(f.url.trim(), {
        action, token: f.token, data: action === "push" ? outbound() : undefined,
      });
      if (out.data) applyRemote(out.data);
      const next = { ...f, lastSync: Date.now(), rev: out.rev || 0 };
      setF(next); setSync(next);
      setMsg({
        t: action === "pull"
          ? "Pulled and merged. Nothing on this device was lost."
          : "Pushed and merged. Your spreadsheet is up to date.",
        url: out.sheetUrl,
      });
    } catch (e) {
      setMsg({ bad: true, t: String(e.message || e) });
    } finally { setBusy(""); }
  };

  return (
    <Sheet title="Sync with Google Sheets" onClose={onClose}
      action={<button className="btn sm" onClick={() => setSync(f)}>Save</button>}>
      <div className="stack">
        <p className="prose" style={{ margin: 0 }}>
          Your log lives on this device. Connect a Google Apps Script endpoint and it also
          lives in a Google Sheet — backed up, readable, and shared between your phone and
          laptop. Setup instructions are in SETUP.md with the app files.
        </p>

        <Field label="Web app URL"
          hint="Ends in /exec. From Deploy → New deployment → Web app in Apps Script.">
          <input value={f.url} onChange={(e) => set("url", e.target.value)}
            placeholder="https://script.google.com/macros/s/…/exec" />
        </Field>
        <Field label="Sync key"
          hint="Must match the TOKEN value at the top of your Code.gs.">
          <input value={f.token} onChange={(e) => set("token", e.target.value)} placeholder="your private string" />
        </Field>

        <div className="row">
          <button className="btn" disabled={!!busy} style={{ opacity: busy ? .5 : 1 }}
            onClick={() => run("push")}>{busy === "push" ? "Pushing…" : "Push to Sheets"}</button>
          <button className="btn ghost" disabled={!!busy} style={{ opacity: busy ? .5 : 1 }}
            onClick={() => run("pull")}>{busy === "pull" ? "Pulling…" : "Pull from Sheets"}</button>
        </div>
        <button className="btn ghost sm" style={{ width: "100%" }} disabled={!!busy}
          onClick={() => run("meta")}>Test the connection</button>

        {msg && (
          <div className="card" style={{ borderLeft: `3px solid ${msg.bad ? "var(--rust)" : "var(--moss)"}` }}>
            <div className="small" style={{ color: msg.bad ? "var(--rust)" : "var(--ink)" }}>{msg.t}</div>
            {msg.url && (
              <a className="small" href={msg.url} target="_blank" rel="noreferrer"
                style={{ color: "var(--deep)", display: "inline-block", marginTop: 6 }}>
                Open the spreadsheet
              </a>
            )}
          </div>
        )}

        <Field label="Sync automatically">
          <Choice options={[{ v: true, l: "On" }, { v: false, l: "Off" }]}
            value={f.auto} onChange={(v) => set("auto", v)} />
          <div className="tiny muted" style={{ marginTop: 6 }}>
            When on, the app pushes a few seconds after you log something, if you have signal.
            Failed pushes are harmless — it retries next time.
          </div>
        </Field>

        <div className="card flat">
          <div className="tiny muted">Last synced</div>
          <div className="small num">
            {sync.lastSync ? new Date(sync.lastSync).toLocaleString("en-CA") : "Never"}
          </div>
        </div>

        <div className="card flat">
          <h3 style={{ fontSize: 16.5, marginBottom: 6 }}>How merging works</h3>
          <p className="small" style={{ margin: 0 }}>
            Nothing is ever overwritten wholesale. Trips, catches and anything you added
            are matched by id and the newer version wins, so you can log fish offline on
            your phone while editing notes on your laptop and both survive.
          </p>
        </div>

        <div className="card flat" style={{ borderLeft: "3px solid var(--brass)" }}>
          <div className="small">
            One thing to know: a web app deployed as "Anyone" means anyone who has both your
            URL and your sync key could read your log. Keep them private. For a fishing
            diary that is a fair trade for a setup with no accounts and no server to run.
          </div>
        </div>
      </div>
    </Sheet>
  );
}


/* ============================ CONDITIONS (Tier 1 + Tier 2) ============================ */

function Stat({ label, value, sub }) {
  return (
    <div>
      <div className="tiny muted">{label}</div>
      <div className="num" style={{ fontSize: 15, fontWeight: 500 }}>{value}</div>
      {sub && <div className="tiny muted">{sub}</div>}
    </div>
  );
}

/* Everything above the dashed line is computed on-device and always
   renders. Everything below needs a connection and degrades to the
   last cached reading. */
function ConditionsPanel({ spot, env, onRefresh, onPickStation, busy }) {
  const ll = Array.isArray(spot.ll) ? spot.ll : null;
  const now = new Date();

  const astro = useMemo(() => {
    if (!ll) return null;
    try {
      const st = sunTimes(now, ll[0], ll[1]);
      const sol = solunar(now, ll[0], ll[1]);
      return { st, sol, active: activeWindow(sol, now), phase: moonPhase(now) };
    } catch (err) { console.error("astro failed", err); return null; }
  }, [spot.id, ll && ll[0], ll && ll[1], now.getDate()]);

  const w = env.weather?.[spot.id];
  const h = env.hydro?.[spot.id];
  const trend = pressureTrend(env.pressure?.[spot.id] || []);

  const score = astro ? windowScore({
    solunarState: astro.active,
    hour: now.getHours(),
    sunrise: astro.st.sunrise,
    sunset: astro.st.sunset,
    weather: w?.data ? {
      cloud: w.data.cloud, wind: w.data.wind,
      precipProb: w.data.hourly?.[now.getHours()]?.precipProb,
      pressureTrend: trend.trend,
    } : null,
  }) : null;

  if (!ll) {
    return (
      <div className="card flat">
        <div className="small muted">
          Add coordinates to this spot to get sunrise, feeding windows and live conditions.
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {score && (
        <div className="card" style={{ borderLeft: `3px solid ${
          score.score >= 75 ? "var(--moss)" : score.score >= 55 ? "var(--brass)" : "var(--line)"}` }}>
          <div className="between">
            <h3 style={{ fontSize: 17 }}>{score.label} right now</h3>
            <span className="num muted small">{score.score}/100</span>
          </div>
          {score.notes.length > 0 && (
            <div className="wrap" style={{ marginTop: 8 }}>
              {score.notes.map((n, i) => <span key={i} className="chip">{n}</span>)}
            </div>
          )}
          {!w?.data && <div className="tiny muted" style={{ marginTop: 8 }}>
            Scored from sun and moon only. Refresh conditions to factor in weather.
          </div>}
        </div>
      )}

      <div className="card">
        <div className="tiny muted" style={{ marginBottom: 9 }}>Calculated on this device — works offline</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Stat label="Sunrise" value={fmtTime(astro?.st.sunrise)} />
          <Stat label="Sunset" value={fmtTime(astro?.st.sunset)} />
          <Stat label="Moon" value={astro?.phase.name || "—"}
            sub={astro ? `${Math.round(astro.phase.illumination * 100)}% lit` : ""} />
          <Stat label="Solunar rating" value={astro ? "★".repeat(astro.sol.rating) + "☆".repeat(4 - astro.sol.rating) : "—"} />
        </div>

        {astro && (astro.sol.majors.length > 0 || astro.sol.minors.length > 0) && (
          <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--line2)" }}>
            <div className="tiny muted" style={{ marginBottom: 6 }}>Feeding windows today</div>
            <div className="stack">
              {astro.sol.majors.map((m, i) => (
                <div key={"M" + i} className="between">
                  <span className="chip brass">Major</span>
                  <span className="small num">{fmtTime(m.start)} – {fmtTime(m.end)}</span>
                </div>
              ))}
              {astro.sol.minors.map((m, i) => (
                <div key={"m" + i} className="between">
                  <span className="chip">Minor</span>
                  <span className="small num">{fmtTime(m.start)} – {fmtTime(m.end)}</span>
                </div>
              ))}
            </div>
            {astro.active && (
              <div className="small" style={{ marginTop: 9, color: "var(--moss)", fontWeight: 500 }}>
                You are inside a {astro.active} feeding window right now.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="between" style={{ marginBottom: 9 }}>
          <span className="tiny muted">Live conditions — needs a connection</span>
          <button className="tiny" style={{ color: "var(--deep)" }} disabled={busy}
            onClick={onRefresh}>{busy ? "Checking…" : "Refresh"}</button>
        </div>

        {w?.data ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Stat label="Now" value={w.data.temp != null ? `${Math.round(w.data.temp)}°C` : "—"}
                sub={describeWeather(w.data.code)} />
              <Stat label="Wind" value={w.data.wind != null ? `${Math.round(w.data.wind)} km/h` : "—"}
                sub={compassPoint(w.data.windDir)} />
              <Stat label="Pressure" value={w.data.pressure != null ? `${Math.round(w.data.pressure)} hPa` : "—"}
                sub={trend.trend !== "unknown"
                  ? `${trend.trend}${trend.change != null ? ` ${trend.change > 0 ? "+" : ""}${trend.change} over ${trend.hours}h` : ""}`
                  : `need ${Math.max(0, 2 - trend.readings)} more reading${trend.readings === 1 ? "" : "s"} for a trend`} />
              <Stat label="Cloud" value={w.data.cloud != null ? `${w.data.cloud}%` : "—"} />
            </div>
            <div className="tiny muted" style={{ marginTop: 9 }}>as of {agoLabel(w.at)}</div>
          </>
        ) : (
          <div className="small muted">
            {w?.error ? `Last attempt failed: ${w.error}. ` : ""}No weather cached for this spot yet.
          </div>
        )}

        <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--line2)" }}>
          <div className="between" style={{ marginBottom: 6 }}>
            <span className="tiny muted">River gauge</span>
            <button className="tiny" style={{ color: "var(--deep)" }} onClick={onPickStation}>
              {spot.hydroStation ? "Change gauge" : "Find a gauge"}
            </button>
          </div>
          {spot.hydroAuto && spot.hydroStation && (
            <div className="tiny muted" style={{ marginBottom: 6 }}>
              Nearest gauge picked automatically. Change it any time.
            </div>
          )}
          {h?.data ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Stat label="Water level" value={h.data.level != null ? `${h.data.level.toFixed(2)} m` : "—"} />
                <Stat label="Discharge" value={h.data.discharge != null ? `${h.data.discharge.toFixed(1)} m³/s` : "—"} />
              </div>
              {(() => {
                const fc = flowContext(h.data.discharge, (spot.water || "").includes("main branch"));
                return fc ? <div className="small" style={{ marginTop: 8 }}>{fc.note}</div> : null;
              })()}
              <div className="tiny muted" style={{ marginTop: 7 }}>
                {h.data.name || h.data.station} · as of {agoLabel(h.at)}
              </div>
            </>
          ) : (
            <div className="small muted">
              {spot.hydroStation
                ? (h?.error ? `Last attempt failed: ${h.error}.` : "No reading cached yet.")
                : "No gauge chosen. Environment Canada publishes live level and flow for stations across Canada."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StationPicker({ spot, onClose, onChoose }) {
  const [state, setState] = useState({ loading: true, list: [], error: "" });
  const [manual, setManual] = useState(spot.hydroStation || "");

  useEffect(() => {
    let alive = true;
    const ll = Array.isArray(spot.ll) ? spot.ll : null;
    if (!ll) { setState({ loading: false, list: [], error: "This spot has no coordinates saved." }); return; }
    findStations(ll[0], ll[1]).then((r) => {
      if (!alive) return;
      setState({ loading: false, list: r.ok ? r.data : [], error: r.ok ? "" : r.error });
    });
    return () => { alive = false; };
  }, [spot.id]);

  return (
    <Sheet title="Choose a river gauge" onClose={onClose}>
      <div className="stack">
        <p className="prose" style={{ margin: 0 }}>
          Environment Canada's Water Survey publishes live water level and discharge for gauge
          stations across Canada. Pick the one nearest this spot and the app will show its reading.
        </p>

        {state.loading && <div className="card"><div className="small muted">Looking for gauges near this spot…</div></div>}

        {!state.loading && state.error && (
          <div className="card" style={{ borderLeft: "3px solid var(--rust)" }}>
            <div className="small">Could not reach the station list: {state.error}.</div>
            <div className="small muted" style={{ marginTop: 6 }}>
              You can still enter a station number by hand below if you know it.
            </div>
          </div>
        )}

        {!state.loading && !state.error && state.list.length === 0 && (
          <div className="card"><div className="small muted">No gauges found within about 35 km of this spot.</div></div>
        )}

        <div className="stack">
          {state.list.map((st) => (
            <button key={st.id} className="listbtn" onClick={() => onChoose(st.id)}>
              <div className="between">
                <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{st.name.toLowerCase()}</span>
                {st.distance != null && <span className="tiny num muted">{st.distance.toFixed(1)} km</span>}
              </div>
              <div className="tiny muted num" style={{ marginTop: 3 }}>{st.id}{st.prov ? ` · ${st.prov}` : ""}</div>
            </button>
          ))}
        </div>

        <div className="divlabel">Or enter a station number</div>
        <Field label="Station number" hint="Looks like 02GD003. Find them at wateroffice.ec.gc.ca.">
          <input value={manual} onChange={(e) => setManual(e.target.value.trim().toUpperCase())} placeholder="02GD003" />
        </Field>
        <button className="btn" onClick={() => onChoose(manual)}>Use this station</button>
        {spot.hydroStation && (
          <button className="btn danger" onClick={() => onChoose("")}>Remove the gauge from this spot</button>
        )}
      </div>
    </Sheet>
  );
}

/* ============================ LICENCE REMINDER ============================ */

export function licenceStatus(lic) {
  if (!lic || !lic.boughtOn) return null;
  const start = new Date(lic.boughtOn + "T12:00:00");
  if (isNaN(start)) return null;
  const expiry = new Date(start);
  if (lic.type === "1-day sport") expiry.setDate(expiry.getDate() + 1);
  else if (lic.type === "3-year Outdoors Card") expiry.setFullYear(expiry.getFullYear() + 3);
  else expiry.setFullYear(expiry.getFullYear() + 1);
  const days = Math.ceil((expiry - new Date()) / 86400000);
  return { expiry, days, expired: days < 0, soon: days >= 0 && days <= 30 };
}

function LicencePanel({ lic, setLic, onClose }) {
  const [f, setF] = useState(lic);
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const st = licenceStatus(f);

  const ask = async () => {
    if (typeof Notification === "undefined") { setPerm("unsupported"); return; }
    try { setPerm(await Notification.requestPermission()); }
    catch { setPerm("denied"); }
  };

  return (
    <Sheet title="Fishing licence" onClose={onClose}
      action={<button className="btn sm" onClick={() => { setLic(f); onClose(); }}>Save</button>}>
      <div className="stack">
        <p className="prose" style={{ margin: 0 }}>
          Anglers aged 18 to 64 need a valid licence in Ontario. Tell the app when you bought yours
          and it will work out the expiry and remind you — no network needed for either.
        </p>
        <Field label="What did you buy?">
          <Choice options={["1-year sport", "1-year conservation", "1-day sport", "3-year Outdoors Card"]}
            value={f.type} onChange={(v) => setF({ ...f, type: v })} />
        </Field>
        <Field label="Date you bought it">
          <input type="date" value={f.boughtOn} onChange={(e) => setF({ ...f, boughtOn: e.target.value })} />
        </Field>

        {st && (
          <div className="card" style={{ borderLeft: `3px solid ${st.expired ? "var(--rust)" : st.soon ? "var(--brass)" : "var(--moss)"}` }}>
            <div className="small" style={{ fontWeight: 500 }}>
              {st.expired ? "Expired" : st.soon ? "Expiring soon" : "Valid"}
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {st.expired
                ? `Ran out ${Math.abs(st.days)} day${Math.abs(st.days) === 1 ? "" : "s"} ago, on ${st.expiry.toLocaleDateString("en-CA")}.`
                : `${st.days} day${st.days === 1 ? "" : "s"} left — expires ${st.expiry.toLocaleDateString("en-CA")}.`}
            </div>
          </div>
        )}

        <div className="divlabel">Reminder</div>
        <div className="card flat">
          {perm === "granted" && <div className="small">Notifications are on. You'll get a reminder 30 days before it expires.</div>}
          {perm === "denied" && <div className="small muted">
            Notifications are blocked for this app. The expiry still shows here whenever you open it —
            you can re-enable notifications in your browser or phone settings.
          </div>}
          {perm === "default" && <>
            <div className="small muted" style={{ marginBottom: 9 }}>Allow notifications and the app will remind you before your licence runs out.</div>
            <button className="btn sm" onClick={ask}>Allow notifications</button>
          </>}
          {perm === "unsupported" && <div className="small muted">
            This browser doesn't support notifications. The expiry date still shows here.
          </div>}
        </div>
        <button className="btn" onClick={() => { setLic(f); onClose(); }}>Save</button>
      </div>
    </Sheet>
  );
}

/* ============================ DATA: EXPORT / IMPORT ============================ */

/* ============================================================
   The import preview.

   Shared by a file import and a community pack deliberately: the two
   must never drift into showing different things. This project has
   form for that kind of divergence - two READMEs and two merge paths
   have both gone out of step before.
   ============================================================ */
function ImportPreview({ pending, onCommit, onCancel }) {
  const [working, setWorking] = useState(false);
  const plan = pending.plan;
  const lines = summaryLines(plan.summary);
  return (
    <div className="card" style={{ borderLeft: "3px solid var(--brass)" }}>
      <h3 style={{ fontSize: 17 }}>Before importing</h3>
      {pending.label && <div className="tiny muted" style={{ marginTop: 3 }}>{pending.label}</div>}
      <div className="stack" style={{ marginTop: 10 }}>
        {lines.length
          ? lines.map((l, i) => <div key={i} className="small">{"· "}{l}</div>)
          : <div className="small muted">Nothing new {"—"} you already have everything in this file.</div>}
        {plan.totals.unchanged > 0 && (
          <div className="small muted">{plan.totals.unchanged} unchanged</div>
        )}
        {(pending.warnings || []).map((w, i) => (
          <div key={"w" + i} className="tiny" style={{ color: "var(--rust)" }}>{w}</div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={working} onClick={async () => {
          setWorking(true);
          try { await onCommit(plan); } finally { setWorking(false); }
        }}>{working ? "Importing…" : "Import"}</button>
        <button className="btn ghost" disabled={working} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ============================================================
   Community packs directory.

   A folder of JSON on GitHub that other anglers contribute to. Read
   only: browse, preview, import. Nothing is sent anywhere from here.

   The catalog is cached, so this screen opens and renders with no
   connection - it shows the last one it saw, with an "as of" label,
   exactly like the weather does.
   ============================================================ */
const COMMUNITY_TYPE_LABELS = { all: "Everything", pack: "Field guides", locations: "Locations", pins: "Map pins" };

/* ============================================================
   Sharing your own content with the community.

   One entry point rather than a Share button sprinkled through five
   screens: you assemble a pack, exactly as you would for the existing
   Field Guide Pack export, and send that.

   The review step shows the literal JSON that will leave the device.
   The promise that nothing private is included is worth more if a
   person can check it rather than take our word.
   ============================================================ */

const SHARE_KINDS = [
  { key: "pack", label: "Field guide pack", blurb: "Spots, species, baits, knots and tips you have added." },
  { key: "locations", label: "Locations only", blurb: "Just your spots, for people who only want places to fish." },
];

function SharePanel({ catalog, onBack }) {
  const [type, setType] = useState("pack");
  const [chosen, setChosen] = useState({});
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [author, setAuthor] = useState("");
  const [showJson, setShowJson] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(null);

  /* Only your own additions. Built-in content already exists in every
     copy, and something you imported from the community is not yours
     to publish again. */
  const mine = useMemo(() => {
    const out = {};
    for (const key of Object.keys(KIND_OF)) {
      out[key] = (catalog[key] || []).filter((r) => r && r.custom && !isCommunityRecord(r));
    }
    return out;
  }, [catalog]);

  const visibleKeys = type === "locations" ? ["spots"] : Object.keys(KIND_OF);
  const totalMine = visibleKeys.reduce((n, k) => n + mine[k].length, 0);

  const records = useMemo(() => {
    const out = {};
    for (const k of visibleKeys) out[k] = mine[k].filter((r) => chosen[r.id]);
    return out;
  }, [mine, chosen, type]);

  const picked = Object.values(records).reduce((n, l) => n + l.length, 0);
  const draft = useMemo(
    () => (picked ? buildSubmission(type, { records, note: desc }) : null),
    [type, records, desc, picked]
  );

  useEffect(() => { setAuthor((a) => a); }, []);

  const send = async () => {
    if (!draft || !draft.ok) return;
    setBusy(true); setMsg(null);
    try {
      const deviceId = await getDeviceId();
      const r = await submitCommunityContent({
        type,
        payload: draft.payload,
        title: title.trim(),
        description: desc.trim(),
        author: author.trim() || "Anonymous",
        deviceId,
      });
      if (!r.ok) { setMsg({ bad: true, t: `That did not go through — ${r.error}.` }); return; }
      await rememberSubmission({ title: title.trim(), type, status: r.status, url: r.url, at: Date.now() });
      setDone(r);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="stack">
        <div className="card" style={{ borderLeft: "3px solid var(--moss)" }}>
          <h3 style={{ fontSize: 17 }}>
            {done.status === "flagged" ? "Sent for review" : "Submitted"}
          </h3>
          <p className="small" style={{ margin: "6px 0 0" }}>
            {done.status === "flagged"
              ? "Something in it needs a person to look at before it can be published. That is normal for anything with a photo."
              : "It is now waiting to be reviewed and merged. It will appear in the directory once it is."}
          </p>
          {done.url && (
            <a className="small" href={done.url} target="_blank" rel="noopener noreferrer"
               style={{ display: "inline-block", marginTop: 8 }}>See it on GitHub</a>
          )}
        </div>
        <button className="btn ghost" onClick={onBack}>Back to the directory</button>
      </div>
    );
  }

  return (
    <div className="stack">
      <button className="btn ghost" onClick={onBack} style={{ alignSelf: "flex-start" }}>Back</button>

      <p className="small muted" style={{ margin: 0 }}>
        Share what you have added with other anglers. Only your own entries can be
        shared — built-in content is already in everyone's copy, and anything you
        imported stays credited to whoever wrote it.
      </p>

      <div className="divlabel">What kind</div>
      {SHARE_KINDS.map((k) => (
        <button key={k.key} className="listbtn" onClick={() => { setType(k.key); setChosen({}); }}>
          <div className="between">
            <span style={{ fontWeight: 500 }}>{k.label}</span>
            <span className={"chip " + (type === k.key ? "open" : "")}>{type === k.key ? "Chosen" : "Choose"}</span>
          </div>
          <div className="tiny muted" style={{ marginTop: 3 }}>{k.blurb}</div>
        </button>
      ))}

      <div className="divlabel">What to include</div>
      {!totalMine && (
        <div className="card">
          <div className="small">You have not added anything of your own yet.</div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            Add a spot, bait, knot or tip and it will show up here to share.
          </div>
        </div>
      )}
      {visibleKeys.map((key) =>
        mine[key].length ? (
          <div className="card" key={key}>
            <div className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: ".05em" }}>{key}</div>
            <div className="stack" style={{ marginTop: 8 }}>
              {mine[key].map((r) => (
                <label key={r.id} className="row" style={{ alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={!!chosen[r.id]}
                         onChange={(e) => setChosen((c) => ({ ...c, [r.id]: e.target.checked }))} />
                  <span className="small">{r.name || r.title || r.id}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null
      )}

      {picked > 0 && (
        <>
          <div className="divlabel">About it</div>
          <input placeholder="Title — what is this?" value={title} maxLength={120}
                 onChange={(e) => setTitle(e.target.value)} />
          <textarea placeholder="A line or two on what is in it and who it is for" rows={3}
                    value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} />
          <input placeholder="Your name, as you want it credited" value={author} maxLength={60}
                 onChange={(e) => setAuthor(e.target.value)} />
          <div className="tiny muted">
            A display name only. Do not put an email or anything you would not want public.
          </div>

          <div className="divlabel">Check before sending</div>
          <div className="card">
            <div className="small">
              {draft && draft.ok ? describeSubmission(draft.payload).join(", ") : "Nothing to send."}
            </div>
            <div className="tiny muted" style={{ marginTop: 6 }}>
              Your trips, catches, photos and licence details are never included. This is
              published publicly under CC0 — anyone may use it.
            </div>
            <button className="btn ghost" style={{ marginTop: 10 }}
                    onClick={() => setShowJson((v) => !v)}>
              {showJson ? "Hide" : "Show me exactly what gets sent"}
            </button>
            {showJson && draft && draft.ok && (
              <pre className="tiny" style={{
                marginTop: 10, maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap",
                wordBreak: "break-word", background: "var(--card2)", padding: 10, borderRadius: 8,
              }}>{JSON.stringify(draft.payload, null, 2)}</pre>
            )}
          </div>

          {msg && (
            <div className="card" style={{ borderLeft: `3px solid ${msg.bad ? "var(--rust)" : "var(--moss)"}` }}>
              <div className="small" style={{ color: msg.bad ? "var(--rust)" : "var(--ink)" }}>{msg.t}</div>
            </div>
          )}

          <button className="btn" disabled={busy || !title.trim() || !draft || !draft.ok}
                  onClick={send}>
            {busy ? "Sending…" : "Share it"}
          </button>
          {!title.trim() && <div className="tiny muted">Give it a title first.</div>}
        </>
      )}
    </div>
  );
}

function CommunityPanel({ catalog, log, onImport, onClose }) {
  const [dir, setDir] = useState({ entries: [], stats: { generatedAt: null, scores: {} }, at: null, dropped: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [mode, setMode] = useState("browse");

  /* Cached first, network second. The first render must never wait on a
     request - invariant #1, the same rule every other screen follows. */
  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await loadKey(K_COMMUNITY, null);
      if (alive && cached && cached.index) {
        const s = shapeIndex(cached.index);
        if (s.ok) setDir({ entries: s.entries, stats: shapeStats(cached.stats), at: cached.at || null, dropped: s.dropped });
      }
      const [ix, st] = await Promise.all([fetchCommunityIndex(), fetchCommunityStats()]);
      if (!alive) return;
      setLoading(false);
      if (!ix.ok) { setError(cached ? null : ix.error); return; }
      const s = shapeIndex(ix.data);
      if (!s.ok) { setError(s.error); return; }
      const stats = shapeStats(st.ok ? st.data : null);
      setDir({ entries: s.entries, stats, at: ix.at, dropped: s.dropped });
      setError(null);
      await saveKey(K_COMMUNITY, { index: ix.data, stats: st.ok ? st.data : null, at: ix.at });
    })();
    return () => { alive = false; };
  }, []);

  const shown = useMemo(
    () => sortEntries(filterEntries(withScores(dir.entries, dir.stats), { type, query }), "score"),
    [dir, type, query]
  );

  const open = async (entry) => {
    setMsg(null); setPending(null); setBusyId(entry.id);
    try {
      const r = await fetchCommunityPack(entry.path);
      if (!r.ok) { setMsg({ bad: true, t: `Could not download that one — ${r.error}.` }); return; }
      const v = validateImport(r.text);
      if (!v.ok) { setMsg({ bad: true, t: v.errors.join(" ") }); return; }
      const tagged = tagCommunityRecords(v.data.catalog, entry.id);
      const mine = await PH.allPhotos();
      const photoIds = new Set((mine.photos || []).map((p) => p.id));
      const plan = planImport({ catalog, log, photoIds }, { ...v.data, catalog: tagged });
      setPending({ plan, warnings: v.warnings, label: `${entry.title} · shared by ${entry.author}` });
    } finally {
      setBusyId(null);
    }
  };

  const scoreAge = dir.stats.generatedAt ? agoLabel(dir.stats.generatedAt) : null;

  return (
    <Sheet title={mode === "share" ? "Share with the community" : "Community packs"} onClose={onClose}>
      {mode === "share" ? (
        <SharePanel catalog={catalog} onBack={() => setMode("browse")} />
      ) : (
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Spots, baits, knots and tips shared by other anglers. Anything you import stays
          marked as theirs, and you can remove it again like anything else.
        </p>

        <button className="listbtn" onClick={() => setMode("share")}>
          <div className="between">
            <span style={{ fontWeight: 500 }}>Share what you have added</span>
            <span className="chip">Contribute</span>
          </div>
          <div className="tiny muted" style={{ marginTop: 3 }}>
            Your own spots, baits, knots and tips. Nothing from your log ever goes.
          </div>
        </button>

        <input placeholder="Search shared packs" value={query} onChange={(e) => setQuery(e.target.value)} />

        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {Object.entries(COMMUNITY_TYPE_LABELS).map(([k, l]) => (
            <button key={k} className={"chip " + (type === k ? "open" : "")} onClick={() => setType(k)}>{l}</button>
          ))}
        </div>

        {msg && (
          <div className="card" style={{ borderLeft: `3px solid ${msg.bad ? "var(--rust)" : "var(--moss)"}` }}>
            <div className="small" style={{ color: msg.bad ? "var(--rust)" : "var(--ink)" }}>{msg.t}</div>
          </div>
        )}

        {pending && (
          <ImportPreview
            pending={pending}
            onCancel={() => setPending(null)}
            onCommit={async (plan) => {
              const totals = plan.totals;
              setPending(null);
              onImport(plan.next);
              setMsg({ t: `Imported. ${totals.added} added, ${totals.updated} updated.` });
            }}
          />
        )}

        {loading && !dir.entries.length && <div className="small muted">Looking for shared packs{"…"}</div>}

        {error && !dir.entries.length && (
          <div className="card">
            <div className="small">Could not reach the community directory {"—"} {error}.</div>
            <div className="tiny muted" style={{ marginTop: 4 }}>
              Everything else in the app works offline. Try again when you have a connection.
            </div>
          </div>
        )}

        {!!dir.entries.length && (
          <div className="tiny muted">
            {dir.at ? `Directory as of ${agoLabel(dir.at)}` : "Directory cached"}
            {scoreAge ? ` · scores as of ${scoreAge}` : ""}
            {dir.dropped ? ` · ${dir.dropped} unreadable ${dir.dropped === 1 ? "entry" : "entries"} skipped` : ""}
          </div>
        )}

        {!!dir.entries.length && !shown.length && (
          <div className="small muted">Nothing matches that.</div>
        )}

        {shown.map((e) => (
          <div className="card" key={e.id}>
            <div className="between">
              <h3 style={{ fontSize: 16, flex: 1, minWidth: 0 }}>{e.title}</h3>
              <span className="chip">{e.score > 0 ? `+${e.score}` : e.score}</span>
            </div>
            {e.description && <p className="small muted" style={{ margin: "5px 0 0" }}>{e.description}</p>}
            <div className="tiny muted" style={{ marginTop: 5 }}>
              {describeCounts(e.counts)} {"·"} shared by {e.author}
              {e.updatedAt ? ` · updated ${new Date(e.updatedAt).toLocaleDateString("en-CA")}` : ""}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              {e.type === "pins" ? (
                <span className="tiny muted">Map pins {"—"} these appear on the map once it lands.</span>
              ) : (
                <button className="btn ghost" disabled={busyId === e.id} onClick={() => open(e)}>
                  {busyId === e.id ? "Downloading…" : "Preview"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      )}
    </Sheet>
  );
}


function DataScreen({ catalog, log, lic, setLic, sync, drive, storage, onSync, onImport, onOpenLicence, onOpenDrive, onOpenCommunity }) {
  const [msg, setMsg] = useState(null);
  const [pending, setPending] = useState(null);
  const fileRef = useRef(null);
  const st = licenceStatus(lic);

  const customCount = ["spots", "species", "baits", "knots", "tips"]
    .reduce((n, k) => n + (catalog[k] || []).length, 0);

  const doExport = async (kind) => {
    setMsg(null);
    try {
      // A Pack is knowledge to hand another angler — it carries no catches,
      // so it carries no catch photos either.
      let catchPhotos = [];
      if (kind !== KIND.PACK) {
        setMsg({ t: "Gathering photos…" });
        const p = await PH.photosForExport();
        catchPhotos = p.ok ? p.list : [];
      }
      const payload = buildExport(kind, { catalog, log, catchPhotos });
      const r = await shareJSON(payload, exportFilename(kind));
      if (r.cancelled) return;
      setMsg(r.ok
        ? { t: r.via === "share" ? "Shared." : "Saved to your device." }
        : { bad: true, t: `Export failed: ${r.error}` });
    } catch (err) {
      setMsg({ bad: true, t: `Export failed: ${err.message || err}` });
    }
  };

  const onFile = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    setMsg(null); setPending(null);
    const read = await readFile(file);
    if (!read.ok) { setMsg({ bad: true, t: read.error }); return; }

    const v = validateImport(read.text);
    if (!v.ok) { setMsg({ bad: true, t: v.errors.join(" ") }); return; }

    // Photo ids already on this device, so the preview can say how many of
    // the incoming pictures are actually new.
    const mine = await PH.allPhotos();
    const photoIds = new Set((mine.photos || []).map((p) => p.id));
    const plan = planImport({ catalog, log, photoIds }, v.data);
    const when = v.data.exportedAt ? ` · exported ${new Date(v.data.exportedAt).toLocaleDateString("en-CA")}` : "";
    setPending({ plan, warnings: v.warnings, label: `${v.data.kind} file${when}` });
  };

  return (
    <>
      <div className="hdr">
        <div className="kick">Backup, sharing and settings</div>
        <h1 style={{ marginTop: 3 }}>Data</h1>
      </div>
      <div className="pad" style={{ paddingTop: 16 }}>
        <div className="stack">

          <div className="divlabel">Share what you know</div>
          <div className="card">
            <h3 style={{ fontSize: 17 }}>Field Guide Pack</h3>
            <p className="small muted" style={{ margin: "6px 0 0" }}>
              Your custom spots, species, baits, knots and tips — {customCount} entr{customCount === 1 ? "y" : "ies"}.
              No trips or catches. This is the file to hand another angler.
            </p>
            <button className="btn" style={{ marginTop: 11 }} onClick={() => doExport(KIND.PACK)}>Export pack</button>
          </div>

          <div className="divlabel">Back up what you caught</div>
          <div className="card">
            <h3 style={{ fontSize: 17 }}>My Log</h3>
            <p className="small muted" style={{ margin: "6px 0 0" }}>
              {log.trips.length} trip{log.trips.length === 1 ? "" : "s"} and {log.catches.length} fish,
              with photo links. Personal — keep this one to yourself.
            </p>
            <button className="btn" style={{ marginTop: 11 }} onClick={() => doExport(KIND.LOG)}>Export log</button>
            <button className="btn ghost" style={{ marginTop: 9 }} onClick={() => doExport(KIND.FULL)}>
              Export everything in one file
            </button>
          </div>

          <div className="divlabel">Import</div>
          <div className="card">
            <p className="small muted" style={{ margin: 0 }}>
              Bring in any of the three file types. Records are matched by id and merged — nothing you
              already have is overwritten unless the incoming copy is newer.
            </p>
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile}
              style={{ display: "none" }} />
            <button className="btn" style={{ marginTop: 11 }} onClick={() => fileRef.current?.click()}>
              Choose a file
            </button>
          </div>

          {msg && (
            <div className="card" style={{ borderLeft: `3px solid ${msg.bad ? "var(--rust)" : "var(--moss)"}` }}>
              <div className="small" style={{ color: msg.bad ? "var(--rust)" : "var(--ink)" }}>{msg.t}</div>
            </div>
          )}

          {pending && (
            <ImportPreview
              pending={pending}
              onCancel={() => setPending(null)}
              onCommit={async (plan) => {
                const next = plan.next;
                const totals = plan.totals;
                setPending(null);
                onImport(next);
                // Catch photos live in IndexedDB, so they are written here
                // rather than through the catalog/log state.
                let pics = null;
                if (next.catchPhotos?.length) {
                  setMsg({ t: "Restoring photos…" });
                  pics = await PH.importPhotos(next.catchPhotos);
                }
                setMsg({
                  t: `Imported. ${totals.added} added, ${totals.updated} updated.` +
                    (pics ? ` ${pics.added + pics.updated} photo${pics.added + pics.updated === 1 ? "" : "s"} restored${pics.failed ? `, ${pics.failed} failed` : ""}.` : ""),
                });
              }}
            />
          )}

          <div className="divlabel">Community</div>
          <button className="listbtn" onClick={onOpenCommunity}>
            <div className="between">
              <span style={{ fontWeight: 500 }}>Community packs</span>
              <span className="chip">Browse</span>
            </div>
            <div className="tiny muted" style={{ marginTop: 3 }}>
              Spots, baits, knots and tips shared by other anglers. Downloaded, previewed
              and merged the same way as a file someone hands you.
            </div>
          </button>

          <div className="divlabel">Google Drive</div>
          <button className="listbtn" onClick={onOpenDrive}>
            <div className="between">
              <span style={{ fontWeight: 500 }}>Back up to your Google Drive</span>
              <span className={"chip " + (drive.connected ? "open" : "")}>
                {drive.connected ? "Connected" : "Not connected"}
              </span>
            </div>
            <div className="tiny muted" style={{ marginTop: 3 }}>
              {drive.connected
                ? (drive.email || "Signed in") + (drive.lastBackup ? ` · backed up ${agoLabel(drive.lastBackup)}` : "")
                : "Sign into your own Google account — photos and log go to your Drive"}
            </div>
            {storage?.ok && (
              <div style={{ height: 5, background: "var(--line2)", borderRadius: 2, marginTop: 9 }}>
                <div style={{ width: `${Math.min(100, storage.ratio * 100)}%`, height: "100%", borderRadius: 2,
                  background: storage.pressured ? "var(--rust)" : "var(--deep)" }} />
              </div>
            )}
            {storage?.ok && (
              <div className="tiny muted num" style={{ marginTop: 4 }}>
                {PH.fmtBytes(storage.usage)} used of {PH.fmtBytes(storage.quota)} on this device
              </div>
            )}
          </button>

          <div className="divlabel">Licence</div>
          <button className="listbtn" onClick={onOpenLicence}>
            <div className="between">
              <span style={{ fontWeight: 500 }}>Fishing licence reminder</span>
              {st && <span className={"chip " + (st.expired ? "shut" : st.soon ? "brass" : "open")}>
                {st.expired ? "Expired" : `${st.days} days`}
              </span>}
            </div>
            <div className="tiny muted" style={{ marginTop: 3 }}>
              {st ? `${lic.type}, expires ${st.expiry.toLocaleDateString("en-CA")}` : "Not set up yet"}
            </div>
          </button>

          <div className="divlabel">Sync</div>
          <button className="listbtn" onClick={onSync}>
            <div className="between">
              <span style={{ fontWeight: 500 }}>Google Sheets sync</span>
              <span className="chip">{sync.url ? (sync.lastSync ? "Connected" : "Set up") : "Off"}</span>
            </div>
            <div className="tiny muted" style={{ marginTop: 3 }}>
              {sync.lastSync ? `Last synced ${agoLabel(sync.lastSync)}` : "Optional — back your log up to a spreadsheet"}
            </div>
          </button>

          <div className="card flat">
            <div className="tiny muted">
              Everything is stored on this device. Data schema v{SCHEMA_VERSION}.
              Weather from Open-Meteo; river levels from Environment Canada, both used only when
              you have a connection and cached for when you don't.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================ ADD A KNOT ============================ */

function AddKnotWizard({ onDone, onClose }) {
  const steps = [
    { key: "name", q: "What is the knot called?", type: "text", required: true, ph: "e.g. Alberto knot" },
    { key: "use", q: "What do you use it for?", type: "text", required: true, ph: "Joining braid to a fluorocarbon leader" },
    { key: "strength", q: "How strong is it?", type: "choice",
      options: ["Close to 100%", "Around 95%", "Around 90%", "Around 85%", "Not sure"] },
    { key: "diff", q: "How hard is it to tie?", type: "choice",
      options: ["Start here", "Worth learning second", "Once you are comfortable", "Fiddly but worth it"] },
    { key: "steps", q: "Walk through the steps", type: "list", required: true,
      help: "One step per line. Keep each one to a single action.",
      ph: "Double 6 inches of line\nPass the loop through the eye\nWrap five times" },
    { key: "fail", q: "How does it go wrong?", type: "long",
      help: "The mistake you made the first ten times. This is the most useful field.",
      ph: "If you pull it tight dry it burns the line and fails at half strength." },
  ];
  return <Wizard title="Add a knot" steps={steps} onClose={onClose}
    intro="Add a knot to your own reference. It sits alongside the built-in ones in Learn, steps and all, and travels in your Field Guide Pack."
    onDone={(d) => onDone({
      id: uid(), custom: true, _v: SCHEMA_VERSION, updatedAt: Date.now(),
      name: d.name, use: d.use, strength: d.strength || "Not sure", diff: d.diff || "Once you are comfortable",
      steps: lines(d.steps), fail: d.fail || "",
    })} />;
}


/* ============================ PHOTOS ============================ */

/* Shows a catch photo wherever it lives: the local full-size copy if
   we still have it, the Drive original if it has been archived and we
   can reach it, and always the permanent thumbnail underneath so
   something appears instantly, offline, every time. */
function CatchPhoto({ photoId, height = 200 }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let alive = true, objectUrl = null;
    (async () => {
      const r = await PH.getPhoto(photoId);
      if (!alive) return;
      if (!r.ok) { setState({ loading: false, missing: true }); return; }
      const p = r.photo;
      objectUrl = PH.localURL(p);
      setState({ loading: false, thumb: p.thumb, url: objectUrl, archived: !!p.archivedAt, driveId: p.driveId });

      // Archived: try to pull the original back from the person's Drive.
      if (!objectUrl && p.driveId) {
        setState((s) => ({ ...s, driveTried: true }));
        const d = await GD.fetchPhotoURL(p.driveId);
        if (alive && d.ok) setState((s) => ({ ...s, url: d.url }));
        else if (alive) setState((s) => ({ ...s, driveError: d.error }));
      }
    })();
    return () => { alive = false; if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch {} } };
  }, [photoId]);

  /* We had a local copy, but it would not render — the signature of a photo
     destroyed by the old Blob-rewrite bug. The original may still be safe in
     Drive, so try there once. Once only: a Drive image that also fails to
     load would otherwise retry forever. */
  useEffect(() => {
    if (!state.urlFailed || state.url || !state.driveId || state.driveTried) return;
    let alive = true;
    setState((s) => ({ ...s, driveTried: true }));
    GD.fetchPhotoURL(state.driveId).then((d) => {
      if (!alive) return;
      if (d.ok) setState((s) => ({ ...s, url: d.url }));
      else setState((s) => ({ ...s, driveError: d.error }));
    });
    return () => { alive = false; };
  }, [state.urlFailed, state.url, state.driveId, state.driveTried]);

  if (state.loading) return <div style={{ height, background: "var(--card2)" }} />;
  if (state.missing) return null;

  // The thumbnail is only a real fallback if a failed full-size image
  // actually falls back to it. Dropping state.url on error is what makes
  // that happen — without this, a dead object URL is still a truthy src
  // and the catch just renders blank forever.
  const onImgError = () => setState((s) => (s.url ? { ...s, url: null, urlFailed: true } : s));

  return (
    <div style={{ position: "relative", background: "#DDE2D6" }}>
      <img src={state.url || state.thumb} alt="Catch" onError={onImgError}
        style={{ width: "100%", height, objectFit: "cover", display: "block",
          filter: state.url ? "none" : "blur(0.4px)" }} />
      {state.archived && !state.url && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0,
          background: "rgba(27,36,25,.78)", color: "#EAF0F1", padding: "6px 10px", fontSize: 12 }}>
          {state.driveError === "needs-signin"
            ? "Full photo is in your Google Drive — connect Drive to view it"
            : "Full photo is in your Google Drive · showing the saved thumbnail"}
        </div>
      )}
    </div>
  );
}

/* A catch whose picture is a pasted web address rather than one taken in
   the app. Needs the network, so it simply disappears if it will not load
   — never a broken-image icon. */
function CatchLinkPhoto({ url, height = 200 }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  return (
    <div style={{ background: "#DDE2D6" }}>
      <img src={url} alt="Catch" onError={() => setFailed(true)} referrerPolicy="no-referrer"
        style={{ width: "100%", height, objectFit: "cover", display: "block" }} />
    </div>
  );
}

function PhotoCapture({ value, onChange }) {
  const camRef = useRef(null), libRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handle = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    setBusy(true); setErr("");
    const r = await PH.processAndStore(file);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onChange(r.photo.id);
  };

  return (
    <div className="stack">
      {value && <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <CatchPhoto photoId={value} height={190} />
      </div>}
      {/* capture="environment" hands off to the phone's own camera app,
          which behaves identically on iOS and Android. */}
      <input ref={camRef} type="file" accept="image/*" capture="environment"
        onChange={handle} style={{ display: "none" }} />
      <input ref={libRef} type="file" accept="image/*" onChange={handle} style={{ display: "none" }} />
      <div className="row">
        <button type="button" className="btn" disabled={busy}
          onClick={() => camRef.current?.click()}>{busy ? "Processing…" : "Take a photo"}</button>
        <button type="button" className="btn ghost" disabled={busy}
          onClick={() => libRef.current?.click()}>Choose one</button>
      </div>
      {value && <button type="button" className="btn ghost sm" style={{ width: "100%" }}
        onClick={() => onChange("")}>Remove photo</button>}
      {err && <div className="small" style={{ color: "var(--rust)" }}>{err}</div>}
      <div className="tiny muted">
        Photos are compressed and saved on this device. A small thumbnail is always kept,
        so an old catch still shows something even with no signal.
      </div>
    </div>
  );
}

/* ============================ GOOGLE DRIVE ============================ */

function DrivePanel({ drive, setDrive, catalog, log, onClose }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [storage, setStorage] = useState(null);
  const [plan, setPlan] = useState(null);
  const support = GD.driveSupported();

  useEffect(() => { PH.storageStatus().then(setStorage); }, []);

  const say = (t, bad) => setMsg({ t, bad });

  const connect = async () => {
    setBusy("connect"); setMsg(null);
    const r = await GD.connect({ interactive: true });
    if (!r.ok) { setBusy(""); if (!r.cancelled) say(r.error, true); return; }
    const who = await GD.accountEmail();
    setDrive({ ...drive, connected: true, email: who.ok ? who.email : "" });
    setBusy("");
    say(who.ok ? `Connected as ${who.email}.` : "Connected.");
  };

  const disconnect = () => {
    GD.signOut();
    setDrive({ ...drive, connected: false, email: "" });
    say("Disconnected. Files already in your Drive are untouched.");
  };

  const backupNow = async () => {
    setBusy("backup"); setMsg(null);
    try {
      const pics = await PH.photosForExport();
      const payload = buildExport(KIND.FULL, { catalog, log, catchPhotos: pics.ok ? pics.list : [] });
      const name = `london-fishing-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const up = await GD.uploadJSON(payload, name);
      if (!up.ok) {
        setBusy("");
        say(up.error === "needs-signin" ? "Your Google session expired — connect again." : `Backup failed: ${up.error}`, true);
        return;
      }
      // Then any photos not yet in Drive.
      const cand = await PH.archiveCandidates();
      let photos = 0, failed = 0;
      for (const p of (cand.list || [])) {
        const body = PH.photoBlob(p);
        if (!body) continue;
        const r = await GD.uploadBlob(body, `catch-${p.id}.jpg`, "image/jpeg");
        if (r.ok) {
          // Records the Drive id WITHOUT rewriting the image bytes. Writing
          // a Blob back here is what destroyed every photo on iOS.
          await PH.setPhotoDrive(p.id, r.id, r.link || null);
          photos++;
        } else { failed++; if (r.error === "needs-signin") break; }
      }
      setDrive({ ...drive, lastBackup: Date.now() });
      setBusy("");
      say(`Backed up your log and ${photos} photo${photos === 1 ? "" : "s"} to your Drive${failed ? `. ${failed} photo${failed === 1 ? "" : "s"} failed.` : "."}`);
    } catch (err) {
      setBusy(""); say(`Backup failed: ${err.message || err}`, true);
    }
  };

  const previewArchive = async () => {
    setBusy("plan"); setMsg(null);
    const p = await PH.planArchive();
    setBusy("");
    if (!p.ok) { say(p.error, true); return; }
    setPlan(p);
    if (!p.list.length) say("Nothing needs archiving — you have plenty of room.");
  };

  const runArchive = async () => {
    if (!plan?.list?.length) return;
    setBusy("archive"); setMsg(null);
    const res = await PH.archivePhotos(plan.list, GD.uploadBlob);
    const st = await PH.storageStatus();
    setStorage(st); setPlan(null); setBusy("");
    setDrive({ ...drive, lastArchive: Date.now() });
    say(res.failed
      ? `Archived ${res.archived}, freed ${PH.fmtBytes(res.freed)}. ${res.failed} failed — nothing was deleted for those.`
      : `Archived ${res.archived} photo${res.archived === 1 ? "" : "s"} and freed ${PH.fmtBytes(res.freed)}. Thumbnails kept on this device.`,
      res.failed > 0);
  };

  return (
    <Sheet title="Google Drive" onClose={onClose}>
      <div className="stack">
        <p className="prose" style={{ margin: 0 }}>
          Back your log and photos up to <strong>your own</strong> Google Drive. You sign into your
          own account — nothing goes anywhere near anyone else's.
        </p>

        {!support.ok && (
          <div className="card" style={{ borderLeft: "3px solid var(--rust)" }}>
            <div className="small">{support.error}</div>
          </div>
        )}

        {support.ok && !drive.connected && (
          <>
            <button className="btn" disabled={busy === "connect"} onClick={connect}>
              {busy === "connect" ? "Opening Google…" : "Connect Google Drive"}
            </button>
            <div className="card flat">
              <div className="tiny muted">
                The app asks for one permission only: to create and open files it made itself.
                It cannot see anything else in your Drive. Files are created private — never shared
                by link. You can disconnect at any time.
              </div>
            </div>
          </>
        )}

        {support.ok && drive.connected && (
          <>
            <div className="card" style={{ borderLeft: "3px solid var(--moss)" }}>
              <div className="between">
                <span className="small" style={{ fontWeight: 500 }}>Connected</span>
                <button className="tiny" style={{ color: "var(--rust)" }} onClick={disconnect}>Disconnect</button>
              </div>
              {drive.email && <div className="tiny muted" style={{ marginTop: 3 }}>{drive.email}</div>}
              {drive.lastBackup > 0 && (
                <div className="tiny muted" style={{ marginTop: 3 }}>Last backup {agoLabel(drive.lastBackup)}</div>
              )}
            </div>
            <button className="btn" disabled={!!busy} onClick={backupNow}>
              {busy === "backup" ? "Uploading…" : "Back up everything now"}
            </button>
          </>
        )}

        <div className="divlabel">Storage on this device</div>
        <div className="card">
          {storage?.ok ? (
            <>
              <div className="between">
                <span className="small">{PH.fmtBytes(storage.usage)} of {PH.fmtBytes(storage.quota)}</span>
                <span className="small num muted">{Math.round(storage.ratio * 100)}%</span>
              </div>
              <div style={{ height: 8, background: "var(--line2)", borderRadius: 2, marginTop: 7 }}>
                <div style={{ width: `${Math.min(100, storage.ratio * 100)}%`, height: "100%", borderRadius: 2,
                  background: storage.pressured ? "var(--rust)" : "var(--deep)" }} />
              </div>
              {storage.pressured && (
                <div className="small" style={{ marginTop: 9, color: "var(--rust)" }}>
                  Running low. Archiving your oldest photos to Drive will free space.
                </div>
              )}
              <div className="tiny muted" style={{ marginTop: 8 }}>
                {storage.persisted
                  ? "This browser has agreed to keep your data."
                  : "This browser has not guaranteed to keep your data — back up regularly."}
              </div>
            </>
          ) : (
            <div className="small muted">{storage?.error || "Checking…"}</div>
          )}
        </div>

        <div className="divlabel">Archive old photos</div>
        <div className="card">
          <p className="small muted" style={{ margin: 0 }}>
            Archiving uploads your oldest full-size photos to your Drive, then frees them from
            this device. A thumbnail always stays here, and the original is only deleted after
            the upload is confirmed.
          </p>
          <Field label="Offer to archive automatically when storage gets full">
            <Choice options={[{ v: true, l: "Yes" }, { v: false, l: "No" }]}
              value={drive.autoArchive} onChange={(v) => setDrive({ ...drive, autoArchive: v })} />
          </Field>
          <button className="btn ghost" disabled={!!busy} onClick={previewArchive}>
            {busy === "plan" ? "Checking…" : "See what would be archived"}
          </button>
          {plan?.list?.length > 0 && (
            <div className="card flat" style={{ marginTop: 11, borderLeft: "3px solid var(--brass)" }}>
              <div className="small">
                {plan.list.length} photo{plan.list.length === 1 ? "" : "s"}, freeing about {PH.fmtBytes(plan.freed)}.
                Oldest first.
              </div>
              <button className="btn" style={{ marginTop: 10 }} disabled={!drive.connected || !!busy}
                onClick={runArchive}>
                {busy === "archive" ? "Archiving…" : "Archive them"}
              </button>
              {!drive.connected && (
                <div className="tiny" style={{ marginTop: 7, color: "var(--rust)" }}>
                  Connect Google Drive first — nothing is deleted until it is safely uploaded.
                </div>
              )}
            </div>
          )}
        </div>

        {msg && (
          <div className="card" style={{ borderLeft: `3px solid ${msg.bad ? "var(--rust)" : "var(--moss)"}` }}>
            <div className="small" style={{ color: msg.bad ? "var(--rust)" : "var(--ink)" }}>{msg.t}</div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ============================ APP ============================ */

const ICONS = {
  spots: "M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z M12 10a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z",
  guide: "M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21.5z M9 8h7 M9 12h5",
  log: "M8 3v3 M16 3v3 M4 8h16 M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z M9 14l2 2 4-4",
  stats: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  data: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  learn: "M3 12c3-4 6-4 9 0s6 4 9 0 M3 17c3-4 6-4 9 0s6 4 9 0 M3 7c3-4 6-4 9 0s6 4 9 0",
};

export default function LondonFishingCompanion() {
  const [tab, setTab] = useState("spots");
  const [catalog, setCatalog] = useState(EMPTY_CATALOG);
  const [log, setLog] = useState(EMPTY_LOG);
  const [sync, setSyncState] = useState(EMPTY_SYNC);
  const [env, setEnv] = useState(EMPTY_ENV);
  const [lic, setLicState] = useState(EMPTY_LIC);
  const [envBusy, setEnvBusy] = useState(false);
  const [drive, setDriveState] = useState(EMPTY_DRIVE);
  const [storage, setStorage] = useState(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [modal, setModal] = useState(null); // {type, payload}

  useEffect(() => {
    // Single-file build: no webfont fetch. Falls back to Georgia and the
    // system sans, so the app makes zero external requests for its assets.
    (async () => {
      try {
        const [c, g, y, e, l] = await Promise.all([
          loadKey(K_CATALOG, EMPTY_CATALOG), loadKey(K_LOG, EMPTY_LOG), loadKey(K_SYNC, EMPTY_SYNC),
          loadKey(K_ENV, EMPTY_ENV), loadKey(K_LIC, EMPTY_LIC),
        ]);
        const dr = await loadKey(K_DRIVE, EMPTY_DRIVE);
        setDriveState({ ...EMPTY_DRIVE, ...dr, connected: false });  // token never survives a reload
        // Migrate on load so old records never render broken.
        const migrated = migrateStore({ trips: g.trips, catches: g.catches, catalog: c });
        setCatalog({ ...EMPTY_CATALOG, ...migrated.catalog });
        setLog({ trips: migrated.trips, catches: migrated.catches });
        setSyncState({ ...EMPTY_SYNC, ...y });
        setEnv({ ...EMPTY_ENV, ...e });
        setLicState({ ...EMPTY_LIC, ...l });
      } catch (e) {
        console.error("load failed", e);
        setErr("Could not read your saved data. Nothing has been deleted — try reopening the app.");
      } finally {
        setReady(true);
        if (typeof window !== "undefined" && window.__LFC_STORAGE_WARNING__) {
          setErr(window.__LFC_STORAGE_WARNING__);
        }
      }
    })();
  }, []);

  const putCatalog = useCallback(async (next) => {
    setCatalog(next);
    const ok = await saveKey(K_CATALOG, next);
    if (!ok) setErr("Could not save that. Your change is here for now but may not survive a reload.");
  }, []);
  const putLog = useCallback(async (next) => {
    setLog(next);
    const ok = await saveKey(K_LOG, next);
    if (!ok) setErr("Could not save that. Your change is here for now but may not survive a reload.");
  }, []);

  const setSync = useCallback(async (next) => { setSyncState(next); await saveKey(K_SYNC, next); }, []);

  const putEnv = useCallback(async (next) => {
    setEnv(next);
    const ok = await saveKey(K_ENV, next);
    if (!ok) setErr("Could not cache those conditions. They will show now but may not survive a reload.");
  }, []);

  const setDrive = useCallback(async (next) => {
    setDriveState(next);
    const ok = await saveKey(K_DRIVE, { ...next, connected: false });
    if (!ok) setErr("Could not save your Drive settings.");
  }, []);

  const setLic = useCallback(async (next) => {
    setLicState(next);
    const ok = await saveKey(K_LIC, next);
    if (!ok) setErr("Could not save your licence details.");
  }, []);

  /* One place where conditions get fetched. Both calls are independent:
     if weather works and the gauge fails, you still get weather. */
  const refreshEnv = useCallback(async (spot) => {
    const ll = Array.isArray(spot.ll) ? spot.ll : null;
    if (!ll) { setErr("That spot has no coordinates saved, so there is nothing to look up."); return; }
    setEnvBusy(true);
    try {
      const [w, h] = await Promise.all([
        fetchWeather(ll[0], ll[1]),
        spot.hydroStation ? fetchHydro(spot.hydroStation) : Promise.resolve(null),
      ]);
      const next = {
        weather: { ...env.weather }, hydro: { ...env.hydro }, pressure: { ...env.pressure },
      };
      if (w.ok) {
        next.weather[spot.id] = { data: w.data, at: w.at };
        next.pressure[spot.id] = pushPressureReading(env.pressure[spot.id], w.data.pressure, w.at);
      } else {
        next.weather[spot.id] = { ...(env.weather[spot.id] || {}), error: w.error };
      }
      if (h) {
        if (h.ok) next.hydro[spot.id] = { data: h.data, at: h.at };
        else next.hydro[spot.id] = { ...(env.hydro[spot.id] || {}), error: h.error };
      }
      await putEnv(next);
      if (!w.ok && (!h || !h.ok)) {
        setErr(`Could not reach the conditions services (${w.error}). Showing the last cached readings.`);
      }
    } catch (e) {
      console.error(e);
      setErr("Something went wrong fetching conditions. Your cached readings are unaffected.");
    } finally { setEnvBusy(false); }
  }, [env, putEnv]);

  /* Auto-select the nearest river gauge for a spot that has coordinates
     but no gauge yet. Runs lazily when that spot is opened — never for all
     twelve at load, which would be a burst of calls the app doesn't need.
     Capped at 50 km so a spot with nothing nearby isn't handed a gauge
     300 km away. Silent on failure: this is a convenience, not a feature
     anything depends on. */
  const autoGaugeTried = useRef(new Set());
  const autoSelectGauge = useCallback(async (spot) => {
    if (!spot || spot.hydroStation || !Array.isArray(spot.ll)) return;
    if (autoGaugeTried.current.has(spot.id)) return;
    autoGaugeTried.current.add(spot.id);

    const r = await findStations(spot.ll[0], spot.ll[1]);
    if (!r.ok || !r.data.length) return;
    const nearest = r.data.find((st) => st.distance != null && st.distance <= 50);
    if (!nearest) return;

    setCatalog((prev) => {
      const existing = (prev.spots || []).find((x) => x.id === spot.id);
      if (existing?.hydroStation) return prev;
      const patched = {
        ...(existing || { id: spot.id }), id: spot.id, custom: true, _v: SCHEMA_VERSION,
        hydroStation: nearest.id, hydroStationName: nearest.name, hydroAuto: true,
        updatedAt: Date.now(),
      };
      const next = {
        ...prev,
        spots: existing
          ? prev.spots.map((x) => (x.id === spot.id ? patched : x))
          : [...(prev.spots || []), patched],
      };
      saveKey(K_CATALOG, next);
      return next;
    });
  }, []);

  /* Storage pressure, checked when the app opens. There is no such thing
     as background work for a web app on iOS, so "automatic" honestly means
     "checked every time you open it" — same as weather and sync. */
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    PH.storageStatus().then((st) => {
      if (!alive || !st.ok) return;
      setStorage(st);
      if (st.pressured && drive.autoArchive) {
        // Only point at Drive if Drive is actually available in this build —
        // otherwise the advice is a dead end.
        const driveUsable = GD.driveSupported().ok;
        setErr(drive.connected
          ? "Storage on this device is nearly full. Open the Data tab to archive your oldest photos to Drive."
          : driveUsable
            ? "Storage on this device is nearly full. Connect Google Drive in the Data tab to archive old photos and free space."
            : "Storage on this device is nearly full. Export a backup from the Data tab, then remove some older photos.");
      }
    });
    return () => { alive = false; };
  }, [ready]);

  /* Reconnecting Drive silently, if Google still has a session for
     this person. Never prompts — a visible popup on load would be rude. */
  useEffect(() => {
    if (!ready || !drive.email) return;
    let alive = true;
    GD.connect({ interactive: false }).then((r) => {
      if (alive && r.ok) setDriveState((d) => ({ ...d, connected: true }));
    });
    return () => { alive = false; };
  }, [ready, drive.email]);

  /* Licence reminder — local notification, once, 30 days out. */
  useEffect(() => {
    if (!ready || !lic.boughtOn) return;
    const st = licenceStatus(lic);
    if (!st || (!st.soon && !st.expired)) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const key = st.expiry.toISOString().slice(0, 10);
    if (lic.notified === key) return;
    try {
      new Notification("Fishing licence", {
        body: st.expired ? "Your Ontario fishing licence has expired." :
          `Your Ontario fishing licence expires in ${st.days} day${st.days === 1 ? "" : "s"}.`,
      });
      setLic({ ...lic, notified: key });
    } catch (e) { console.error("notification failed", e); }
  }, [ready, lic.boughtOn, lic.type]);

  const applyRemote = useCallback((d) => {
    const rc = d.catalog || {};
    setLog((prev) => {
      const merged = { trips: mergeById(prev.trips, d.trips), catches: mergeById(prev.catches, d.catches) };
      saveKey(K_LOG, merged); return merged;
    });
    setCatalog((prev) => {
      // Every catalog key has to be listed here. Anything omitted is not just
      // "not merged" — it is dropped from the object that then gets saved, so
      // a missing key silently deletes that content. Knots were missing here
      // once, which wiped custom knots on the first sync after adding one.
      const merged = {
        spots: mergeById(prev.spots, rc.spots), species: mergeById(prev.species, rc.species),
        baits: mergeById(prev.baits, rc.baits), knots: mergeById(prev.knots, rc.knots),
        tips: mergeById(prev.tips, rc.tips),
        photos: { ...(prev.photos || {}), ...(rc.photos || {}) },
      };
      saveKey(K_CATALOG, merged); return merged;
    });
  }, []);

  // Quiet background push a few seconds after a change. Failures are silent —
  // this is a convenience, not the source of truth.
  const dirty = React.useRef(false);
  useEffect(() => {
    if (!ready || !sync.auto || !sync.url) return;
    if (!dirty.current) { dirty.current = true; return; }
    const id = setTimeout(() => {
      callSync(sync.url, {
        action: "push", token: sync.token,
        data: { trips: log.trips, catches: log.catches, catalog },
      })
        .then((out) => setSyncState((p) => ({ ...p, lastSync: Date.now(), rev: out.rev || p.rev })))
        .catch(() => {});
    }, 4000);
    return () => clearTimeout(id);
  }, [log, catalog, ready, sync.auto, sync.url, sync.token]);

  const allSpecies = useMemo(() => [...SPECIES, ...catalog.species], [catalog.species]);
  const allBaits = useMemo(() => [...BAITS, ...catalog.baits], [catalog.baits]);
  const allSpots = useMemo(() => {
    const overrides = new Map((catalog.spots || []).map(s => [s.id, s]));
    const base = SPOTS.map(s => overrides.has(s.id) ? { ...s, ...overrides.get(s.id) } : s);
    const extra = (catalog.spots || []).filter(s => !SPOTS.some(b => b.id === s.id));
    return [...base, ...extra];
  }, [catalog.spots]);
  const allTips = useMemo(() => [...TIPS, ...catalog.tips], [catalog.tips]);
  const allKnots = useMemo(() => [...KNOTS, ...(catalog.knots || [])], [catalog.knots]);
  const close = () => setModal(null);

  if (!ready) {
    return (
      <div className="lfc"><style>{CSS}</style>
        <div className="pad" style={{ paddingTop: 60 }}>
          <h1>London Fishing Companion</h1>
          <p className="muted">Loading your log…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lfc">
      <style>{CSS}</style>

      {err && (
        <div style={{ background: "#F0DDDD", color: "#722525", padding: "10px 16px", fontSize: 13 }}>
          {err} <button style={{ textDecoration: "underline" }} onClick={() => setErr("")}>Dismiss</button>
        </div>
      )}

      {tab === "spots" && (
        <SpotsScreen spots={allSpots} allSpecies={allSpecies}
          onOpen={(s) => setModal({ type: "spot", payload: s })}
          onAdd={() => setModal({ type: "addSpot" })} />
      )}
      {tab === "guide" && (
        <GuideScreen allSpecies={allSpecies} allBaits={allBaits} spots={allSpots} photos={catalog.photos || {}}
          onOpenSpecies={(s) => setModal({ type: "species", payload: s })}
          onOpenBait={(b) => setModal({ type: "bait", payload: b })}
          onAddSpecies={() => setModal({ type: "addSpecies" })}
          onAddBait={() => setModal({ type: "addBait" })} />
      )}
      {tab === "log" && (
        <LogScreen log={log} spots={allSpots} allSpecies={allSpecies} allBaits={allBaits}
          sync={sync} onSync={() => setModal({ type: "sync" })}
          onNewTrip={() => setModal({ type: "trip" })}
          onEditTrip={(t) => setModal({ type: "trip", payload: t })}
          onNewCatch={(tripId) => setModal({ type: "catch", payload: null, tripId })}
          onEditCatch={(c) => setModal({ type: "catch", payload: c })} />
      )}
      {tab === "stats" && <StatsScreen log={log} spots={allSpots} allSpecies={allSpecies} allBaits={allBaits} />}
      {tab === "data" && (
        <DataScreen catalog={catalog} log={log} lic={lic} setLic={setLic} sync={sync}
          drive={drive} storage={storage}
          onOpenDrive={() => setModal({ type: "drive" })}
          onOpenCommunity={() => setModal({ type: "community" })}
          onSync={() => setModal({ type: "sync" })}
          onOpenLicence={() => setModal({ type: "licence" })}
          onImport={(next) => {
            putCatalog({ ...EMPTY_CATALOG, ...next.catalog });
            putLog(next.log);
          }} />
      )}
      {tab === "learn" && (
        <LearnScreen tips={allTips} knots={allKnots}
          onAddTip={() => setModal({ type: "addTip" })}
          onAddKnot={() => setModal({ type: "addKnot" })}
          onDeleteTip={(id) => putCatalog({ ...catalog, tips: catalog.tips.filter(t => t.id !== id) })}
          onDeleteKnot={(id) => putCatalog({ ...catalog, knots: (catalog.knots || []).filter(k => k.id !== id) })} />
      )}

      {/* ---- modals ---- */}
      {modal?.type === "spot" && (
        <SpotDetail spot={allSpots.find(x => x.id === modal.payload.id) || modal.payload}
          allSpecies={allSpecies} env={env} busy={envBusy} onClose={close}
          onRefreshEnv={refreshEnv}
          onAutoGauge={autoSelectGauge}
          onPickStation={(sp) => setModal({ type: "station", payload: sp })}
          onDelete={(id) => { putCatalog({ ...catalog, spots: catalog.spots.filter(s => s.id !== id) }); close(); }}
          onLogHere={(s) => { close(); setTab("log"); setModal({ type: "trip", payload: null, spotId: s.id }); }} />
      )}
      {modal?.type === "species" && (
        <SpeciesDetail sp={modal.payload} allBaits={allBaits} spots={allSpots}
          photo={(catalog.photos || {})[modal.payload.id]} onClose={close}
          onOpenBait={(b) => setModal({ type: "bait", payload: b })}
          onSetPhoto={(id, url) => {
            const p = { ...(catalog.photos || {}) };
            if (url) p[id] = url; else delete p[id];
            putCatalog({ ...catalog, photos: p });
          }}
          onDelete={(id) => { putCatalog({ ...catalog, species: catalog.species.filter(s => s.id !== id) }); close(); }} />
      )}
      {modal?.type === "bait" && (
        <BaitDetail b={modal.payload} allSpecies={allSpecies} photo={(catalog.photos || {})[modal.payload.id]}
          onSetPhoto={(id, url) => {
            const p = { ...(catalog.photos || {}) };
            if (url) p[id] = url; else delete p[id];
            putCatalog({ ...catalog, photos: p });
          }}
          onClose={close}
          onDelete={(id) => { putCatalog({ ...catalog, baits: catalog.baits.filter(b => b.id !== id) }); close(); }} />
      )}
      {modal?.type === "trip" && (
        <TripForm trip={modal.payload || null} prefillSpotId={modal.spotId}
          spots={allSpots} onClose={close}
          onSave={(t) => {
            const rec = stamp(t);
            const exists = log.trips.some(x => x.id === rec.id);
            putLog({ ...log, trips: exists ? log.trips.map(x => x.id === rec.id ? rec : x) : [...log.trips, rec] });
            close();
          }}
          onDelete={(id) => {
            putLog({ trips: log.trips.filter(t => t.id !== id), catches: log.catches.filter(c => c.tripId !== id) });
            close();
          }} />
      )}
      {modal?.type === "catch" && (
        <CatchForm item={modal.payload || null} prefillTripId={modal.tripId}
          trips={[...log.trips].sort((a, b) => b.date.localeCompare(a.date))}
          allSpecies={allSpecies} allBaits={allBaits} spots={allSpots} onClose={close}
          onSave={(c) => {
            const rec = stamp(c);
            const exists = log.catches.some(x => x.id === rec.id);
            putLog({ ...log, catches: exists ? log.catches.map(x => x.id === rec.id ? rec : x) : [...log.catches, rec] });
            close();
          }}
          onDelete={(id) => { putLog({ ...log, catches: log.catches.filter(c => c.id !== id) }); close(); }} />
      )}
      {modal?.type === "addSpot" && (
        <AddSpotWizard allSpecies={allSpecies} onClose={close}
          onDone={(s) => { putCatalog({ ...catalog, spots: [...catalog.spots, s] }); close(); }} />
      )}
      {modal?.type === "addSpecies" && (
        <AddSpeciesWizard onClose={close}
          onDone={(s) => { putCatalog({ ...catalog, species: [...catalog.species, s] }); close(); }} />
      )}
      {modal?.type === "addBait" && (
        <AddBaitWizard allSpecies={allSpecies} onClose={close}
          onDone={(b) => { putCatalog({ ...catalog, baits: [...catalog.baits, b] }); close(); }} />
      )}
      {modal?.type === "sync" && (
        <SyncPanel sync={sync} setSync={setSync} log={log} catalog={catalog}
          applyRemote={applyRemote} allSpecies={allSpecies} allBaits={allBaits} onClose={close} />
      )}
      {modal?.type === "station" && (
        <StationPicker spot={modal.payload} onClose={close}
          onChoose={(stationId) => {
            const sp = modal.payload;
            if (sp.custom) {
              putCatalog({ ...catalog, spots: catalog.spots.map(x =>
                x.id === sp.id ? { ...x, hydroStation: stationId, updatedAt: Date.now() } : x) });
            } else {
              // Built-in spots are overridden by storing a slim custom copy.
              const existing = (catalog.spots || []).find(x => x.id === sp.id);
              const patched = { ...(existing || sp), id: sp.id, custom: true, _v: SCHEMA_VERSION,
                hydroStation: stationId, updatedAt: Date.now() };
              putCatalog({ ...catalog, spots: existing
                ? catalog.spots.map(x => x.id === sp.id ? patched : x)
                : [...catalog.spots, patched] });
            }
            close();
          }} />
      )}
      {modal?.type === "community" && (
        <CommunityPanel catalog={catalog} log={log} onClose={close}
          onImport={(next) => {
            putCatalog({ ...EMPTY_CATALOG, ...next.catalog });
            putLog(next.log);
          }} />
      )}
      {modal?.type === "drive" && (
        <DrivePanel drive={drive} setDrive={setDrive} catalog={catalog} log={log} onClose={close} />
      )}
      {modal?.type === "licence" && (
        <LicencePanel lic={lic} setLic={setLic} onClose={close} />
      )}
      {modal?.type === "addKnot" && (
        <AddKnotWizard onClose={close}
          onDone={(k) => { putCatalog({ ...catalog, knots: [...(catalog.knots || []), k] }); close(); }} />
      )}
      {modal?.type === "addTip" && (
        <AddTipWizard onClose={close}
          onDone={(t) => { putCatalog({ ...catalog, tips: [...catalog.tips, t] }); close(); }} />
      )}

      <nav className="tabbar">
        {[["spots", "Spots"], ["guide", "Guide"], ["log", "Log"], ["stats", "Stats"], ["learn", "Learn"], ["data", "Data"]].map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)} aria-current={tab === k}>
            <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[k]} /></svg>
            {l}
          </button>
        ))}
      </nav>
    </div>
  );
}
