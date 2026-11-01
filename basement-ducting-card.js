// Basement ducting card for Home Assistant.
//
// A picture of two recuperators that exhaust through a shared hood over a heater and supply air into the room
// through their own outlets, coloured by temperature from your sensors and animated with the airflow.
// Every sensor is optional: a part with a reading at one end only takes that colour, a part with none turns grey.
// See README.md for the options.
//
// The same render function also runs in Node (tools/render.mjs) to make a static picture.

export const VERSION = "1.0.0";

// The temperature scale (°C, colour) of the recuperator integration's diagram, after the U.S. National Weather
// Service temperature maps.
export const PALETTE = [
  [-40, "#e3c6f5"], [-30, "#b07ad6"], [-20, "#6f3fb4"], [-12, "#3a3fbf"], [-5, "#2f6fdc"], [0, "#4fa3ec"],
  [5, "#3cc4c6"], [10, "#46bf62"], [15, "#9fd34a"], [20, "#f1e344"], [25, "#f6b637"], [30, "#ee7f25"],
  [35, "#d9401f"], [40, "#a8161f"], [46, "#7b0b43"],
];
const NEUTRAL = "#9aa0a6"; // no reading
const TEXT = "#8a9199"; // readable on light and dark themes
const OUTLINE = "#6b7280";
const HOT = "#ee7f25"; // exhaust arrows
const COLD = "#2f6fdc"; // intake arrows
const HOSE = "#b8bec6"; // hose walls and hood edges
const HEATER = "#d9401f";
const MARKER = "#46bf62";

// The recuperator integration's pipe outline (viewBox 0 0 640 240), drawn upright here at 55 %.
const PIPE = "M 20,100 L 70,100 C 95,100 100,60 130,60 L 510,60 C 540,60 545,100 570,100 L 620,100 " +
  "L 620,140 L 570,140 C 545,140 540,180 510,180 L 130,180 C 100,180 95,140 70,140 L 20,140 Z";

// Layout (560 x 1110): centre line CX; left unit on LX, right unit on RX. Outside ends at the top (y 70), inside
// ends at the bottom (y 400). Units' wyes y 402..450, room outlets down to y 524, hood wye arms at AY, heater at HY.
const W = 560, H = 1110, FONT_BUMP = 2, NSTOPS = 12;
const CX = 280, LX = CX - 70, RX = CX + 70, AY = 560, HY = 800;
const ARM = [-37 / Math.hypot(37, 44), -44 / Math.hypot(37, 44)]; // left arm of the hood wye, outward
const PERP = [-ARM[1], ARM[0]]; // across the left arm, toward its inner wall
const ARM_W = 25.6;
const OUTER_L = [CX - 52, AY + 7];
const INNER_L = [OUTER_L[0] + ARM_W * PERP[0], OUTER_L[1] + ARM_W * PERP[1]];
const CAP_L = [OUTER_L[0] + (ARM_W / 2) * PERP[0], OUTER_L[1] + (ARM_W / 2) * PERP[1]];
const CAP_R = [2 * CX - CAP_L[0], CAP_L[1]];
const HOSE_X = 10; // hose centre line, inward of each unit's centre

const SIDES = ["left", "right"];
const SIDE_SLOTS = ["inside", "outside", "phase", "wye", "outlet"];
const SHARED_SLOTS = ["hood", "hood_wye", "heater_intake"];

// ---------------------------------------------------------------------------------------------------------------
// Colours and numbers

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

export function colour(t) {
  if (t === null || t === undefined || Number.isNaN(t)) return NEUTRAL;
  if (t <= PALETTE[0][0]) return PALETTE[0][1];
  if (t >= PALETTE[PALETTE.length - 1][0]) return PALETTE[PALETTE.length - 1][1];
  for (let i = 0; i < PALETTE.length - 1; i++) {
    const [t0, c0] = PALETTE[i], [t1, c1] = PALETTE[i + 1];
    if (t0 <= t && t <= t1) {
      const f = (t - t0) / (t1 - t0), a = hex(c0), b = hex(c1);
      return "#" + a.map((x, k) => Math.round(x + (b[k] - x) * f).toString(16).padStart(2, "0")).join("");
    }
  }
  return NEUTRAL;
}

const known = (...xs) => xs.find((x) => x !== null && x !== undefined && !Number.isNaN(x)) ?? null;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n1 = (x) => x.toFixed(1);
const has = (x) => x !== null && x !== undefined && !Number.isNaN(x);

/** The temperature at step i of n along a gradient; a missing end takes the other end's value. */
export function along(t1, t2, i, n = NSTOPS) {
  const a = has(t1) ? t1 : t2, b = has(t2) ? t2 : t1;
  return has(a) ? a + ((b - a) * i) / (n - 1) : null;
}
const lines = (s) => String(s ?? "").split("\n");

// ---------------------------------------------------------------------------------------------------------------
// Configuration

const UNITS = { auto: "auto", "°C": "°C", C: "°C", c: "°C", celsius: "°C", "°F": "°F", F: "°F", f: "°F", fahrenheit: "°F" };

export function normalise(config) {
  const c = config || {};
  const side = (s, name) => {
    const v = c[s] && typeof c[s] === "object" ? c[s] : {};
    return { ...v, name: v.name || name };
  };
  const list = (x) => (x === undefined || x === null || x === "" ? [] : [].concat(x));
  const heater = c.heater && typeof c.heater === "object" ? c.heater : {};
  return {
    title: c.title ?? "Recuperator ducting",
    subtitle: c.subtitle ?? "live",
    animate: c.animate ?? true,
    unit: UNITS[String(c.unit ?? "auto").toLowerCase()] ?? UNITS[c.unit] ?? "auto",
    left: side("left", "Recuperator 1"),
    right: side("right", "Recuperator 2"),
    hood: c.hood || null,
    hood_wye: c.hood_wye || null,
    heater_intake: c.heater_intake || null,
    room: list(c.room).filter((e) => typeof e === "string" && e),
    heater: {
      note: "", intake_detail: "", ...heater,
      name: heater.name || "Heater", intake_name: heater.intake_name || "Heater air intake",
    },
    hose_note: c.hose_note ?? "",
    notes: c.notes === undefined || c.notes === null ? null : list(c.notes).map(String),
    // One marker per side; a marker without side: right goes on the left.
    markers: list(c.markers).filter((m) => m && typeof m === "object")
      .filter((m, i, all) => all.findIndex((x) => (x.side === "right") === (m.side === "right")) === i),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// What colour and text every part gets, from the readings (°C) and phases

/**
 * r: { left: {inside, outside, phase, wye, outlet, supply}, right: {...}, hood, hood_wye, heater_intake, room }
 *    (supply: only for typical pictures, the supply air to show in an outlet)
 * mem: remembered readings from earlier updates ({left: {exIn, ex, sup}, right: {...}}), updated in place
 * opts: { typical: false, unit: "°C" | "°F" }
 */
export function paint(cfg, r, mem = { left: {}, right: {} }, opts = {}) {
  const typical = !!opts.typical;
  const unit = opts.unit === "°F" ? "°F" : "°C";
  const show = (t) => {
    if (!has(t)) return "–";
    const v = unit === "°F" ? (t * 9) / 5 + 32 : t;
    return typical ? `≈${Math.round(v)} ${unit}` : `${n1(v)} ${unit}`;
  };
  const state = {};
  for (const s of SIDES) {
    const u = r[s], m = mem[s] || (mem[s] = {});
    const ex = typical || u.phase === "exhaust";
    const inn = !typical && u.phase === "intake";
    const wye = known(u.wye, u.inside);
    if (!typical && ex && has(u.inside)) { m.exIn = u.inside; m.ex = wye; }
    if (!typical && inn && has(wye)) m.sup = known(u.outlet, wye);
    state[s] = { u, m, ex, inn, wye };
  }
  // The hood: its own sensor, else the hood wye's, else estimated from the inside probes of the units drawing from
  // it (exhausting now, else at their last exhaust); any inside probe only as a last resort.
  const estimated = !has(r.hood) && !has(r.hood_wye);
  const max = (xs) => (xs.length ? Math.max(...xs) : null);
  const exhausting = SIDES.filter((s) => state[s].ex).map((s) => r[s].inside).filter(has);
  const remembered = SIDES.map((s) => state[s].m.exIn).filter(has);
  const hood = known(r.hood, r.hood_wye, max(exhausting), max(remembered), max(SIDES.map((s) => r[s].inside).filter(has)));
  const hoodWye = known(r.hood_wye, hood);
  const room = r.room;

  const p = { grads: {}, fills: {}, texts: {}, active: {}, streaks: {}, estimated };
  for (const s of SIDES) {
    const k = s[0];
    const { u, m, ex, inn, wye } = state[s];
    p.grads[`g-pipe-${k}`] = [u.outside, u.inside];
    p.grads[`g-box-${k}`] = [u.inside, wye];
    // A hose carries hood air while its unit exhausts; otherwise its dampers are shut and it keeps the last
    // exhaust reading (or the hood's until there is one).
    p.grads[`g-hose-${k}`] = [hoodWye, ex ? wye : known(m.ex, hoodWye)];
    // An outlet carries supply air while its unit takes air in; otherwise it shows its own sensor or the room.
    if (typical) {
      p.grads[`g-out-${k}`] = [known(u.supply, wye), known(u.outlet, u.supply, wye)];
    } else if (inn) {
      p.grads[`g-out-${k}`] = [wye, known(u.outlet, wye)];
    } else {
      const idle = known(u.outlet, room, m.sup);
      p.grads[`g-out-${k}`] = [idle, idle];
    }

    p.texts[`t-${k}-out`] = show(u.outside);
    p.texts[`t-${k}-in`] = show(u.inside);
    p.texts[`t-${k}-wye`] = show(u.wye);
    p.texts[`t-${k}-sup`] = typical ? show(known(u.outlet, u.supply, wye))
      : has(u.outlet) ? show(u.outlet) : inn ? show(wye) : "idle";

    p.active[`a-ex-${k}`] = ex;
    p.active[`a-in-${k}`] = typical || inn;
    p.active[`drift-${k}`] = typical || inn;
    p.streaks[`s-pipe-${k}`] = [ex || inn, ex]; // paths run top to bottom: exhaust runs them backwards
    p.streaks[`s-hose-${k}`] = [ex, true]; // paths run unit to hood
    p.streaks[`s-out-${k}`] = [inn, false];
    p.streaks[`s-arm-${k}`] = [ex, false];
    p.streaks[`drift-${k}`] = [inn, false];
  }
  p.streaks["s-hood"] = [SIDES.some((s) => state[s].ex), false];
  p.grads["g-hood"] = [hood, hoodWye];
  p.grads["g-heater"] = [known(r.heater_intake, room), hood];
  p.fills["wye"] = hoodWye;
  p.texts["t-hood"] = show(hood) + (estimated && has(hood) ? "*" : "");
  p.texts["t-hoodwye"] = show(r.hood_wye);
  p.texts["t-heater-in"] = show(r.heater_intake);
  p.texts["t-room"] = show(room);
  return p;
}

// ---------------------------------------------------------------------------------------------------------------
// Drawing

function rounded(pts, r = 14) {
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
    const u = Math.hypot(ax - bx, ay - by), v = Math.hypot(cx - bx, cy - by);
    const p1 = [bx + ((ax - bx) * r) / u, by + ((ay - by) * r) / u], p2 = [bx + ((cx - bx) * r) / v, by + ((cy - by) * r) / v];
    d += ` L ${p1[0].toFixed(1)},${p1[1].toFixed(1)} Q ${bx.toFixed(1)},${by.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const e = pts[pts.length - 1];
  return d + ` L ${e[0].toFixed(1)},${e[1].toFixed(1)}`;
}

function offset(pts, d) {
  const normals = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.hypot(bx - ax, by - ay);
    normals.push([-(by - ay) / n, (bx - ax) / n]);
  }
  const out = [[pts[0][0] + d * normals[0][0], pts[0][1] + d * normals[0][1]]];
  for (let i = 1; i < pts.length - 1; i++) {
    const n1_ = normals[i - 1], n2 = normals[i], k = d / (1 + n1_[0] * n2[0] + n1_[1] * n2[1]);
    out.push([pts[i][0] + k * (n1_[0] + n2[0]), pts[i][1] + k * (n1_[1] + n2[1])]);
  }
  const l = normals[normals.length - 1], e = pts[pts.length - 1];
  out.push([e[0] + d * l[0], e[1] + d * l[1]]);
  return out;
}

const HOSE_PTS = (() => {
  const reach = (CAP_L[0] - (LX + HOSE_X)) / -ARM[0];
  const bend = [LX + HOSE_X, CAP_L[1] + reach * ARM[1]];
  return {
    l: [[LX + HOSE_X, 450], bend, CAP_L],
    r: [[RX - HOSE_X, 450], [2 * CX - bend[0], bend[1]], CAP_R],
  };
})();

/** The picture as an SVG string. ids get the suffix `-${uid}` so several cards can share a page. */
export function render(cfg, p, { live = false, uid = "s" } = {}) {
  const id = (key) => `${key}-${uid}`;
  const stopsFor = ([t1, t2]) => {
    let s = "";
    for (let i = 0; i < NSTOPS; i++) s += `<stop offset="${(i / (NSTOPS - 1)).toFixed(3)}" stop-color="${colour(along(t1, t2, i))}"/>`;
    return s;
  };
  const grad = (key, a, b) =>
    `<linearGradient id="${id(key)}" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" gradientUnits="userSpaceOnUse">${stopsFor(p.grads[key])}</linearGradient>`;
  const label = (x, y, text, size = 13, anchor = "middle", bold = false, fill = TEXT) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size + FONT_BUMP}"${bold ? ' font-weight="bold"' : ""} fill="${fill}">${esc(text)}</text>`;
  const multi = (x, y, text, size, anchor, bold, fill, step = 17) =>
    lines(text).map((t, i) => label(x, y + i * step, t, size, anchor, bold, fill)).join("");
  const badge = (x, y, key, w = 62) =>
    `<rect x="${x - w / 2}" y="${y - 11}" width="${w}" height="22" rx="6" fill="#000" fill-opacity="0.5"/>` +
    `<text id="${id(key)}" x="${x}" y="${y + 5}" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff">${esc(p.texts[key])}</text>`;
  const damper = (x, y, angle) =>
    `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${angle})"><circle r="11" fill="#000" fill-opacity="0.6" stroke="#fff" stroke-width="1.5"/>` +
    `<path d="M -7,0 L 1,0" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M 0,-5 L 7,0 L 0,5 Z" fill="#fff"/></g>`;
  const arrow = (key, d, c, dash = "") =>
    `<path${key ? ` id="${id(key)}"` : ""} class="arrow${key && live && !p.active[key] ? " idle" : ""}${key && key.startsWith("drift") ? " drift" : ""}" d="${d}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""} marker-end="url(#${id("head-" + c.slice(1))})"/>`;
  const marker = (c) =>
    `<marker id="${id("head-" + c.slice(1))}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="${c}"/></marker>`;
  const streak = (key, d) => (live ? `<path id="${id(key)}" class="streak" d="${d}"/>` : "");
  const dot = (x, y, title, detail, anchor) => {
    const tx = anchor === "end" ? x - 16 : x + 16;
    return `<circle cx="${x}" cy="${y}" r="7" fill="${MARKER}" stroke="#fff" stroke-width="2"/>` +
      label(tx, y - 2, title, 13, anchor, true) + (detail ? label(tx, y + 14, detail, 11, anchor) : "");
  };
  const pipe = (cx, key) =>
    `<g transform="translate(${cx + 66},59) rotate(90) scale(0.55)"><path d="${PIPE}" fill="url(#${id(key)})" stroke="${OUTLINE}" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></g>`;
  const hollow = (pts, key) =>
    `<path d="${rounded(pts)}" fill="none" stroke="url(#${id(key)})" stroke-width="${ARM_W}" stroke-linejoin="round"/>` +
    [-1, 1].map((s) => `<path d="${rounded(offset(pts, (s * ARM_W) / 2))}" fill="none" stroke="${HOSE}" stroke-width="3"/>`).join("");

  const defs = [
    grad("g-pipe-l", [20, 0], [620, 0]), grad("g-pipe-r", [20, 0], [620, 0]),
    grad("g-box-l", [0, 402], [0, 450]), grad("g-box-r", [0, 402], [0, 450]),
    grad("g-out-l", [0, 450], [0, 524]), grad("g-out-r", [0, 450], [0, 524]),
    grad("g-hose-l", CAP_L, HOSE_PTS.l[0]), grad("g-hose-r", CAP_R, HOSE_PTS.r[0]),
    grad("g-hood", [0, HY], [0, AY + 93]), grad("g-heater", [0, HY + 112], [0, HY]),
    marker(HOT), marker(COLD), marker(TEXT),
  ];
  const o = [];
  o.push(label(CX, 28, cfg.title, 18, "middle", true));
  if (cfg.subtitle) o.push(label(CX, 46, cfg.subtitle, 12));

  // Pipes: outside end at the top; streaks under the readings.
  o.push(pipe(LX, "g-pipe-l"), pipe(RX, "g-pipe-r"));
  o.push(streak("s-pipe-l", `M ${LX},76 L ${LX},396`), streak("s-pipe-r", `M ${RX},76 L ${RX},396`));
  o.push(multi(LX - 40, 80, cfg.left.name, 14, "end", true), multi(RX + 40, 80, cfg.right.name, 14, "start", true));
  for (const [x, a] of [[LX - 40, "end"], [RX + 40, "start"]]) {
    o.push(label(x, 122, "Outside", 13, a, true), label(x, 138, "to and from", 12, a), label(x, 152, "outdoors", 12, a));
    o.push(label(x, 394, "Inside", 13, a, true));
  }
  o.push(badge(LX, 150, "t-l-out"), badge(LX, 318, "t-l-in"), badge(RX, 150, "t-r-out"), badge(RX, 318, "t-r-in"));

  // Units' wyes and room outlets (closed at the end; the damper sits on the cap).
  for (const [x, k] of [[LX, "l"], [RX, "r"]]) {
    o.push(`<rect x="${x - 39}" y="402" width="78" height="48" rx="6" fill="url(#${id("g-box-" + k)})" stroke="${OUTLINE}" stroke-width="3"/>`);
  }
  o.push(`<path d="M ${LX - 36},450 L ${LX - 36},524 L ${LX - 10},524 L ${LX - 10},450" fill="url(#${id("g-out-l")})" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>`);
  o.push(`<path d="M ${RX + 36},450 L ${RX + 36},524 L ${RX + 10},524 L ${RX + 10},450" fill="url(#${id("g-out-r")})" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>`);
  o.push(badge(LX - 76, 488, "t-l-sup"), badge(RX + 76, 488, "t-r-sup"));
  o.push(label(LX - 76, 516, cfg.left.outlet ? "outlet" : "supply", 11), label(RX + 76, 516, cfg.right.outlet ? "outlet" : "supply", 11));

  // The hood and its wye.
  const wye = `M ${CX - 15},${AY + 93} L ${CX - 15},${AY + 51} L ${OUTER_L[0].toFixed(1)},${OUTER_L[1].toFixed(1)} L ${INNER_L[0].toFixed(1)},${INNER_L[1].toFixed(1)} ` +
    `L ${CX},${AY + 29} L ${(2 * CX - INNER_L[0]).toFixed(1)},${INNER_L[1].toFixed(1)} L ${(2 * CX - OUTER_L[0]).toFixed(1)},${OUTER_L[1].toFixed(1)} ` +
    `L ${CX + 15},${AY + 51} L ${CX + 15},${AY + 93} Z`;
  o.push(`<path d="M ${CX - 15},${AY + 93} L ${CX + 15},${AY + 93} L ${CX + 60},${HY} L ${CX - 60},${HY} Z" fill="url(#${id("g-hood")})"/>`);
  o.push(`<path d="M ${CX - 15},${AY + 93} L ${CX - 60},${HY} M ${CX + 15},${AY + 93} L ${CX + 60},${HY}" stroke="${HOSE}" stroke-width="3" fill="none"/>`);
  o.push(`<path id="${id("wye")}" class="fill" d="${wye}" fill="${colour(p.fills.wye)}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>`);
  o.push(label(CX + 44, AY + 160, "hood", 12, "start"));

  // Hoses, then the streaks along the hoses, outlets and hood, then the readings on top.
  o.push(hollow(HOSE_PTS.l, "g-hose-l"), hollow(HOSE_PTS.r, "g-hose-r"));
  o.push(streak("s-hose-l", rounded(HOSE_PTS.l)), streak("s-hose-r", rounded(HOSE_PTS.r)));
  o.push(streak("s-out-l", `M ${LX - 23},452 L ${LX - 23},520`), streak("s-out-r", `M ${RX + 23},452 L ${RX + 23},520`));
  o.push(streak("s-hood", `M ${CX},${HY - 4} L ${CX},${AY + 34}`));
  o.push(streak("s-arm-l", `M ${CX},${AY + 34} L ${CAP_L[0].toFixed(1)},${CAP_L[1].toFixed(1)}`));
  o.push(streak("s-arm-r", `M ${CX},${AY + 34} L ${CAP_R[0].toFixed(1)},${CAP_R[1].toFixed(1)}`));
  o.push(badge(CX, HY - 50, "t-hood", 70));
  if (cfg.hood_wye) o.push(badge(CX, AY + 74, "t-hoodwye"));
  if (cfg.left.wye) o.push(badge(LX, 426, "t-l-wye"));
  if (cfg.right.wye) o.push(badge(RX, 426, "t-r-wye"));

  // The heater: room air goes in at the bottom and is warmed toward the hood's temperature at the top.
  o.push(`<rect x="${CX - 80}" y="${HY}" width="160" height="112" rx="4" fill="url(#${id("g-heater")})" stroke="${HEATER}" stroke-width="4"/>`);
  const hn = lines(cfg.heater.name), top = HY + 50 - (hn.length - 1) * 9 - (cfg.heater.note ? 8 : 0);
  o.push(multi(CX, top, cfg.heater.name, 14, "middle", true, "#fff", 18));
  if (cfg.heater.note) o.push(label(CX, top + hn.length * 18 - 1, cfg.heater.note, 11, "middle", false, "#fff"));
  for (let i = 0; i < 4; i++) {
    const y = HY + 88 + i * 5;
    o.push(`<line x1="${CX - 30}" y1="${y}" x2="${CX + 30}" y2="${y}" stroke="#fff" stroke-opacity="0.8" stroke-width="1.5"/>`);
  }

  // Airflow arrows: exhaust up the outer side of each pipe, intake down the inner side; drift through the room.
  o.push(arrow("a-ex-l", `M ${LX - 48},330 L ${LX - 48},176`, HOT), arrow("a-in-l", `M ${LX + 48},176 L ${LX + 48},330`, COLD));
  o.push(arrow("a-ex-r", `M ${RX + 48},330 L ${RX + 48},176`, HOT), arrow("a-in-r", `M ${RX - 48},176 L ${RX - 48},330`, COLD));
  o.push(arrow("drift-l", `M ${LX - 23},544 C ${LX - 70},680 ${CX - 120},800 ${CX - 88},850`, TEXT, "6 6"));
  o.push(arrow("drift-r", `M ${RX + 23},544 C ${RX + 70},680 ${CX + 120},800 ${CX + 88},850`, TEXT, "6 6"));
  o.push(label(LX - 66, 700, "fresh air", 12, "end"), label(LX - 66, 715, "drifts toward", 12, "end"), label(LX - 66, 730, "the middle", 12, "end"));
  if (cfg.room.length) o.push(badge(LX - 110, 770, "t-room"), label(LX - 110, 798, "room", 11));

  // One-way dampers.
  o.push(damper(LX + HOSE_X, 468, 270), damper(RX - HOSE_X, 468, 270));
  o.push(damper(CAP_L[0] - 24 * ARM[0], CAP_L[1] - 24 * ARM[1], -130), damper(CAP_R[0] + 24 * ARM[0], CAP_R[1] - 24 * ARM[1], -50));
  o.push(damper(LX - 23, 524, 90), damper(RX + 23, 524, 90));

  // Markers (sensors without a reading in the picture) and the heater's air intake sensor.
  for (const m of cfg.markers) {
    const right = m.side === "right";
    o.push(dot(right ? RX + 52 : LX - 52, 580, m.name || "", m.detail || "", right ? "start" : "end"));
  }
  if (cfg.heater_intake) {
    o.push(dot(CX - 60, HY + 134, cfg.heater.intake_name, cfg.heater.intake_detail, "start"));
    o.push(label(CX + 122, HY + 76, "air in", 11), badge(CX + 122, HY + 98, "t-heater-in"));
  }

  // Legend and notes.
  const ly = 978;
  o.push(arrow(null, `M 40,${ly} L 80,${ly}`, HOT) + label(92, ly + 4, "exhaust: both units draw from the hood", 12, "start"));
  o.push(arrow(null, `M 40,${ly + 24} L 80,${ly + 24}`, COLD) + label(92, ly + 28, "intake: into the room at each unit", 12, "start"));
  o.push(damper(60, ly + 48, 0) + label(92, ly + 52, "one-way damper (arrow: the way air may pass)", 12, "start"));
  const notes = cfg.notes ?? [
    cfg.hose_note,
    live ? "Outlets show the supply air while that unit takes air in." : "",
    (live ? !cfg.hood && !cfg.hood_wye : p.estimated) ? "*Hood: not measured; estimated from the inside probes." : "",
  ];
  let ny = 1060;
  for (const n of notes.filter(Boolean)) {
    o.push(label(CX, ny, n, 11));
    ny += 17;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="sans-serif">` +
    `<defs>${defs.join("")}</defs>${o.join("")}</svg>`;
}

/** A static picture from fixed readings (°C), e.g. typical values; used by tools/render.mjs. */
export function renderStatic(config, readings, { unit = "°C" } = {}) {
  const cfg = normalise(config);
  const r = { left: {}, right: {}, ...readings };
  for (const s of SIDES) for (const k of [...SIDE_SLOTS, "supply"]) r[s][k] = r[s][k] ?? null;
  for (const k of [...SHARED_SLOTS, "room"]) r[k] = r[k] ?? null;
  return render(cfg, paint(cfg, r, undefined, { typical: true, unit }), { live: false, uid: "s" });
}

// ---------------------------------------------------------------------------------------------------------------
// The card (browser only)

const CSS = `
  ha-card { padding: 8px; overflow: hidden; }
  svg { display: block; width: 100%; height: auto; }
  .streak { fill: none; stroke: #fff; stroke-opacity: 0.75; stroke-width: 2.4; stroke-linecap: round;
            stroke-dasharray: 9 21; display: none; }
  .streak.on { display: inline; animation: run-fwd 1.4s linear infinite; }
  .streak.on.rev { animation-name: run-rev; }
  .arrow { transition: opacity 1.5s; }
  .arrow.idle { opacity: 0.2; }
  .drift.on { animation: drift 3s linear infinite; }
  @keyframes run-fwd { to { stroke-dashoffset: -30; } }
  @keyframes run-rev { to { stroke-dashoffset: 30; } }
  @keyframes drift { to { stroke-dashoffset: -24; } }
  .smooth stop { transition: stop-color 2s; }
  .smooth .fill { transition: fill 2s; }
  .still .streak.on, .still .drift.on { animation: none; }
  .still .streak.on { display: none; }
  @media (prefers-reduced-motion: reduce) { .streak.on, .drift.on { animation: none; } }
`;

function reading(hass, entity) {
  if (!entity) return null;
  const s = hass.states[entity];
  if (!s) return null;
  let v = parseFloat(s.state);
  if (Number.isNaN(v)) return null;
  const u = s.attributes.unit_of_measurement;
  if (u === "°F") v = ((v - 32) * 5) / 9;
  else if (u === "K") v -= 273.15;
  return v;
}

function readAll(hass, cfg) {
  const r = {};
  for (const s of SIDES) {
    const c = cfg[s];
    r[s] = {
      inside: reading(hass, c.inside), outside: reading(hass, c.outside), wye: reading(hass, c.wye),
      outlet: reading(hass, c.outlet), phase: c.phase && hass.states[c.phase] ? hass.states[c.phase].state : null,
    };
  }
  for (const k of SHARED_SLOTS) r[k] = reading(hass, cfg[k]);
  const rooms = cfg.room.map((e) => reading(hass, e)).filter((x) => x !== null);
  r.room = rooms.length ? rooms.reduce((a, b) => a + b, 0) / rooms.length : null;
  return r;
}

let serial = 0;

const BaseElement = typeof HTMLElement === "undefined" ? class {} : HTMLElement;

class BasementDuctingCard extends BaseElement {
  setConfig(config) {
    if (config !== undefined && (typeof config !== "object" || Array.isArray(config))) throw new Error("Invalid configuration");
    this._config = config || {};
    this._cfg = normalise(this._config);
    this._uid = "bd" + ++serial;
    this._mem = { left: {}, right: {} };
    this._built = false;
    const c = this._cfg;
    this._entities = [...SIDES.flatMap((s) => SIDE_SLOTS.map((k) => c[s][k])), ...SHARED_SLOTS.map((k) => c[k]), ...c.room]
      .filter((e) => typeof e === "string" && e);
    this._seen = null;
    if (this._hass) this.hass = this._hass;
  }

  static getConfigElement() { return document.createElement("basement-ducting-card-editor"); }

  // A new card picks up the first two phase sensors it finds (states exhaust and intake, as the Recuperator
  // integration's Phase sensors have).
  static getStubConfig(hass) {
    const phases = Object.values(hass?.states || {}).filter((s) => s.entity_id.startsWith("sensor.") &&
      Array.isArray(s.attributes.options) && s.attributes.options.includes("exhaust") && s.attributes.options.includes("intake"))
      .map((s) => s.entity_id).sort();
    const stub = { title: "Recuperator ducting" };
    if (phases[0]) stub.left = { phase: phases[0] };
    if (phases[1]) stub.right = { phase: phases[1] };
    return stub;
  }

  getCardSize() { return 14; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }

  set hass(hass) {
    this._hass = hass;
    if (!this._cfg) return;
    // Home Assistant sets hass on every state change in the house; only redraw when one of ours changed.
    const unitSystem = hass.config?.unit_system?.temperature;
    const seen = [unitSystem, ...this._entities.map((e) => hass.states[e])];
    if (this._built && this._seen && seen.every((x, i) => x === this._seen[i])) return;
    this._seen = seen;
    const unit = this._cfg.unit === "auto" ? (unitSystem === "°F" ? "°F" : "°C") : this._cfg.unit;
    const p = paint(this._cfg, readAll(hass, this._cfg), this._mem, { unit });
    if (!this._built) {
      const root = this.shadowRoot || this.attachShadow({ mode: "open" });
      root.innerHTML = `<style>${CSS}</style><ha-card>${render(this._cfg, p, { live: true, uid: this._uid })}</ha-card>`;
      const svg = root.querySelector("svg");
      svg.classList.add(this._cfg.animate ? "smooth" : "still");
      this._built = true;
    }
    this._apply(p);
  }

  _el(key) { return this.shadowRoot.getElementById(`${key}-${this._uid}`); }

  _apply(p) {
    for (const [key, [t1, t2]] of Object.entries(p.grads)) {
      const g = this._el(key);
      if (!g) continue;
      g.querySelectorAll("stop").forEach((s, i) => { s.style.stopColor = colour(along(t1, t2, i)); });
    }
    for (const [key, t] of Object.entries(p.fills)) { const e = this._el(key); if (e) e.style.fill = colour(t); }
    for (const [key, text] of Object.entries(p.texts)) { const e = this._el(key); if (e && e.textContent !== text) e.textContent = text; }
    for (const [key, on] of Object.entries(p.active)) { const e = this._el(key); if (e) e.classList.toggle("idle", !on); }
    for (const [key, [on, rev]] of Object.entries(p.streaks)) {
      const e = this._el(key);
      if (!e) continue;
      e.classList.toggle("on", on);
      e.classList.toggle("rev", !!rev);
    }
  }
}

// The visual editor: Home Assistant's own form, with entity pickers for every sensor.
const SIDE_SCHEMA = [
  { name: "name", selector: { text: { multiline: true } } },
  { name: "inside", selector: { entity: { domain: "sensor" } } },
  { name: "outside", selector: { entity: { domain: "sensor" } } },
  { name: "phase", selector: { entity: { domain: ["sensor", "select", "input_select"] } } },
  { name: "wye", selector: { entity: { domain: "sensor" } } },
  { name: "outlet", selector: { entity: { domain: "sensor" } } },
];
const SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "subtitle", selector: { text: {} } },
  { name: "animate", selector: { boolean: {} } },
  {
    name: "unit", selector: {
      select: { mode: "dropdown", options: [{ value: "auto", label: "Automatic" }, { value: "°C", label: "°C" }, { value: "°F", label: "°F" }] },
    },
  },
  { type: "expandable", name: "left", title: "Left unit", schema: SIDE_SCHEMA },
  { type: "expandable", name: "right", title: "Right unit", schema: SIDE_SCHEMA },
  { name: "hood", selector: { entity: { domain: "sensor" } } },
  { name: "hood_wye", selector: { entity: { domain: "sensor" } } },
  { name: "heater_intake", selector: { entity: { domain: "sensor" } } },
  { name: "room", selector: { entity: { domain: "sensor", multiple: true } } },
  {
    type: "expandable", name: "heater", title: "Heater labels", schema: [
      { name: "name", selector: { text: { multiline: true } } },
      { name: "note", selector: { text: {} } },
      { name: "intake_name", selector: { text: {} } },
      { name: "intake_detail", selector: { text: {} } },
    ],
  },
  { name: "hose_note", selector: { text: {} } },
];
const LABELS = {
  title: "Title", subtitle: "Subtitle", animate: "Animate the airflow", unit: "Unit for the readings", name: "Name (may span lines)",
  inside: "Inside probe (room end of the core)", outside: "Outside probe (outdoor end of the core)",
  phase: "Phase sensor (exhaust / intake)", wye: "Wye sensor (optional, middle of the unit's wye)",
  outlet: "Outlet sensor (optional, in the room outlet)", hood: "Hood sensor (optional)",
  hood_wye: "Hood wye sensor (optional)", heater_intake: "Heater air intake sensor (optional)",
  room: "Room sensors (optional, averaged)", note: "Note under the heater's name",
  intake_name: "Air intake sensor label", intake_detail: "Air intake sensor detail", hose_note: "Note at the bottom",
};

class BasementDuctingCardEditor extends BaseElement {
  setConfig(config) {
    this._config = config;
    this._form_().data = this._data(config);
  }

  set hass(hass) { this._form_().hass = hass; }

  // What the form shows: the config as written, with room always a list and animate shown as on unless turned
  // off. Nothing is added to the YAML unless it is changed in the form.
  _data(config) {
    const room = config.room;
    return { ...config, animate: config.animate !== false, room: room === undefined || room === null || room === "" ? [] : [].concat(room) };
  }

  _form_() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.schema = SCHEMA;
      this._form.computeLabel = (s) => LABELS[s.name] ?? s.name;
      this._form.addEventListener("value-changed", (ev) => {
        const value = { ...ev.detail.value };
        if (value.animate === true && this._config.animate === undefined) delete value.animate;
        if (Array.isArray(value.room) && !value.room.length && this._config.room === undefined) delete value.room;
        const config = { ...value, type: this._config.type };
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    return this._form;
  }
}

if (typeof customElements !== "undefined") {
  if (!customElements.get("basement-ducting-card")) customElements.define("basement-ducting-card", BasementDuctingCard);
  if (!customElements.get("basement-ducting-card-editor")) customElements.define("basement-ducting-card-editor", BasementDuctingCardEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === "basement-ducting-card")) {
    window.customCards.push({
      type: "basement-ducting-card",
      name: "Basement ducting card",
      description: "Two recuperators exhausting through a hood over a heater, coloured by temperature and animated with the airflow.",
      preview: true,
      documentationURL: "https://github.com/geirskogul/basement-ducting-card",
    });
  }
  console.info(`%c basement-ducting-card %c ${VERSION} `, "background:#ee7f25;color:#fff", "background:#6b7280;color:#fff");
}
