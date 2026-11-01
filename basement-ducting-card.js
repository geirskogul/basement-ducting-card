// Basement ducting card for Home Assistant.
//
// A picture of two recuperators that exhaust through a shared hood over a heater and supply air into the room
// through their own outlets, coloured by temperature from your sensors and animated with the airflow.
// Every sensor is optional: a part with a reading at one end only takes that colour, a part with none turns grey.
// See README.md for the options.
//
// The same render function also runs in Node (tools/render.mjs) to make a static picture.

export const VERSION = "1.5.0";

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
    replay: c.replay ?? true,
    replay_hours: Number(c.replay_hours) > 0 ? Number(c.replay_hours) : 1.5,
    replay_speed: Number(c.replay_speed) > 0 ? Number(c.replay_speed) : 120,
    notes: c.notes === undefined || c.notes === null ? null : list(c.notes).map(String),
    // One marker per side; a marker without side: right goes on the left.
    markers: list(c.markers).filter((m) => m && typeof m === "object")
      .filter((m, i, all) => all.findIndex((x) => (x.side === "right") === (m.side === "right")) === i),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// What colour and text every part gets, from the readings (°C) and phases

/**
 * r: { left: {inside, outside, phase, wye, outlet, hose}, right: {...}, hood, hood_wye, heater_intake, room, hood_estimate }
 *    (hose, hood_estimate: smoothed cycle values, see cycleEstimate)
 * mem: remembered readings from earlier updates ({left: {exIn, ex}, right: {...}}), updated in place
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
    state[s] = { u, m, ex, inn, wye };
  }
  // The hood: its own sensor, else the hood wye's, else estimated: from the cycle peaks (r.hood_estimate, see
  // hoodEstimate), else from the inside probes of the units drawing from it (exhausting now, else at their last
  // exhaust); any inside probe only as a last resort.
  const estimated = !has(r.hood) && !has(r.hood_wye);
  const max = (xs) => (xs.length ? Math.max(...xs) : null);
  const exhausting = SIDES.filter((s) => state[s].ex).map((s) => r[s].inside).filter(has);
  const remembered = SIDES.map((s) => state[s].m.exIn).filter(has);
  const hood = known(r.hood, r.hood_wye, r.hood_estimate, max(exhausting), max(remembered), max(SIDES.map((s) => r[s].inside).filter(has)));
  const hoodWye = known(r.hood_wye, hood);
  const room = r.room;

  const p = { grads: {}, fills: {}, texts: {}, active: {}, streaks: {}, estimated };
  for (const s of SIDES) {
    const k = s[0];
    const { u, m, ex, inn, wye } = state[s];
    p.grads[`g-pipe-${k}`] = [u.outside, u.inside];
    p.grads[`g-box-${k}`] = [u.inside, wye];
    // A hose's unit end: the unit's cycle value made smooth (u.hose, see cycleEstimate), so it never jumps at a
    // flip; without one, the live reading while the unit exhausts and the last exhaust reading while it does not.
    p.grads[`g-hose-${k}`] = [hoodWye, known(u.hose, ex ? wye : m.ex, hoodWye)];
    // An outlet's cavity sits behind its one-way damper, open to the unit's wye: it has the wye's air whatever
    // the phase, down to its own sensor's reading at the damper if it has one.
    p.grads[`g-out-${k}`] = [wye, known(u.outlet, wye)];

    p.texts[`t-${k}-out`] = show(u.outside);
    p.texts[`t-${k}-in`] = show(u.inside);
    p.texts[`t-${k}-wye`] = show(u.wye);
    p.texts[`t-${k}-sup`] = show(known(u.outlet, wye));

    p.active[`a-ex-${k}`] = ex;
    p.active[`a-in-${k}`] = typical || inn;
    p.active[`drift-${k}`] = typical || inn;
    p.streaks[`s-pipe-${k}`] = [ex || inn, ex]; // paths run top to bottom: exhaust runs them backwards
    p.streaks[`s-hose-${k}`] = [ex, true]; // paths run unit to hood
    p.streaks[`s-out-${k}`] = [inn, false];
    p.streaks[`s-wex-${k}`] = [ex, true]; // paths run pipe to hose: exhaust runs them backwards
    p.streaks[`s-win-${k}`] = [inn, false];
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
  o.push(`<text id="${id("t-sub")}" x="${CX}" y="46" text-anchor="middle" font-size="${12 + FONT_BUMP}" fill="${TEXT}">${esc(cfg.subtitle || "")}</text>`);

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
  o.push(label(LX - 76, 516, "outlet", 11), label(RX + 76, 516, "outlet", 11));

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
  // Through each unit's wye: an S from the pipe's inside end down to the hose (exhaust) or to the outlet (intake),
  // leaving and entering vertically.
  const s_ = (x0, x1) => `M ${x0},400 C ${x0},426 ${x1},424 ${x1},450`;
  o.push(streak("s-wex-l", s_(LX, LX + HOSE_X)), streak("s-win-l", s_(LX, LX - 23)));
  o.push(streak("s-wex-r", s_(RX, RX - HOSE_X)), streak("s-win-r", s_(RX, RX + 23)));
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
  for (const s of SIDES) for (const k of SIDE_SLOTS) r[s][k] = r[s][k] ?? null;
  for (const k of [...SHARED_SLOTS, "room"]) r[k] = r[k] ?? null;
  return render(cfg, paint(cfg, r, undefined, { typical: true, unit }), { live: false, uid: "s" });
}

// ---------------------------------------------------------------------------------------------------------------
// The card (browser only)

const CSS = `
  ha-card { padding: 8px; overflow: hidden; }
  svg { display: block; width: 100%; height: auto; }
  .streak { fill: none; stroke: none; }
  .chev { fill: none; stroke: #fff; stroke-opacity: 0.85; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
  .arrow { transition: opacity 1.5s; }
  .arrow.idle { opacity: 0.2; }
  .drift.on { animation: drift 3s linear infinite; }
  @keyframes drift { to { stroke-dashoffset: -24; } }
  .smooth stop { transition: stop-color 2s; }
  .smooth .fill { transition: fill 2s; }
  .still .drift.on { animation: none; }
  @media (prefers-reduced-motion: reduce) { .drift.on { animation: none; } }
  .replay { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; padding: 4px 4px 2px;
            font: 13px/1.4 var(--paper-font-body1_-_font-family, sans-serif); color: var(--secondary-text-color, #8a9199); }
  .replay[hidden], .replay [hidden] { display: none !important; }
  .replay button, .replay select, .replay input { font: inherit; color: var(--primary-text-color, #222);
            background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #ccc); border-radius: 6px; padding: 3px 8px; }
  .replay button { cursor: pointer; }
  .replay button.main { background: var(--primary-color, #03a9f4); border-color: transparent; color: var(--text-primary-color, #fff); }
  .replay .row { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; width: 100%; }
  .replay .pos { flex: 1 1 140px; min-width: 120px; }
  .replay .time { font-variant-numeric: tabular-nums; min-width: 9em; }
`;

/** A state as °C (null if not a number), converting °F and K. */
export function celsius(state, unit) {
  let v = parseFloat(state);
  if (Number.isNaN(v)) return null;
  if (unit === "°F") v = ((v - 32) * 5) / 9;
  else if (unit === "K") v -= 273.15;
  return v;
}

/** Index of the last point at or before t in a series of [time, state] sorted by time; -1 if none. */
export function indexAt(series, t) {
  let lo = 0, hi = (series?.length ?? 0) - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= t) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at;
}

/** The state of a series at time t (the last point at or before t), or null. */
export function valueAt(series, t) {
  const i = indexAt(series, t);
  return i < 0 ? null : series[i][1];
}

/**
 * The breathing cycles in a stretch of history, with each one's peaks.
 * A cycle runs from one start of the lead unit's exhaust to the next. Its hood peak is the highest inside-probe
 * reading of a unit while that unit exhausts (the warmest hood air the probes saw); its peak per unit is the highest
 * reading at that unit's end of its hose (its wye sensor, else its inside probe) while it exhausts.
 * lead: phase series of the lead unit; sides: [{ phase, inside, air }] series per unit, in °C (air: wye or inside).
 * Returns [{ start, end, peak, sides: [left, right] }] for the complete cycles, oldest first.
 */
export function cyclePeaks(lead, sides) {
  const starts = [];
  for (let i = 1; i < (lead?.length ?? 0); i++) {
    if (lead[i][1] === "exhaust" && lead[i - 1][1] !== "exhaust") starts.push(lead[i][0]);
  }
  const highest = (series, phase, a, b) => {
    let top = null;
    if (!phase || !series) return top;
    for (let i = Math.max(0, indexAt(series, a)); i < series.length && series[i][0] < b; i++) {
      const v = series[i][1];
      if (has(v) && valueAt(phase, Math.max(series[i][0], a)) === "exhaust" && (top === null || v > top)) top = v;
    }
    return top;
  };
  const cycles = [];
  for (let k = 0; k + 1 < starts.length; k++) {
    const a = starts[k], b = starts[k + 1];
    const each = sides.map(({ phase, inside, air }) => ({ hood: highest(inside, phase, a, b), hose: highest(air || inside, phase, a, b) }));
    const peaks = each.map((x) => x.hood).filter((x) => x !== null);
    if (peaks.length) cycles.push({ start: a, end: b, peak: Math.max(...peaks), sides: each.map((x) => x.hose) });
  }
  return cycles;
}

/**
 * A value that changes once per cycle, made smooth: during a complete cycle it fades from the previous cycle's
 * value (at its start) to its own (at its end), so it moves ahead of the next flip; after the last complete cycle,
 * where the next value is not known yet, it stays at that last value. null before the first complete cycle.
 * pick(cycle) gives the value of a cycle (default: its hood peak).
 */
export function cycleEstimate(cycles, t, pick = (c) => c.peak) {
  let k = -1;
  for (let i = 0; i < cycles.length && cycles[i].start <= t; i++) k = i;
  if (k < 0) return null;
  const c = cycles[k], to = pick(c);
  if (!has(to)) return null;
  if (t >= c.end) return to; // no complete cycle after this one yet: hold its value
  const prev = k > 0 ? pick(cycles[k - 1]) : null, from = has(prev) ? prev : to;
  return from + ((to - from) * (t - c.start)) / (c.end - c.start);
}

/** The hood temperature at time t from the cycle peaks (see cycleEstimate). */
export function hoodEstimate(cycles, t) { return cycleEstimate(cycles, t); }

function reading(hass, entity) {
  if (!entity) return null;
  const s = hass.states[entity];
  return s ? celsius(s.state, s.attributes.unit_of_measurement) : null;
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

/** history/history_during_period's answer as { entity: [[ms, state], ...] }, sorted by time. */
function toSeries(res) {
  const series = {};
  for (const [entity, states] of Object.entries(res || {})) {
    series[entity] = states.map((x) => [(x.lu ?? x.lc) * 1000, x.s]).filter((x) => !Number.isNaN(x[0])).sort((a, b) => a[0] - b[0]);
  }
  return series;
}

/** Per unit: its phase series and its inside probe series in °C, for cyclePeaks. */
function sideSeries(cfg, series, units) {
  return SIDES.map((s) => ({
    phase: series[cfg[s].phase],
    inside: (series[cfg[s].inside] || []).map(([t, v]) => [t, celsius(v, units[cfg[s].inside])]),
    air: cfg[s].wye ? (series[cfg[s].wye] || []).map(([t, v]) => [t, celsius(v, units[cfg[s].wye])]) : null,
  }));
}

const SPEEDS = [30, 60, 120, 300, 600, 1800];
const EASE_MS = 450; // replay: how quickly the colours follow the timeline (screen time)
const clone = (x) => JSON.parse(JSON.stringify(x));
const REPLAY_BAR = `<div class="replay">
  <div class="row"><button class="open">Replay</button><span class="msg"></span></div>
  <div class="row panel" hidden>
    <label>From <input class="from" type="datetime-local"></label>
    <label>To <input class="to" type="datetime-local"></label>
    <button class="load main">Load</button>
  </div>
  <div class="row player" hidden>
    <button class="play">Play</button>
    <select class="speed" title="Playback speed">${SPEEDS.map((x) => `<option value="${x}">${x}×</option>`).join("")}</select>
    <input class="pos" type="range" min="0" max="1000" value="0" aria-label="Replay position">
    <span class="time"></span>
  </div>
</div>`;

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

  _unit(hass) {
    const system = hass.config?.unit_system?.temperature;
    return this._cfg.unit === "auto" ? (system === "°F" ? "°F" : "°C") : this._cfg.unit;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._cfg) return;
    if (this._rp) return; // replaying: live updates wait until it ends
    // Home Assistant sets hass on every state change in the house; only redraw when one of ours changed.
    const seen = [hass.config?.unit_system?.temperature, ...this._entities.map((e) => hass.states[e])];
    if (this._built && this._seen && seen.every((x, i) => x === this._seen[i])) return;
    this._seen = seen;
    const r = readAll(hass, this._cfg);
    this._trackPeaks(r);
    const p = paint(this._cfg, r, this._mem, { unit: this._unit(hass) });
    if (!this._built) {
      this._build(p);
      this._seedPeaks();
    }
    this._apply(p);
  }

  // ---- The hood without a sensor: the peak of the last complete breathing cycle (see cyclePeaks). Live, the peak
  // of the cycle under way is not known until it ends, so the hood holds the last one and moves on at each new cycle.

  _estimating() {
    const c = this._cfg;
    return !!(c.left.phase || c.right.phase);
  }

  _lead() { return this._cfg.left.phase ? "left" : "right"; }

  /** Live cycle values: sets r.hood_estimate and r[side].hose from the last complete cycle. */
  _trackPeaks(r) {
    const pk = this._pk;
    if (!pk || !this._estimating()) return;
    const lead = r[this._lead()].phase;
    if (lead === "exhaust" && pk.lead !== undefined && pk.lead !== "exhaust") {
      // A new cycle: the one just ended is complete.
      if (pk.cur !== null) pk.last = pk.cur;
      SIDES.forEach((_, i) => { if (pk.sideCur[i] !== null) pk.sideLast[i] = pk.sideCur[i]; });
      pk.cur = null;
      pk.sideCur = [null, null];
    }
    pk.lead = lead;
    SIDES.forEach((s, i) => {
      if (r[s].phase !== "exhaust") return;
      const v = r[s].inside, air = known(r[s].wye, v);
      if (has(v) && (pk.cur === null || v > pk.cur)) pk.cur = v;
      if (has(air) && (pk.sideCur[i] === null || air > pk.sideCur[i])) pk.sideCur[i] = air;
    });
    r.hood_estimate = pk.last;
    SIDES.forEach((s, i) => { r[s].hose = pk.sideLast[i]; });
  }

  /** Start the live peak tracker from the last two hours of history, so the hood is right from the first moment. */
  async _seedPeaks() {
    this._pk = { last: null, cur: null, lead: undefined, sideLast: [null, null], sideCur: [null, null] };
    if (!this._estimating() || !this._hass?.callWS) return;
    const c = this._cfg, pk = this._pk, end = new Date(), start = new Date(end.getTime() - 2 * 3600000);
    const ids = SIDES.flatMap((s) => [c[s].phase, c[s].inside, c[s].wye]).filter(Boolean);
    try {
      const res = await this._hass.callWS({
        type: "history/history_during_period", start_time: start.toISOString(), end_time: end.toISOString(),
        entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false,
      });
      if (this._pk !== pk) return; // rebuilt meanwhile
      const series = toSeries(res);
      const units = Object.fromEntries(ids.map((e) => [e, this._hass.states[e]?.attributes?.unit_of_measurement]));
      const cycles = cyclePeaks(series[c[this._lead()].phase], sideSeries(c, series, units));
      const last = cycles[cycles.length - 1];
      pk.last = last ? last.peak : null;
      pk.sideLast = last ? [...last.sides] : [null, null];
      // The cycle under way: its highest exhausting readings so far.
      const since = last ? last.end : start.getTime();
      sideSeries(c, series, units).forEach(({ phase, inside, air }, i) => {
        for (const [t, v] of inside || []) {
          if (t >= since && has(v) && valueAt(phase, t) === "exhaust" && (pk.cur === null || v > pk.cur)) pk.cur = v;
        }
        for (const [t, v] of air || inside || []) {
          if (t >= since && has(v) && valueAt(phase, t) === "exhaust" && (pk.sideCur[i] === null || v > pk.sideCur[i])) pk.sideCur[i] = v;
        }
      });
      pk.lead = this._hass.states[c[this._lead()].phase]?.state;
      if (!this._rp) { this._seen = null; this.hass = this._hass; }
    } catch (err) {
      // No history: the hood falls back to the exhausting unit's inside probe.
    }
  }

  _build(p) {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><ha-card>${render(this._cfg, p, { live: true, uid: this._uid })}` +
      (this._cfg.replay ? REPLAY_BAR : "") + `</ha-card>`;
    this._svg = root.querySelector("svg");
    this._svg.classList.add(this._cfg.animate ? "smooth" : "still");
    this._addArrows();
    this._built = true;
    if (!this._cfg.replay) return;
    const q = (c) => root.querySelector(".replay ." + c);
    this._ui = { open: q("open"), panel: q("panel"), from: q("from"), to: q("to"), load: q("load"), player: q("player"),
                 play: q("play"), speed: q("speed"), pos: q("pos"), time: q("time"), msg: q("msg") };
    const u = this._ui;
    u.speed.value = String(this._cfg.replay_speed);
    if (u.speed.value !== String(this._cfg.replay_speed)) {
      u.speed.insertAdjacentHTML("beforeend", `<option value="${this._cfg.replay_speed}">${this._cfg.replay_speed}×</option>`);
      u.speed.value = String(this._cfg.replay_speed);
    }
    u.open.addEventListener("click", () => (this._rp || !u.panel.hidden ? this._live() : this._openReplay()));
    u.load.addEventListener("click", () => this._loadReplay());
    u.play.addEventListener("click", () => this._togglePlay());
    u.pos.addEventListener("input", () => {
      if (!this._rp) return;
      this._rp.t = this._rp.start + (this._rp.end - this._rp.start) * (u.pos.value / 1000);
      this._frame();
    });
  }

  disconnectedCallback() { if (this._rp) this._rp.playing = false; }

  // ---- Replay: the recorder's history of the card's sensors, played back in the same picture.

  _openReplay() {
    const u = this._ui, now = new Date();
    const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    if (!u.from.value) u.from.value = local(new Date(now.getTime() - this._cfg.replay_hours * 3600000));
    if (!u.to.value) u.to.value = local(now);
    u.panel.hidden = false;
    u.open.textContent = "Back to live";
    u.msg.textContent = "";
  }

  _live() {
    const u = this._ui;
    if (this._rp) this._rp.playing = false;
    this._rp = null;
    u.panel.hidden = true;
    u.player.hidden = true;
    u.open.textContent = "Replay";
    u.msg.textContent = "";
    this._svg.classList.toggle("smooth", !!this._cfg.animate);
    this._seen = null;
    if (this._hass) this.hass = this._hass;
    this._seedPeaks();
  }

  async _loadReplay() {
    const u = this._ui, hass = this._hass;
    const start = new Date(u.from.value), end = new Date(u.to.value);
    if (!(start < end)) { u.msg.textContent = "The start must be before the end."; return; }
    if (this._rp) this._rp.playing = false;
    u.msg.textContent = "Loading the history…";
    u.load.disabled = true;
    try {
      // An hour more on each side, so the first cycle has a previous peak and the last one can be finished.
      const from = new Date(start.getTime() - 3600000), until = new Date(Math.min(Date.now(), end.getTime() + 3600000));
      const res = await hass.callWS({
        type: "history/history_during_period", start_time: from.toISOString(), end_time: until.toISOString(),
        entity_ids: this._entities, minimal_response: true, no_attributes: true, significant_changes_only: false,
      });
      const series = toSeries(res);
      const points = Object.values(series).reduce((n, x) => n + x.length, 0);
      if (!points) { u.msg.textContent = "The recorder has no history for these sensors in that period."; return; }
      // Units as the sensors report them now (history requested without attributes).
      const units = Object.fromEntries(this._entities.map((e) => [e, hass.states[e]?.attributes?.unit_of_measurement]));
      const c = this._cfg;
      const cycles = this._estimating() ? cyclePeaks(series[c[this._lead()].phase], sideSeries(c, series, units)) : [];
      this._rp = { series, units, cycles, start: start.getTime(), end: end.getTime(), t: start.getTime(), playing: false, unit: this._unit(hass) };
      this._svg.classList.remove("smooth"); // colours follow the timeline at once
      u.player.hidden = false;
      u.msg.textContent = "";
      this._frame();
      this._togglePlay();
    } catch (err) {
      u.msg.textContent = "Could not load the history: " + (err?.message || err);
    } finally {
      u.load.disabled = false;
    }
  }

  _togglePlay() {
    const rp = this._rp, u = this._ui;
    if (!rp) return;
    if (rp.t >= rp.end) rp.t = rp.start;
    rp.playing = !rp.playing;
    u.play.textContent = rp.playing ? "Pause" : "Play";
    if (!rp.playing) return;
    const loop = (rp.loop = (rp.loop || 0) + 1); // a newer Play ends this loop
    let last = performance.now();
    const step = (now) => {
      if (this._rp !== rp || !rp.playing || rp.loop !== loop) return;
      rp.t = Math.min(rp.end, rp.t + (now - last) * Number(u.speed.value || this._cfg.replay_speed));
      last = now;
      this._frame();
      if (rp.t >= rp.end) { rp.playing = false; u.play.textContent = "Play"; return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** The readings at the replay's current time, and each unit's last exhaust and intake readings before it. */
  _frame() {
    const rp = this._rp, c = this._cfg, u = this._ui;
    if (!rp) return;
    const t = rp.t;
    const at = (e) => (e ? celsius(valueAt(rp.series[e], t), rp.units[e]) : null);
    const r = {}, mem = {};
    for (const s of SIDES) {
      const k = c[s];
      r[s] = { inside: at(k.inside), outside: at(k.outside), wye: at(k.wye), outlet: at(k.outlet), phase: k.phase ? valueAt(rp.series[k.phase], t) : null };
      mem[s] = {};
      const ph = rp.series[k.phase] || [];
      // The most recent exhaust before now: read the sensors just before it ended.
      for (let i = indexAt(ph, t); i >= 0 && mem[s].ex === undefined; i--) {
        const endAt = Math.min(t, i + 1 < ph.length ? ph[i + 1][0] : t) - 1000;
        const v = (e) => (e ? celsius(valueAt(rp.series[e], endAt), rp.units[e]) : null);
        if (ph[i][1] === "exhaust" && mem[s].ex === undefined) { mem[s].exIn = v(k.inside); mem[s].ex = known(v(k.wye), mem[s].exIn); }
      }
    }
    for (const key of SHARED_SLOTS) r[key] = at(c[key]);
    const rooms = c.room.map(at).filter((x) => x !== null);
    r.room = rooms.length ? rooms.reduce((a, b) => a + b, 0) / rooms.length : null;
    r.hood_estimate = rp.cycles.length ? hoodEstimate(rp.cycles, t) : null;
    SIDES.forEach((s, i) => { r[s].hose = rp.cycles.length ? cycleEstimate(rp.cycles, t, (cy) => cy.sides[i]) : null; });
    this._apply(paint(c, r, mem, { unit: rp.unit }), true);
    const when = new Date(t), span = rp.end - rp.start;
    const label = when.toLocaleString(undefined, span > 20 * 3600000
      ? { weekday: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const sub = this._el("t-sub");
    if (sub) sub.textContent = "replay · " + label;
    u.time.textContent = label;
    u.pos.value = String(Math.round(((t - rp.start) / span) * 1000));
  }

  _el(key) { return this.shadowRoot.getElementById(`${key}-${this._uid}`); }

  /**
   * Show a paint. Live, colours change at once and CSS fades them over 2 s. In a replay (ease = true) the colours
   * glide toward the paint over about half a second of screen time, whatever the speed, so a quick swing in the
   * readings never shows as a jump; the readings in the badges are exact.
   */
  _apply(p, ease = false) {
    if (!this._rp) { const sub = this._el("t-sub"); if (sub && sub.textContent !== (this._cfg.subtitle || "")) sub.textContent = this._cfg.subtitle || ""; }
    for (const [key, text] of Object.entries(p.texts)) { const e = this._el(key); if (e && e.textContent !== text) e.textContent = text; }
    for (const [key, on] of Object.entries(p.active)) { const e = this._el(key); if (e) e.classList.toggle("idle", !on); }
    for (const [key, [on, rev]] of Object.entries(p.streaks)) {
      const e = this._el(key);
      if (!e) continue;
      e.classList.toggle("on", on);
      e.classList.toggle("rev", !!rev);
      const f = this._el(key + "-f"), r = this._el(key + "-r");
      if (f) f.style.display = on && !rev ? "" : "none";
      if (r) r.style.display = on && rev ? "" : "none";
    }
    this._target = { grads: p.grads, fills: p.fills };
    if (ease) this._ease();
    else this._paintColours((this._shown = clone(this._target)));
  }

  _paintColours(c) {
    for (const [key, [t1, t2]] of Object.entries(c.grads)) {
      const g = this._el(key);
      if (!g) continue;
      g.querySelectorAll("stop").forEach((s, i) => { s.style.stopColor = colour(along(t1, t2, i)); });
    }
    for (const [key, t] of Object.entries(c.fills)) { const e = this._el(key); if (e) e.style.fill = colour(t); }
  }

  _ease() {
    if (this._easing) return;
    this._easing = true;
    if (!this._shown) this._shown = clone(this._target);
    let last = performance.now();
    const step = (now) => {
      const k = 1 - Math.exp(-(now - last) / EASE_MS), tgt = this._target, cur = this._shown;
      last = now;
      let moving = false;
      const toward = (a, b) => {
        if (!has(a) || !has(b)) return b;
        const v = a + (b - a) * k;
        if (Math.abs(b - v) > 0.1) { moving = true; return v; } // 0.1 °C: less than one colour step
        return b;
      };
      for (const [key, ends] of Object.entries(tgt.grads)) cur.grads[key] = ends.map((b, i) => toward(cur.grads[key]?.[i], b));
      for (const [key, b] of Object.entries(tgt.fills)) cur.fills[key] = toward(cur.fills[key], b);
      this._paintColours(cur);
      if (moving && this._rp && this.isConnected !== false) requestAnimationFrame(step);
      else this._easing = false;
    };
    requestAnimationFrame(step);
  }

  /** White chevrons that glide along each airflow path (a forward and a reverse set per path), shown while air moves. */
  _addArrows() {
    if (!this._cfg.animate || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    const NS = "http://www.w3.org/2000/svg", SPACING = 30, SPEED = 21; // px between arrows, px per second
    for (const track of this._svg.querySelectorAll(".streak")) {
      const len = track.getTotalLength ? track.getTotalLength() : 0;
      if (!len) continue;
      const n = Math.max(1, Math.round(len / SPACING)), dur = len / SPEED;
      for (const [suffix, rev] of [["-f", false], ["-r", true]]) {
        const g = document.createElementNS(NS, "g");
        g.setAttribute("id", track.id.replace(/-(bd\d+)$/, `${suffix}-$1`));
        g.style.display = "none";
        for (let i = 0; i < n; i++) {
          const a = document.createElementNS(NS, "path");
          a.setAttribute("class", "chev");
          a.setAttribute("d", "M -3.5,-3.5 L 1.5,0 L -3.5,3.5");
          const m = document.createElementNS(NS, "animateMotion");
          m.setAttribute("dur", `${dur.toFixed(2)}s`);
          m.setAttribute("begin", `-${((i * dur) / n).toFixed(2)}s`);
          m.setAttribute("repeatCount", "indefinite");
          m.setAttribute("rotate", rev ? "auto-reverse" : "auto");
          m.setAttribute("keyPoints", rev ? "1;0" : "0;1");
          m.setAttribute("keyTimes", "0;1");
          m.setAttribute("calcMode", "linear");
          const mp = document.createElementNS(NS, "mpath");
          mp.setAttribute("href", "#" + track.id);
          mp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + track.id);
          m.appendChild(mp);
          a.appendChild(m);
          g.appendChild(a);
        }
        track.after(g);
      }
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
  {
    type: "expandable", name: "replay_options", title: "Replay", flatten: true, schema: [
      { name: "replay", selector: { boolean: {} } },
      { name: "replay_hours", selector: { number: { min: 0.25, max: 240, step: 0.25, mode: "box", unit_of_measurement: "h" } } },
      { name: "replay_speed", selector: { select: { mode: "dropdown", options: SPEEDS.map((x) => ({ value: String(x), label: `${x}×` })) } } },
    ],
  },
];
const LABELS = {
  title: "Title", subtitle: "Subtitle", animate: "Animate the airflow", unit: "Unit for the readings", name: "Name (may span lines)",
  inside: "Inside probe (room end of the core)", outside: "Outside probe (outdoor end of the core)",
  phase: "Phase sensor (exhaust / intake)", wye: "Wye sensor (optional, middle of the unit's wye)",
  outlet: "Outlet sensor (optional, in the room outlet)", hood: "Hood sensor (optional)",
  hood_wye: "Hood wye sensor (optional)", heater_intake: "Heater air intake sensor (optional)",
  room: "Room sensors (optional, averaged)", note: "Note under the heater's name",
  intake_name: "Air intake sensor label", intake_detail: "Air intake sensor detail", hose_note: "Note at the bottom",
  replay: "Show the Replay button", replay_hours: "Replay: default period (hours back)", replay_speed: "Replay: default speed",
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
    return { ...config, animate: config.animate !== false, replay: config.replay !== false,
      replay_speed: config.replay_speed === undefined ? undefined : String(config.replay_speed),
      room: room === undefined || room === null || room === "" ? [] : [].concat(room) };
  }

  _form_() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.schema = SCHEMA;
      this._form.computeLabel = (s) => LABELS[s.name] ?? s.name;
      this._form.addEventListener("value-changed", (ev) => {
        const value = { ...ev.detail.value };
        if (value.animate === true && this._config.animate === undefined) delete value.animate;
        if (value.replay === true && this._config.replay === undefined) delete value.replay;
        if (value.replay_speed !== undefined) value.replay_speed = Number(value.replay_speed);
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
