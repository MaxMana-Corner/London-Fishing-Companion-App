/* RENDERED-TEXT CONTRAST AUDIT.  Load it in the running app and call __audit().

     node tools/build.mjs && <serve>       then in the page console:
     <script src="/tools/contrast-audit.js"></script>
     __audit()   ->  [{where, size, colour, on, ratio, need, sample}, ...]

   Run it on every screen in all four theme x palette combinations. It exists
   because a token-pair sweep cannot find a hard-coded literal: .prose was a
   #2A3327 on ten screens at 1.22:1 in dark and passed every token check,
   because a literal is in neither column. This walks what is actually painted.

   Walks every text node that is actually painted, resolves the background it
   really sits on by climbing until something is opaque, and applies the WCAG
   threshold for that text's own size and weight. This is the method that
   catches a hard-coded literal - a token-pair sweep cannot, because a literal
   is in neither column. */
window.__audit = function () {
  const px = (v) => parseFloat(v) || 0;
  const parse = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({          // composite fg (with alpha) onto bg
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  const lum = (c) => {
    const f = [c.r, c.g, c.b].map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  /* A GRADIENT IS A BACKGROUND TOO.

     This only ever read background-COLOR, and a gradient lives in
     background-image with the colour left transparent. So the climb walked
     straight past .seasonhero - whose whole job is to be a dark band in both
     themes - and found the pale card behind it, then reported --on-band text
     at 1.06:1 on the most prominent card in the app. Four false positives on
     one card, which is worse than none at all: noise is how a tool stops
     being read.

     Every colour stop is extracted and the WORST one against this text is
     used, because a gradient means the text crosses all of them and the
     answer has to hold along its whole length. */
  const stopsOf = (el) => {
    const img = getComputedStyle(el).backgroundImage;
    if (!img || img === "none" || !/gradient\(/.test(img)) return [];
    return [...img.matchAll(/rgba?\([^)]*\)|#[0-9A-Fa-f]{3,8}/g)]
      .map((m) => parse(m[0]))
      .filter((c) => c && c.a > 0);
  };

  /* The painted background behind an element: climb ancestors compositing any
     partially transparent layers, and fall back to the page ground. */
  const bgOf = (el, fg) => {
    const stack = [];
    let n = el;
    while (n && n !== document.documentElement) {
      /* Gradient first: it paints over the element's own background-color. */
      const stops = stopsOf(n);
      if (stops.length) {
        /* Pick the stop that reads worst against the text, so a gradient
           cannot hide a bad end behind a good average. */
        let worst = stops[0];
        if (fg) {
          for (const s of stops) if (ratio(fg, s) < ratio(fg, worst)) worst = s;
        }
        stack.push(worst);
        if (worst.a === 1) break;
      }
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; }
      n = n.parentElement;
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    if (base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 };
    let out = base;
    for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i], out);
    return out;
  };

  const sig = (el) => {
    const cls = (el.className || "").toString().trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".");
    return el.tagName.toLowerCase() + (cls ? "." + cls : "");
  };

  const seen = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = (node.nodeValue || "").trim();
    if (text.length < 2) continue;
    const el = node.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (px(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;           // not laid out

    const fgRaw = parse(cs.color);
    if (!fgRaw) continue;
    /* fgRaw is handed in so a gradient can be judged by its worst stop
       against THIS text rather than by an average. */
    const bg = bgOf(el, fgRaw);
    /* element opacity applies to the text as if it were alpha over its own bg */
    const eff = px(cs.opacity) < 1
      ? over({ ...fgRaw, a: fgRaw.a * px(cs.opacity) }, bg)
      : (fgRaw.a < 1 ? over(fgRaw, bg) : fgRaw);

    const size = px(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(eff, bg);
    if (got >= need) continue;

    const key = sig(el) + "|" + cs.color + "|" + Math.round(size);
    if (!seen.has(key)) {
      seen.set(key, {
        where: sig(el), size: +size.toFixed(1), weight,
        colour: cs.color, on: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
        ratio: +got.toFixed(2), need, sample: text.slice(0, 44),
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.ratio - b.ratio);
};
