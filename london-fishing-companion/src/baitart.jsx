import React from "react";

/* ============================================================
   baitart.jsx — illustrations for every bait and lure.

   Vector, not photographs: it keeps the file self-contained and
   offline, avoids other people's copyrighted product shots, and
   lets each drawing show the thing that actually matters — where
   the hook sits, which way the bait falls, what the rig looks
   like assembled. A catalogue photo rarely shows that.

   Users can attach their own photos on top of these; see the
   photo field on any bait.
   ============================================================ */

const STEEL = "#6C7A80";
const STEEL_D = "#41525A";
const BRASS = "#B98A38";
const BRASS_L = "#DCBA72";
const LEAD = "#8A8F92";
const LINE = "#3E4A3B";

/* ---------- shared parts ---------- */

const Line = ({ d, w = 1.4, o = 0.75 }) => (
  <path d={d} stroke={LINE} strokeWidth={w} fill="none" opacity={o} strokeLinecap="round" />
);

/* A J hook drawn from the eye down the shank, round the bend, to the point. */
function Hook({ x = 0, y = 0, s = 1, flip = false, color = STEEL }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <circle cx="0" cy="0" r="4.2" fill="none" stroke={color} strokeWidth="2.4" />
      <path d="M0 4 L0 34 Q0 54 -16 54 Q-30 54 -30 40 L-30 30"
        stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M-30 30 L-25 39 M-30 30 L-35 39" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Treble({ x = 0, y = 0, s = 1, color = STEEL }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="0" cy="-14" r="4" fill="none" stroke={color} strokeWidth="2" />
      <path d="M0 -10 L0 10" stroke={color} strokeWidth="2.4" />
      {[-1, 1].map((d, i) => (
        <path key={i} d={`M0 10 Q${14 * d} 10 ${14 * d} -4`} stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      ))}
      <path d="M0 10 L0 -2" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </g>
  );
}

/* Lead jig head: painted ball with a collar and the hook coming out. */
function JigHead({ x = 0, y = 0, s = 1, colour = "#8FA06B" }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="0" cy="0" r="14" fill={colour} />
      <circle cx="0" cy="0" r="14" fill="none" stroke="#00000022" strokeWidth="1.5" />
      <circle cx="7" cy="-5" r="3.4" fill="#F6F4E8" stroke="#4A5A4A" strokeWidth="1.2" />
      <circle cx="7.6" cy="-5" r="2" fill="#20281E" />
      <path d="M-13 -8 q-9 -4 -15 -3" stroke={STEEL} strokeWidth="2.4" fill="none" />
      <circle cx="-29" cy="-11" r="3.6" fill="none" stroke={STEEL} strokeWidth="2" />
    </g>
  );
}

function Blade({ x, y, rx = 9, ry = 17, rot = 0, fill = "#C9CFD2" }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <ellipse cx="0" cy="0" rx={rx} ry={ry} fill={fill} stroke="#00000030" strokeWidth="1.2" />
      <ellipse cx={-rx * 0.3} cy={-ry * 0.25} rx={rx * 0.35} ry={ry * 0.4} fill="#FFFFFF" opacity=".45" stroke="#4A5A4A" strokeWidth="1.2" />
    </g>
  );
}

function Float({ x, y, s = 1, top = "#C0392B" }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 -30 L0 -12" stroke={LINE} strokeWidth="2" />
      <ellipse cx="0" cy="2" rx="9" ry="16" fill="#F2EDE0" stroke="#00000025" strokeWidth="1.2" />
      <path d="M-9 -4 a9 16 0 0 1 18 0 L9 -6 a9 16 0 0 0 -18 0 Z" fill={top} />
      <ellipse cx="0" cy="-11" rx="9" ry="5" fill={top} />
      <path d="M0 18 L0 30" stroke={LINE} strokeWidth="2" />
    </g>
  );
}

const Skirt = ({ x, y, colour = "#E8E4D4", n = 7, len = 30 }) => (
  <g>
    {Array.from({ length: n }).map((_, i) => {
      const spread = (i - (n - 1) / 2) * 5;
      return (
        <path key={i} d={`M${x} ${y} q${-len * 0.5} ${spread * 0.8} ${-len} ${spread * 1.6}`}
          stroke={colour} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".92" />
      );
    })}
  </g>
);

/* Segmented soft-plastic worm body. */
const WormBody = ({ d, colour, w = 15 }) => (
  <>
    <path d={d} stroke={colour} strokeWidth={w} fill="none" strokeLinecap="round" />
    <path d={d} stroke="#00000018" strokeWidth={w} fill="none" strokeLinecap="round" strokeDasharray="2 7" />
  </>
);

/* ---------- one drawing per bait ---------- */

const ART = {
  tube: () => (
    <>
      <Line d="M8 30 L84 44" />
      <path d="M96 36 q64 -12 104 0 q10 3 10 22 q0 19 -10 22 q-40 12 -104 0 Z" fill="#7C8B4E" />
      <path d="M96 36 q64 -12 104 0 q10 3 10 22 q0 19 -10 22 q-40 12 -104 0 Z" fill="none" stroke="#00000022" strokeWidth="1.4" />
      <Skirt x={98} y={58} colour="#6C7A42" n={9} len={54} />
      <circle cx="176" cy="50" r="12" fill={LEAD} opacity=".55" />
      <text x="176" y="54" fontSize="8.5" textAnchor="middle" fill="#2A3327" opacity=".7">jig</text>
      <Hook x={214} y={40} s={0.85} />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">jig head sits inside — falls nose-down like a crayfish</text>
    </>
  ),
  grub: () => (
    <>
      <Line d="M8 26 L58 34" />
      <JigHead x={78} y={44} s={1} colour="#8FA06B" />
      <WormBody d="M92 46 q46 4 76 8" colour="#9AA86E" w={17} />
      <path d="M168 54 q30 2 34 -16 q3 -16 -13 -18 q-13 -1 -12 12 q1 10 11 9"
        stroke="#9AA86E" strokeWidth="11" fill="none" strokeLinecap="round" />
      <Hook x={150} y={58} s={0.8} />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">the curly tail works on its own — no rod action needed</text>
    </>
  ),
  senko: () => (
    <>
      <Line d="M8 20 L128 40" />
      <circle cx="150" cy="52" r="9" fill="none" stroke="#C25A3A" strokeWidth="3" />
      <WormBody d="M60 66 q46 -20 90 -14 q44 6 90 26" colour="#6E7F4A" w={16} />
      <Hook x={150} y={40} s={0.9} />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">hooked mid-body — both ends shimmy on the fall</text>
    </>
  ),
  texas: () => (
    <>
      <Line d="M8 30 L60 40" />
      <path d="M62 40 L96 30 L96 52 Z" fill={LEAD} />
      <circle cx="96" cy="41" r="6" fill={LEAD} />
      <WormBody d="M104 44 q54 2 96 22" colour="#4C4030" w={15} />
      <path d="M200 66 q22 10 26 26" stroke="#4C4030" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M120 40 q14 22 34 20" stroke={STEEL} strokeWidth="2.6" fill="none" />
      <circle cx="118" cy="38" r="4" fill="none" stroke={STEEL} strokeWidth="2" />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">point buried in the plastic — comes through weed clean</text>
    </>
  ),
  frog: () => (
    <>
      <Line d="M8 24 L92 40" />
      <path d="M98 56 q10 -22 44 -22 q40 0 50 22 q-10 22 -50 22 q-34 0 -44 -22 Z" fill="#4E6B34" />
      <path d="M98 56 q10 -22 44 -22 q40 0 50 22 q-10 22 -50 22 q-34 0 -44 -22 Z" fill="none" stroke="#00000030" strokeWidth="1.4" />
      <circle cx="176" cy="46" r="5" fill="#F6F4E8" stroke="#4A5A4A" strokeWidth="1.2" /><circle cx="177" cy="46" r="2.8" fill="#20281E" />
      {[-1, 1].map((d, i) => (
        <path key={i} d={`M104 ${56 + d * 8} q-26 ${d * 10} -46 ${d * 4}`} stroke="#7A8C4A" strokeWidth="6" fill="none" strokeLinecap="round" />
      ))}
      <path d="M132 36 q10 -10 22 -2 M146 34 q10 -10 22 -2" stroke={STEEL} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">double hook rides up — walk it over matted pads</text>
    </>
  ),
  spinnerbait: () => (
    <>
      <Line d="M8 22 L86 34" />
      <path d="M92 40 L128 22 L206 22" stroke={STEEL_D} strokeWidth="3" fill="none" strokeLinejoin="round" />
      <path d="M92 40 L112 68" stroke={STEEL_D} strokeWidth="3" fill="none" />
      <circle cx="92" cy="40" r="5" fill="none" stroke={STEEL_D} strokeWidth="2.6" />
      <Blade x={210} y={26} rx={8} ry={20} rot={-18} />
      <Blade x={168} y={24} rx={7} ry={13} rot={-12} fill="#D8C27A" />
      <JigHead x={118} y={72} s={0.85} colour="#E9E7DC" />
      <Skirt x={130} y={78} colour="#D9E24E" n={8} len={46} />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">slow-roll over weed tops; bump cover to trigger it</text>
    </>
  ),
  chatterbait: () => (
    <>
      <Line d="M8 30 L58 40" />
      <path d="M62 44 L92 28 L100 48 L70 62 Z" fill="#8E9AA2" stroke="#3B4750" strokeWidth="1.6" />
      <JigHead x={120} y={54} s={0.95} colour="#C9C4B0" />
      <Skirt x={130} y={58} colour="#9E9A86" n={7} len={34} />
      <path d="M158 58 q34 2 52 6" stroke="#B4AF9A" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M210 64 q22 -10 24 4 q2 14 -20 8" fill="#B4AF9A" stroke="#6E6A58" strokeWidth="1.2" />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">you should feel it thrumming the whole way back</text>
    </>
  ),
  spinner: () => (
    <>
      <Line d="M8 40 L52 46" />
      <path d="M56 48 L232 56" stroke={STEEL_D} strokeWidth="2.6" />
      <circle cx="56" cy="48" r="5" fill="none" stroke={STEEL_D} strokeWidth="2.4" />
      <Blade x={106} y={72} rx={11} ry={19} rot={16} />
      <path d="M92 50 L102 60" stroke={STEEL_D} strokeWidth="2" />
      {[0, 1, 2].map(i => <circle key={i} cx={150 + i * 17} cy={52 + i * 0.8} r="8" fill={BRASS} stroke="#00000025" strokeWidth="1" />)}
      <Treble x={244} y={70} s={0.95} />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">retrieve just fast enough to feel the blade turn over</text>
    </>
  ),
  jerkbait: () => (
    <>
      <Line d="M8 30 L56 40" />
      <path d="M64 56 q40 -22 106 -18 q56 4 76 18 q-20 14 -76 18 q-66 4 -106 -18 Z" fill="#B9C3C7" stroke="#4A5A4A" strokeWidth="1.2" />
      <path d="M64 56 q40 -22 106 -18 q56 4 76 18 q-20 14 -76 18 q-66 4 -106 -18 Z" fill="none" stroke="#00000028" strokeWidth="1.3" />
      <path d="M64 44 q28 -6 64 -8 L128 22 q-38 4 -64 12 Z" fill="#3E4A3B" opacity=".55" />
      <path d="M60 58 L38 76" stroke={STEEL_D} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="222" cy="48" r="6" fill="#F6F4E8" stroke="#4A5A4A" strokeWidth="1.2" /><circle cx="223" cy="48" r="3.4" fill="#20281E" />
      <Treble x={118} y={82} s={0.8} /><Treble x={188} y={82} s={0.8} />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">twitch twice, then pause — the pause gets the bite</text>
    </>
  ),
  crank: () => (
    <>
      <Line d="M8 26 L48 36" />
      <path d="M74 56 q22 -30 76 -28 q60 2 82 28 q-22 26 -82 28 q-54 2 -76 -28 Z" fill="#C4712E" />
      <path d="M74 56 q22 -30 76 -28 q60 2 82 28 q-22 26 -82 28 q-54 2 -76 -28 Z" fill="none" stroke="#00000028" strokeWidth="1.3" />
      <path d="M72 42 L38 62 L46 78 L76 68 Z" fill="#5B6B70" stroke="#00000030" strokeWidth="1.2" />
      <circle cx="212" cy="46" r="6.5" fill="#F6F4E8" stroke="#4A5A4A" strokeWidth="1.2" /><circle cx="213" cy="46" r="3.6" fill="#20281E" />
      <Treble x={128} y={90} s={0.8} /><Treble x={196} y={88} s={0.8} />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">square lip deflects off rock — that is the trigger</text>
    </>
  ),
  shadrap: () => (
    <>
      <Line d="M8 28 L44 38" />
      <path d="M70 56 q22 -20 62 -18 q26 1 34 10 q-8 12 -34 14 q-40 2 -62 -6 Z" fill="#9BA86E" stroke="#4A5A4A" strokeWidth="1.2" />
      <path d="M172 52 q26 -6 54 2 q14 4 20 10 q-16 10 -34 10 q-30 0 -40 -8 Z" fill="#9BA86E" stroke="#4A5A4A" strokeWidth="1.2" />
      <circle cx="170" cy="57" r="4" fill="none" stroke={STEEL_D} strokeWidth="2" />
      <path d="M66 44 L36 62 L44 76 L72 66 Z" fill="#5B6B70" stroke="#00000030" strokeWidth="1.2" />
      <circle cx="222" cy="56" r="5" fill="#F6F4E8" stroke="#4A5A4A" strokeWidth="1.2" /><circle cx="223" cy="56" r="2.8" fill="#20281E" />
      <Treble x={120} y={82} s={0.72} /><Treble x={200} y={84} s={0.72} />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">jointed body — troll slowly along the old channel</text>
    </>
  ),
  popper: () => (
    <>
      <path d="M0 74 q75 -7 150 0 q75 7 150 0" stroke="#8FB4BE" strokeWidth="2" fill="none" opacity=".7" />
      <Line d="M8 22 L60 34" />
      <path d="M70 40 q40 -8 96 0 q34 6 34 16 q0 10 -34 16 q-56 8 -96 0 Z" fill="#EFEADB" stroke="#4A5A4A" strokeWidth="1.2" />
      <path d="M70 40 q40 -8 96 0 q34 6 34 16 q0 10 -34 16 q-56 8 -96 0 Z" fill="none" stroke="#00000025" strokeWidth="1.3" />
      <path d="M70 40 q-14 16 0 32 q12 -16 0 -32 Z" fill="#C9C2AC" stroke="#4A5A4A" strokeWidth="1.2" />
      <circle cx="186" cy="50" r="5" fill="#F6F4E8" stroke="#4A5A4A" strokeWidth="1.2" /><circle cx="187" cy="50" r="2.8" fill="#20281E" />
      <Treble x={120} y={82} s={0.8} />
      <g transform="translate(196 84)"><Treble x={0} y={0} s={0.8} />
        <Skirt x={8} y={6} colour="#D8CFAE" n={5} len={26} /></g>
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">cast, let the rings settle completely, then one sharp pop</text>
    </>
  ),
  spoon: () => (
    <>
      <Line d="M8 26 L64 38" />
      <circle cx="72" cy="40" r="6" fill="none" stroke={STEEL_D} strokeWidth="2.4" />
      <path d="M84 42 q46 -16 78 6 q30 20 6 40 q-30 24 -66 -6 q-28 -22 -18 -40 Z" fill={BRASS_L} stroke="#00000030" strokeWidth="1.3" />
      <path d="M100 48 q34 -10 56 8" stroke="#FFFFFF" strokeWidth="5" fill="none" opacity=".45" />
      {[0, 1, 2, 3].map(i => <circle key={i} cx={108 + i * 16} cy={66 + i * 3} r="4.5" fill="#B0392C" opacity=".8" />)}
      <circle cx="186" cy="80" r="6" fill="none" stroke={STEEL_D} strokeWidth="2.2" />
      <Treble x={212} y={84} s={0.9} />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">let it flutter on the pause — that draws pike in</text>
    </>
  ),
  jigminnow: () => (
    <>
      <Line d="M8 26 L60 38" />
      <JigHead x={84} y={48} s={1} colour="#D9C24A" />
      <path d="M98 50 q40 -14 84 -6 q30 6 40 12 q-10 8 -40 12 q-44 8 -84 -6 Z" fill="#A9B3AE" stroke="#4A5A4A" strokeWidth="1.2" />
      <path d="M98 50 q40 -14 84 -6 q30 6 40 12 q-10 8 -40 12 q-44 8 -84 -6 Z" fill="none" stroke="#00000022" strokeWidth="1.2" />
      <path d="M222 56 L246 42 L242 56 L246 72 Z" fill="#7C867F" />
      <Hook x={140} y={62} s={0.8} />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">minnow hooked through both lips so it swims naturally</text>
    </>
  ),
  minnow: () => (
    <>
      <path d="M0 30 q75 -6 150 0 q75 6 150 0" stroke="#8FB4BE" strokeWidth="2" fill="none" opacity=".7" />
      <Float x={70} y={26} s={0.95} />
      <Line d="M70 56 L150 76" />
      <circle cx="118" cy="66" r="5" fill={LEAD} />
      <path d="M158 82 q34 -12 70 -4 q24 6 32 10 q-8 6 -32 10 q-36 8 -70 -4 Z" fill="#A9B3AE" stroke="#4A5A4A" strokeWidth="1.2" />
      <path d="M228 88 L250 76 L247 88 L250 100 Z" fill="#7C867F" />
      <circle cx="216" cy="84" r="3.6" fill="#F6F4E8" stroke="#4A5A4A" strokeWidth="1.2" /><circle cx="216" cy="84" r="2" fill="#20281E" />
      <Hook x={176} y={70} s={0.7} />
      <text x="150" y="114" fontSize="10" textAnchor="middle" fill="#59654F">slip float — set the depth just over the weed</text>
    </>
  ),
  shiner: () => (
    <>
      <Line d="M8 24 L52 34" />
      <path d="M54 34 L108 46" stroke="#8C939A" strokeWidth="3" strokeDasharray="5 3" />
      <text x="78" y="30" fontSize="9" textAnchor="middle" fill="#59654F">wire trace</text>
      <path d="M112 62 q46 -22 96 -12 q34 7 44 14 q-10 7 -44 14 q-50 10 -96 -16 Z" fill="#B4BDB6" stroke="#4A5A4A" strokeWidth="1.2" />
      <path d="M112 62 q46 -22 96 -12 q34 7 44 14 q-10 7 -44 14 q-50 10 -96 -16 Z" fill="none" stroke="#00000022" strokeWidth="1.2" />
      <path d="M252 64 L280 48 L275 64 L280 80 Z" fill="#7C867F" />
      <circle cx="240" cy="60" r="4.4" fill="#F6F4E8" stroke="#4A5A4A" strokeWidth="1.2" /><circle cx="241" cy="60" r="2.4" fill="#20281E" />
      <Hook x={150} y={44} s={0.85} />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">give a pike line, then set once it turns away</text>
    </>
  ),
  crawler: () => (
    <>
      <Line d="M8 20 L52 30" />
      <ellipse cx="70" cy="34" rx="15" ry="9.5" fill={LEAD} stroke="#4A5054" strokeWidth="1.2" />
      <text x="70" y="18" fontSize="9" textAnchor="middle" fill="#59654F">sliding lead</text>
      <Line d="M86 36 L146 48" />
      <circle cx="150" cy="49" r="5" fill="none" stroke={STEEL_D} strokeWidth="2.2" />
      <Hook x={196} y={40} s={0.9} />
      {/* threaded head-first up the shank, tail left loose to move */}
      <path d="M190 60 q-26 20 -52 8 q-24 -11 -46 8 q-16 13 -30 7"
        stroke="#8E5442" strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d="M190 60 q-26 20 -52 8" stroke="#5F3527" strokeWidth="12"
        fill="none" strokeLinecap="round" opacity=".45" />
      <path d="M62 75 q-8 4 -14 2" stroke="#8E5442" strokeWidth="7" fill="none" strokeLinecap="round" />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">let a bite develop — do not strike at the first tap</text>
    </>
  ),
  worm: () => (
    <>
      <path d="M0 28 q75 -6 150 0 q75 6 150 0" stroke="#8FB4BE" strokeWidth="2" fill="none" opacity=".7" />
      <Float x={96} y={24} s={0.8} top="#C0392B" />
      <Line d="M96 50 L162 76" />
      <circle cx="134" cy="64" r="4" fill={LEAD} />
      <Hook x={176} y={70} s={0.55} />
      <path d="M164 82 q14 -8 24 0 q10 8 0 15" stroke="#9B5B4A" strokeWidth="8" fill="none" strokeLinecap="round" />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">size 8–12 hook, half an inch of worm — the first-fish rig</text>
    </>
  ),
  waxworm: () => (
    <>
      <Line d="M8 34 L112 54" />
      <Hook x={130} y={54} s={0.6} />
      <path d="M118 66 q12 -10 24 -2 q10 7 2 15 q-10 9 -21 1 q-9 -7 -5 -14" fill="#EFE3B8" stroke="#00000022" strokeWidth="1.2" />
      {[0, 1, 2, 3].map(i => <path key={i} d={`M${122 + i * 6} 66 q3 8 0 14`} stroke="#D8C98F" strokeWidth="1.6" fill="none" />)}
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">tip a small jig with one or two — panfish inhale it</text>
    </>
  ),
  microjig: () => (
    <>
      <Line d="M8 28 L74 44" />
      <circle cx="94" cy="52" r="11" fill="#C0416A" stroke="#7A2440" strokeWidth="1.4" />
      <circle cx="99" cy="48" r="2.8" fill="#F6F4E8" stroke="#4A5A4A" strokeWidth="1" />
      <path d="M104 54 q24 2 38 7" stroke="#D8D2BE" strokeWidth="10" fill="none"
        strokeLinecap="round" stroke-opacity="1" />
      <path d="M104 54 q24 2 38 7" stroke="#8A8470" strokeWidth="10" fill="none"
        strokeLinecap="round" opacity=".25" />
      <Skirt x={142} y={61} colour="#9C9682" n={8} len={40} />
      <Hook x={120} y={58} s={0.55} />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">barely move it — a slow draw with tiny shakes is enough</text>
    </>
  ),
  corn: () => (
    <>
      <Line d="M8 22 L52 32" />
      <ellipse cx="70" cy="36" rx="16" ry="10" fill={LEAD} />
      <text x="70" y="20" fontSize="9" textAnchor="middle" fill="#59654F">running lead</text>
      <Line d="M86 38 L146 54" />
      <Hook x={172} y={48} s={0.95} />
      <path d="M158 78 L192 86" stroke={LINE} strokeWidth="1.4" />
      {[0, 1, 2].map(i => (
        <g key={i}>
          <ellipse cx={172 + i * 13} cy={82 + i * 1.6} rx="7" ry="6" fill="#E8C24A" stroke="#00000025" strokeWidth="1" />
          <ellipse cx={170 + i * 13} cy={80 + i * 1.6} rx="2.6" ry="2.2" fill="#F4E08A" stroke="#4A5A4A" strokeWidth="1.2" />
        </g>
      ))}
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">corn hangs below a bare hook — the point stays free</text>
    </>
  ),
  bread: () => (
    <>
      <path d="M0 24 q75 -5 150 0 q75 5 150 0" stroke="#8FB4BE" strokeWidth="2" fill="none" opacity=".7" />
      <Line d="M8 18 L118 40" />
      <Hook x={140} y={42} s={0.95} />
      <path d="M118 56 q16 -20 44 -14 q30 6 26 26 q-4 20 -34 18 q-32 -2 -36 -30 Z" fill="#EFE0BC" stroke="#00000020" strokeWidth="1.2" />
      <path d="M126 54 q18 -12 38 -6 q20 6 18 20" stroke="#D8C08A" strokeWidth="2" fill="none" opacity=".8" />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">float a crust among fish already taking free offerings</text>
    </>
  ),
  liver: () => (
    <>
      <Line d="M8 22 L52 32" />
      <ellipse cx="70" cy="36" rx="15" ry="9" fill={LEAD} />
      <Line d="M86 38 L134 52" />
      <Hook x={166} y={46} s={1} />
      <path d="M132 62 q24 -22 52 -8 q26 14 12 34 q-16 22 -44 8 q-26 -14 -20 -34 Z" fill="#7E3B3B" stroke="#00000030" strokeWidth="1.2" />
      <path d="M144 66 q20 -10 34 4" stroke="#9E5252" strokeWidth="4" fill="none" opacity=".8" />
      <path d="M132 62 q26 8 52 -8 M138 84 q28 4 46 -12" stroke="#00000022" strokeWidth="1.4" fill="none" />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">cast gently — let the scent trail build</text>
    </>
  ),
  cutbait: () => (
    <>
      <Line d="M8 22 L52 32" />
      <ellipse cx="70" cy="36" rx="15" ry="9" fill={LEAD} />
      <Line d="M86 38 L140 54" />
      <g transform="translate(178 46)">
        <circle cx="0" cy="0" r="4.2" fill="none" stroke={STEEL} strokeWidth="2.4" />
        <path d="M0 4 L0 30 Q0 50 -18 50 Q-34 50 -32 34 Q-31 26 -22 26"
          stroke={STEEL} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M-22 26 L-16 32" stroke={STEEL} strokeWidth="2" strokeLinecap="round" />
      </g>
      <text x="196" y="30" fontSize="9" fill="#59654F">circle hook</text>
      <path d="M128 64 L172 58 L182 84 L138 92 Z" fill="#8C9AA0" stroke="#00000030" strokeWidth="1.2" />
      <path d="M134 70 L176 64 M136 78 L179 72" stroke="#6C7A80" strokeWidth="2" opacity=".7" />
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">do not strike — when it loads, lift and reel</text>
    </>
  ),
  crayfish: () => (
    <>
      <Line d="M8 26 L64 38" />
      <circle cx="80" cy="42" r="5" fill={LEAD} /><circle cx="98" cy="46" r="5" fill={LEAD} />
      <Hook x={128} y={50} s={0.8} />
      <path d="M126 74 q30 -14 62 -6 q26 7 32 14 q-8 8 -32 14 q-34 8 -62 -8 Z" fill="#A05C2E" />
      <path d="M220 82 q18 -14 26 -4 q6 10 -6 16 q-12 6 -20 -12 Z" fill="#8A4C24" />
      {[-1, 1].map((d, i) => (
        <g key={i}>
          <path d={`M132 ${74 + d * 8} q-24 ${d * 10} -34 ${d * 4}`} stroke="#A05C2E" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d={`M98 ${78 + d * 12} q-14 ${d * 2} -16 ${d * -6} q10 ${d * -4} 16 ${d * 6} Z`} fill="#A05C2E" />
        </g>
      ))}
      {[0, 1, 2].map(i => <path key={i} d={`M${160 + i * 18} 62 q2 24 0 26`} stroke="#00000022" strokeWidth="1.6" fill="none" />)}
      <text x="150" y="113" fontSize="9.2" textAnchor="middle" fill="#59654F">hooked through the tail — it backs off as they do</text>
    </>
  ),
};

/* Generic fallbacks so a bait the user adds still gets a drawing. */
const BY_KIND = {
  "Soft plastic": () => (<>
    <Line d="M8 30 L62 44" /><JigHead x={84} y={52} s={0.95} colour="#8FA06B" />
    <WormBody d="M98 54 q52 4 92 14" colour="#8B9A62" w={16} />
    <Hook x={158} y={64} s={0.8} />
  </>),
  "Hard bait": () => (<>
    <Line d="M8 28 L52 38" />
    <path d="M74 56 q34 -24 88 -20 q54 4 74 20 q-20 16 -74 20 q-54 4 -88 -20 Z" fill="#A9B3AE" stroke="#00000028" strokeWidth="1.3" />
    <path d="M72 44 L40 62 L48 76 L76 66 Z" fill="#5B6B70" />
    <circle cx="212" cy="48" r="5.5" fill="#F6F4E8" stroke="#4A5A4A" strokeWidth="1.2" /><circle cx="213" cy="48" r="3" fill="#20281E" />
    <Treble x={126} y={86} s={0.8} /><Treble x={192} y={86} s={0.8} />
  </>),
  "Topwater": () => (<>
    <path d="M0 70 q75 -7 150 0 q75 7 150 0" stroke="#8FB4BE" strokeWidth="2" fill="none" opacity=".7" />
    <Line d="M8 24 L62 36" />
    <path d="M72 42 q42 -8 96 0 q30 6 30 15 q0 9 -30 15 q-54 8 -96 0 Z" fill="#EFEADB" stroke="#00000025" strokeWidth="1.3" />
    <Treble x={128} y={80} s={0.8} />
  </>),
  "Wire bait": () => (<>
    <Line d="M8 24 L84 34" />
    <path d="M90 40 L126 24 L200 24" stroke={STEEL_D} strokeWidth="3" fill="none" />
    <path d="M90 40 L112 68" stroke={STEEL_D} strokeWidth="3" fill="none" />
    <Blade x={204} y={28} rx={8} ry={18} rot={-16} />
    <JigHead x={118} y={72} s={0.85} colour="#EDEBE0" /><Skirt x={130} y={78} colour="#E4E2D6" n={7} len={40} />
  </>),
  "Hardware": () => (<>
    <Line d="M8 30 L56 40" /><circle cx="64" cy="42" r="6" fill="none" stroke={STEEL_D} strokeWidth="2.4" />
    <path d="M78 44 q46 -16 76 6 q28 20 4 38 q-30 22 -64 -6 q-26 -22 -16 -38 Z" fill={BRASS_L} stroke="#00000030" strokeWidth="1.3" />
    <Treble x={208} y={82} s={0.9} />
  </>),
  "Live bait": () => (<>
    <Line d="M8 28 L118 50" /><Hook x={142} y={50} s={0.9} />
    <path d="M128 64 q22 -14 40 -2 q18 12 4 26 q-16 14 -34 4 q-18 -10 -10 -22" stroke="#9B5B4A" strokeWidth="12" fill="none" strokeLinecap="round" />
  </>),
  "Live bait rig": () => (<>
    <Line d="M8 26 L58 38" /><JigHead x={82} y={48} s={0.95} colour="#D9C24A" />
    <path d="M96 50 q40 -12 82 -4 q28 6 36 10 q-8 8 -36 12 q-42 8 -82 -6 Z" fill="#A9B3AE" stroke="#4A5A4A" strokeWidth="1.2" />
    <Hook x={136} y={60} s={0.75} />
  </>),
  "Bait": () => (<>
    <Line d="M8 24 L54 34" /><ellipse cx="72" cy="38" rx="15" ry="9" fill={LEAD} />
    <Line d="M88 40 L138 54" /><Hook x={166} y={48} s={0.95} />
    <ellipse cx="156" cy="80" rx="30" ry="20" fill="#C9A96B" stroke="#00000025" strokeWidth="1.2" />
  </>),
  "Fly": () => (<>
    <Line d="M8 34 L118 54" /><Hook x={140} y={54} s={0.65} />
    <path d="M124 66 q16 -10 30 -2" stroke="#6E7F4A" strokeWidth="10" fill="none" strokeLinecap="round" />
    <Skirt x={126} y={68} colour="#B9A46B" n={6} len={30} />
  </>),
};

export default function BaitArt({ b, h = 96 }) {
  const draw = ART[b.id] || BY_KIND[b.kind] || BY_KIND["Soft plastic"];
  return (
    <svg viewBox="0 0 300 120" style={{ width: "100%", height: h, display: "block" }}
      role="img" aria-label={`${b.name} — ${b.kind}`}>
      {draw()}
    </svg>
  );
}
