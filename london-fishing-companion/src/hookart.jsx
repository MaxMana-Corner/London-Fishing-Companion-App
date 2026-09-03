import React from "react";

/* ============================================================
   hookart.jsx — drawings for the Hooks & rigs page.

   Two families:
     HookArt — hook patterns at a size you can compare. Drawn to
               the feature that distinguishes each one: the barbs
               on a baitholder shank, the Z-bend on an offset
               worm hook, the inturned point of a circle hook.
     RigArt  — how the terminal tackle assembles, top to bottom,
               so "running lead" or "slip float" stops being a
               phrase and becomes a picture.

   Same conventions as baitart.jsx: vector only, no external
   images, your rod is always off to the top left.
   ============================================================ */

const STEEL = "#4A5A62";      // darkened: thin strokes washed out in sunlight
const STEEL_D = "#2B3940";
const BRASS = "#B98A38";
const LEAD = "#8A8F92";
const LINE = "#3E4A3B";
const WATER = "#9FC0C8";
const NOTE = "#59654F";

const Mono = ({ d, w = 1.5, o = 0.8, dash }) => (
  <path d={d} stroke={LINE} strokeWidth={w} fill="none" opacity={o}
    strokeLinecap="round" strokeDasharray={dash} />
);

const Caption = ({ children, y = 150 }) => (
  <text x="150" y={y} fontSize="9.2" textAnchor="middle" fill={NOTE}>{children}</text>
);

const Eye = ({ x, y, r = 5, c = STEEL }) => (
  <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth="3.2" />
);

/* Callout: a ring round the feature that identifies this hook, a
   leader line, and a word. Every drawing gets exactly one, so the
   set reads as a comparable series rather than eleven pictures. */
const CALL = "#B4551E";
const Callout = ({ cx, cy, r = 15, tx, ty, label, anchor = "start" }) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={CALL} strokeWidth="2" strokeDasharray="4 3" />
    <path d={`M${cx + (anchor === "start" ? r : -r)} ${cy} L${tx + (anchor === "start" ? -6 : 6)} ${ty - 4}`}
      stroke={CALL} strokeWidth="1.6" fill="none" />
    <text x={tx} y={ty} fontSize="11.5" fill={CALL} textAnchor={anchor} fontWeight="600">{label}</text>
  </g>
);

/* A consistent 100%-scale reference so the eleven patterns can be
   compared by eye. Without this each drawing fills its own frame
   and a size 12 looks the same as a 4/0. */
const ScaleBar = ({ rel, note }) => (
  <g opacity="0.85">
    <path d={`M22 148 L${22 + rel * 84} 148`} stroke={NOTE} strokeWidth="2.4" strokeLinecap="round" />
    <path d="M22 144 L22 152" stroke={NOTE} strokeWidth="1.6" />
    <path d={`M${22 + rel * 84} 144 L${22 + rel * 84} 152`} stroke={NOTE} strokeWidth="1.6" />
    <text x={22 + rel * 84 + 8} y={152} fontSize="9.5" fill={NOTE}>{note}</text>
  </g>
);

/* ---------------- hook patterns ----------------
   All drawn on a 300x165 stage, eye at the top, so the shapes
   can be compared like a tackle-shop card. */

const HOOKS = {
  baitholder: (fine) => (
    <>
      <Eye x={150} y={26} />
      {/* the two barbs on the shank are the whole point — they stop
          a soft worm sliding down into the bend */}
      <path d="M150 31 L150 92 Q150 122 118 122 Q88 122 88 96 L88 74"
        stroke={STEEL} strokeWidth={fine ? 2.4 : 3.4} fill="none" strokeLinecap="round" />
      <path d="M88 74 L96 88 M88 74 L79 88" stroke={STEEL} strokeWidth={fine ? 2 : 2.8}
        fill="none" strokeLinecap="round" />
      <path d="M150 52 L162 61 M150 68 L162 77" stroke={STEEL_D} strokeWidth="2.6" strokeLinecap="round" />
      <Callout cx={156} cy={64} r={17} tx={196} ty={54} label="shank barbs" />
      <ScaleBar rel={fine ? 0.34 : 0.5} note={fine ? "size 10–12" : "size 8"} />
      <Caption y={138}>{fine ? "fine wire · a worm fragment stays put" : "the barbs stop a worm sliding into the bend"}</Caption>
    </>
  ),

  baitholderworm: (
    <>
      <Eye x={152} y={22} />
      {/* long shank so a whole crawler or a minnow sits straight
          instead of bunching up round the bend */}
      <path d="M152 27 L152 100 Q152 130 118 130 Q86 130 86 102 L86 80"
        stroke={STEEL} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d="M86 80 L95 95 M86 80 L76 94" stroke={STEEL} strokeWidth="2.8" fill="none" strokeLinecap="round" />
      <path d="M152 48 L163 57 M152 66 L163 75" stroke={STEEL_D} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M152 36 q-6 26 0 52 q6 24 -14 34" stroke="#8E5442" strokeWidth="11"
        fill="none" strokeLinecap="round" opacity=".92" />
      <Callout cx={152} cy={64} r={20} tx={198} ty={50} label="long shank" />
      <ScaleBar rel={0.66} note="size 4–6" />
      <Caption y={148}>a whole crawler threaded straight down the shank</Caption>
    </>
  ),

  widegape: (
    <>
      <Eye x={158} y={26} />
      {/* wide gap between point and shank — room for a bait and
          still enough steel to find a hold */}
      <path d="M158 31 L158 86 Q158 124 116 124 Q74 124 74 88 L74 62"
        stroke={STEEL} strokeWidth="3.6" fill="none" strokeLinecap="round" />
      <path d="M74 62 L83 77 M74 62 L64 76" stroke={STEEL} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Mono d="M78 100 L154 100" w={1.6} o={0.75} dash="5 4" />
      <path d="M78 94 L78 106 M154 94 L154 106" stroke={CALL} strokeWidth="2" />
      <text x="116" y="118" fontSize="11.5" textAnchor="middle" fill={CALL} fontWeight="600">wide gape</text>
      <Callout cx={116} cy={100} r={44} tx={214} ty={92} label="room for bait" />
      <ScaleBar rel={0.62} note="size 6" />
      <Caption y={138}>room for a bait and still enough steel to hold</Caption>
    </>
  ),

  octopus: (
    <>
      {/* short shank, up-turned eye — sits in the middle of a
          wacky worm without fouling either end */}
      <g transform="rotate(-22 152 30)"><Eye x={152} y={30} /></g>
      <path d="M152 36 L152 78 Q152 112 118 112 Q86 112 86 84 L86 60"
        stroke={STEEL} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d="M86 60 L95 75 M86 60 L76 74" stroke={STEEL} strokeWidth="2.8" fill="none" strokeLinecap="round" />
      <path d="M118 96 q-22 -8 -46 -4 M118 96 q22 -8 48 -2" stroke="#5F6B42" strokeWidth="11"
        fill="none" strokeLinecap="round" opacity=".55" />
      <Callout cx={152} cy={56} r={16} tx={196} ty={40} label="short shank" />
      <ScaleBar rel={0.72} note="size 1–1/0" />
      <Caption y={138}>sits mid-worm so both ends stay free to shimmy</Caption>
    </>
  ),

  offset: (
    <>
      <Eye x={166} y={24} />
      {/* the Z-bend below the eye is what locks a soft plastic in
          place so the rig stays weedless */}
      <path d="M166 29 L166 40 L152 47 L166 54 L166 92 Q166 128 122 128 Q80 128 80 92 L80 66"
        stroke={STEEL} strokeWidth="3.4" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M80 66 L90 81 M80 66 L69 80" stroke={STEEL} strokeWidth="2.8" fill="none" strokeLinecap="round" />
      <Callout cx={159} cy={47} r={15} tx={200} ty={44} label="Z-bend" />
      <ScaleBar rel={0.92} note="size 3/0–4/0" />
      <Caption y={138}>the bend grips the plastic · point buried, weedless</Caption>
    </>
  ),

  circle: (
    <>
      <Eye x={158} y={28} />
      {/* the point turns back toward the shank — it cannot find
          purchase until it slides to the corner of the jaw */}
      <path d="M158 33 L158 80 Q158 122 116 122 Q76 122 76 84 Q76 60 100 56"
        stroke={STEEL} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d="M100 56 L92 68 M100 56 L104 70" stroke={STEEL} strokeWidth="2.8" fill="none" strokeLinecap="round" />
      <Callout cx={100} cy={58} r={16} tx={54} ty={40} label="point turns in" anchor="end" />
      <ScaleBar rel={0.82} note="size 1/0–3/0" />
      <text x="150" y="138" fontSize="11" textAnchor="middle" fill="#8E2F2F" fontWeight="600">
        do not strike — just lift and reel
      </text>
    </>
  ),

  jighead: (
    <>
      <Mono d="M150 8 L150 26" dash="4 4" />
      {/* weight moulded onto the hook shank at the eye — the bait
          swims nose-down and you keep bottom contact */}
      <circle cx="150" cy="44" r="20" fill="#8FA06B" />
      <circle cx="150" cy="44" r="20" fill="none" stroke="#00000022" strokeWidth="1.6" />
      <circle cx="159" cy="37" r="4.6" fill="#F6F4E8" stroke="#4A5A4A" strokeWidth="1.2" />
      <circle cx="159" cy="37" r="2.3" fill="#20281E" />
      <path d="M150 24 L150 16" stroke={STEEL} strokeWidth="2.6" />
      <Eye x={150} y={14} r={4.4} />
      <path d="M150 62 L150 96 Q150 124 120 124 Q92 124 92 100 L92 80"
        stroke={STEEL} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M92 80 L101 94 M92 80 L82 93" stroke={STEEL} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <Callout cx={150} cy={44} r={26} tx={196} ty={34} label="moulded weight" />
      <ScaleBar rel={0.76} note="size 2–1/0" />
      <Caption y={138}>weight and hook are one piece · swims nose-down</Caption>
    </>
  ),

  tubehead: (
    <>
      {/* same idea, but the head is small enough to hide inside a
          hollow tube, with the eye poking out the side */}
      <path d="M196 44 q0 -20 -44 -20 q-50 0 -50 22 q0 18 50 18 q44 0 44 -20 z"
        fill="#7A8B52" opacity=".45" stroke="#5C6B3A" strokeWidth="1.4" />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <path key={i} d={`M102 ${50 + i * 3} q-24 ${(i - 2.5) * 6} -42 ${(i - 2.5) * 9}`}
          stroke="#5C6B3A" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity=".55" />
      ))}
      <circle cx="168" cy="40" r="13" fill={LEAD} />
      <circle cx="174" cy="35" r="3" fill="#F6F4E8" stroke="#4A5A4A" strokeWidth="1.2" />
      <path d="M168 27 L182 18" stroke={STEEL} strokeWidth="2.6" />
      <Eye x={185} y={16} r={4} />
      <path d="M168 53 L168 84 Q168 110 142 110 Q118 110 118 88 L118 70"
        stroke={STEEL} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M118 70 L126 83 M118 70 L109 82" stroke={STEEL} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <Callout cx={168} cy={40} r={19} tx={214} ty={26} label="head hidden inside" />
      <ScaleBar rel={0.72} note="size 1/0" />
      <Caption y={138}>eye pokes out the side · the tube falls nose-first</Caption>
    </>
  ),

  wiretrace: (
    <>
      <Mono d="M20 22 L96 32" dash="5 4" />
      {/* the crimp and the trace are the difference between landing
          a pike and losing your lure in one */}
      <path d="M96 32 L232 62" stroke={STEEL_D} strokeWidth="3.2" fill="none" />
      <path d="M96 32 L232 62" stroke="#B8C2C6" strokeWidth="1.2" fill="none" strokeDasharray="2 3" />
      <rect x="92" y="24" width="18" height="14" rx="3" fill={LEAD} stroke={STEEL_D} strokeWidth="1.2" />
      <rect x="222" y="54" width="18" height="14" rx="3" fill={LEAD} stroke={STEEL_D} strokeWidth="1.2" />
      <Callout cx={101} cy={31} r={15} tx={58} ty={18} label="crimp" anchor="end" />
      <ScaleBar rel={0.78} note="size 1/0–2/0" />
      <path d="M240 68 L240 96 Q240 122 210 122 Q182 122 182 98 L182 78"
        stroke={STEEL} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M182 78 L191 92 M182 78 L172 91" stroke={STEEL} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <text x="150" y="152" fontSize="9.2" textAnchor="middle" fill="#8E2F2F">
        pike teeth cut straight through mainline
      </text>
    </>
  ),

  treble: (
    <>
      <Eye x={150} y={18} />
      <path d="M150 23 L150 84" stroke={STEEL} strokeWidth="3.8" strokeLinecap="round" />
      {/* An anchor has straight arms meeting in a V. A treble has three
          rounded U-bends offset around the shank, each with a barb.
          The near point is drawn lighter so it reads as coming forward. */}
      {[-1, 1].map((dir, i) => (
        <g key={i}>
          <path d={`M150 84 Q${150 + 34 * dir} 100 ${150 + 34 * dir} 74 L${150 + 34 * dir} 56`}
            stroke={STEEL} strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M${150 + 34 * dir} 56 L${150 + 44 * dir} 66 M${150 + 34 * dir} 56 L${150 + 24 * dir} 66`}
            stroke={STEEL} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d={`M${150 + 34 * dir} 62 L${150 + 21 * dir} 74`}
            stroke={STEEL_D} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      ))}
      <path d="M150 84 Q178 104 186 82 L192 62" stroke="#9AA6AC" strokeWidth="3"
        fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M192 62 L200 72 M192 62 L184 71" stroke="#9AA6AC" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M192 68 L181 78" stroke="#7C888E" strokeWidth="2.2" strokeLinecap="round" />
      <Callout cx={150} cy={58} r={30} tx={210} ty={30} label="three points" />
      <ScaleBar rel={0.56} note="size 6–10" />
      <text x="150" y="138" fontSize="11" textAnchor="middle" fill="#8E2F2F" fontWeight="600">
        crush the barbs if you are releasing
      </text>
    </>
  ),
};

export function HookArt({ type, h = 132 }) {
  const draw = type === "finewire" ? HOOKS.baitholder(true)
    : type === "baitholder" ? HOOKS.baitholder(false)
      : HOOKS[type] || HOOKS.baitholder(false);
  return (
    <svg viewBox="0 0 300 165" style={{ width: "100%", height: h, display: "block" }}
      role="img" aria-label={`${type} hook`}>{draw}</svg>
  );
}

/* ---------------- rigs ----------------
   Assembled terminal tackle, top to bottom. Waterline drawn where
   it helps you read what is floating and what is on the bottom. */

const Waterline = ({ y }) => (
  <path d={`M2 ${y} q20 -5 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0`}
    stroke={WATER} strokeWidth="2.2" fill="none" opacity=".85" />
);
const Bed = ({ y }) => (
  <>
    <path d={`M0 ${y} q30 -7 60 -1 t60 -2 t60 1 t60 -3 t60 2 L300 200 L0 200 Z`} fill="#CFC7A8" opacity=".5" stroke="#4A5A4A" strokeWidth="1.2" />
    <path d={`M0 ${y} q30 -7 60 -1 t60 -2 t60 1 t60 -3 t60 2`} stroke="#A99C72" strokeWidth="1.4" fill="none" />
  </>
);
const Shot = ({ x, y, r = 5 }) => (
  <><circle cx={x} cy={y} r={r} fill={LEAD} /><path d={`M${x - r} ${y} L${x + r} ${y}`} stroke="#5F656A" strokeWidth="1" /></>
);
const Bead = ({ x, y }) => <circle cx={x} cy={y} r="4.5" fill="#C0532E" />;
const Swivel = ({ x, y }) => (
  <g>
    <rect x={x - 7} y={y - 5} width="14" height="10" rx="5" fill={LEAD} stroke={STEEL_D} strokeWidth="1.1" />
    <circle cx={x - 11} cy={y} r="4" fill="none" stroke={STEEL_D} strokeWidth="1.8" />
    <circle cx={x + 11} cy={y} r="4" fill="none" stroke={STEEL_D} strokeWidth="1.8" />
  </g>
);
const SmallHook = ({ x, y, s = 0.62 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <circle cx="0" cy="0" r="4.2" fill="none" stroke={STEEL} strokeWidth="2.6" />
    <path d="M0 4 L0 34 Q0 54 -16 54 Q-30 54 -30 40 L-30 30" stroke={STEEL} strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M-30 30 L-24 40 M-30 30 L-36 40" stroke={STEEL} strokeWidth="2.4" fill="none" strokeLinecap="round" />
  </g>
);

const RIGS = {
  float: (
    <>
      <Waterline y={54} />
      <Mono d="M150 4 L150 30" dash="5 4" />
      {/* fixed float: depth is set by where the float sits on the line */}
      <ellipse cx="150" cy="44" rx="13" ry="17" fill="#D8483A" />
      <path d="M137 44 a13 17 0 0 0 26 0 z" fill="#EFEFE4" stroke="#4A5A4A" strokeWidth="1.2" />
      <path d="M150 27 L150 20" stroke={LINE} strokeWidth="2" />
      <Mono d="M150 61 L150 118" o={0.9} />
      <Shot x={150} y={92} r={4.5} />
      <SmallHook x={150} y={118} />
      <Mono d="M186 61 L186 118" w={1} o={0.4} dash="3 3" />
      <text x="196" y="94" fontSize="9.5" fill={NOTE}>depth</text>
      <Caption y={158}>the float is set to the depth you want</Caption>
    </>
  ),

  slipfloat: (
    <>
      <Waterline y={54} />
      <Mono d="M150 4 L150 34" dash="5 4" />
      {/* the stop knot decides the depth; the float slides down to
          the weight for casting, so you can fish deeper than your rod */}
      <path d="M142 20 q8 -7 16 0" stroke="#8E2F2F" strokeWidth="2.6" fill="none" />
      <text x="176" y="22" fontSize="9.5" fill="#8E2F2F">stop knot</text>
      <Bead x={150} y={31} />
      <ellipse cx="150" cy="48" rx="12" ry="18" fill="#D8483A" />
      <path d="M138 48 a12 18 0 0 0 24 0 z" fill="#EFEFE4" stroke="#4A5A4A" strokeWidth="1.2" />
      <circle cx="150" cy="48" r="3" fill="none" stroke={LINE} strokeWidth="1.4" />
      <Mono d="M150 66 L150 122" o={0.9} />
      <Shot x={150} y={98} r={5} />
      <SmallHook x={150} y={122} />
      <path d="M110 40 q-14 22 0 44" stroke={BRASS} strokeWidth="1.6" fill="none" strokeDasharray="3 3" />
      <text x="86" y="66" fontSize="9.5" fill={NOTE} textAnchor="end">slides</text>
      <Caption y={158}>slides for the cast, stops at the knot</Caption>
    </>
  ),

  running: (
    <>
      <Bed y={116} />
      {/* the lead is free on the mainline, so a carp picking the
          bait up feels nothing and keeps moving */}
      <Mono d="M8 20 L120 76" dash="5 4" />
      <ellipse cx="132" cy="84" rx="20" ry="13" fill={LEAD} />
      <circle cx="132" cy="84" r="4" fill="#E3E7DE" stroke="#4A5A4A" strokeWidth="1.2" />
      <Bead x={158} y={92} />
      <Swivel x={180} y={98} />
      <Mono d="M192 100 L246 112" o={0.9} />
      <SmallHook x={248} y={110} s={0.55} />
      <ellipse cx="240" cy="128" rx="9" ry="6.5" fill="#E3C246" stroke="#A98C2C" strokeWidth="1" />
      <path d="M132 71 L132 62" stroke={LINE} strokeWidth="1.2" opacity=".6" />
      <text x="132" y="58" fontSize="9.5" textAnchor="middle" fill={NOTE}>line runs through</text>
      <Caption y={158}>the fish moves off without feeling the lead</Caption>
    </>
  ),

  weightless: (
    <>
      <Waterline y={26} />
      {/* nothing but line, hook and plastic — the slow flutter down
          is the entire trigger */}
      <Mono d="M150 4 L150 40" dash="5 4" />
      <path d="M96 74 q54 -12 110 4" stroke="#5F6B42" strokeWidth="13" fill="none" strokeLinecap="round" />
      <path d="M96 74 q54 -12 110 4" stroke="#3A4528" strokeWidth="13" fill="none"
        strokeLinecap="round" opacity=".25" />
      <SmallHook x={150} y={46} s={0.62} />
      <circle cx="150" cy="72" r="9" fill="none" stroke="#C25A3A" strokeWidth="2.6" />
      {[0, 1, 2].map(i => (
        <path key={i} d={`M${118 + i * 34} 96 q-8 12 0 24`} stroke={WATER} strokeWidth="1.8"
          fill="none" strokeDasharray="3 4" opacity=".8" />
      ))}
      <text x="150" y="140" fontSize="9.5" textAnchor="middle" fill={NOTE}>falls slowly, on a slack line</text>
      <Caption y={158}>watch the line, not the lure</Caption>
    </>
  ),

  splitshot: (
    <>
      {/* two small shot beat one big one: the bait still moves */}
      <Mono d="M40 14 Q110 44 150 58" dash="5 4" />
      <Shot x={128} y={50} r={4.5} />
      <Shot x={150} y={58} r={4.5} />
      <Mono d="M150 58 Q198 82 226 104" o={0.9} />
      <SmallHook x={228} y={104} s={0.58} />
      <path d="M226 122 q-16 10 -32 4 q12 -14 32 -4 z" fill="#8C5A4A" />
      <path d="M10 96 q40 8 80 0 t80 0" stroke={WATER} strokeWidth="1.8" fill="none" opacity=".4" />
      <text x="96" y="42" fontSize="9.5" textAnchor="end" fill={NOTE}>two small</text>
      <Caption y={158}>enough weight to get down, not enough to deaden it</Caption>
    </>
  ),

  swivel: (
    <>
      {/* a spinning lure will twist your mainline into scrap
          without one of these */}
      <Mono d="M14 46 L118 46" dash="5 4" />
      <text x="66" y="34" fontSize="9.5" textAnchor="middle" fill={NOTE}>mainline</text>
      <Swivel x={136} y={46} />
      <Mono d="M150 46 L216 46" o={0.9} />
      <text x="184" y="34" fontSize="9.5" textAnchor="middle" fill={NOTE}>leader</text>
      <ellipse cx="244" cy="60" rx="20" ry="11" fill="#C3CAD0" stroke={STEEL_D} strokeWidth="1.3"
        transform="rotate(22 244 60)" />
      <path d="M216 46 L232 52" stroke={STEEL_D} strokeWidth="2" />
      <path d="M110 78 q26 10 52 0" stroke={BRASS} strokeWidth="1.6" fill="none" strokeDasharray="3 3" />
      <text x="136" y="96" fontSize="9.5" textAnchor="middle" fill={NOTE}>the barrel turns</text>
      <Caption y={158}>stops a spinning blade twisting your line</Caption>
    </>
  ),

  leader: (
    <>
      <Mono d="M12 40 L104 52" dash="5 4" />
      <text x="52" y="30" fontSize="9.5" textAnchor="middle" fill={NOTE}>braid or mono</text>
      <Swivel x={122} y={55} />
      {/* wire or heavy fluoro between the swivel and the lure */}
      <path d="M136 57 L236 78" stroke={STEEL_D} strokeWidth="3" fill="none" />
      <path d="M136 57 L236 78" stroke="#B8C2C6" strokeWidth="1.2" strokeDasharray="2 3" />
      <text x="182" y="102" fontSize="9.5" textAnchor="middle" fill={NOTE}>wire or 40 lb fluoro</text>
      <ellipse cx="256" cy="88" rx="18" ry="10" fill={BRASS} stroke={STEEL_D} strokeWidth="1.2"
        transform="rotate(24 256 88)" />
      <path d="M188 34 q34 -12 62 6" stroke="#8E2F2F" strokeWidth="1.6" fill="none" strokeDasharray="3 3" />
      <text x="150" y="152" fontSize="9.2" textAnchor="middle" fill="#8E2F2F">
        not optional at Fanshawe, Westminster or Dorchester
      </text>
    </>
  ),
};

export function RigArt({ type, h = 128 }) {
  const draw = RIGS[type];
  if (!draw) return null;
  return (
    <svg viewBox="0 0 300 165" style={{ width: "100%", height: h, display: "block" }}
      role="img" aria-label={`${type} rig`}>{draw}</svg>
  );
}

export const HOOK_TYPES = Object.keys(HOOKS).concat("finewire");
export const RIG_TYPES = Object.keys(RIGS);
