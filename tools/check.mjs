// Checks of the colouring rules (node tools/check.mjs); run in CI.
import assert from "node:assert/strict";
import { normalise, paint, renderStatic, along, colour, valueAt, indexAt, celsius, cyclePeaks, hoodEstimate } from "../basement-ducting-card.js";

const R = (left, right, extra = {}) => ({
  left: { inside: null, outside: null, phase: null, wye: null, outlet: null, ...left },
  right: { inside: null, outside: null, phase: null, wye: null, outlet: null, ...right },
  hood: null, hood_wye: null, heater_intake: null, room: null, ...extra,
});
const cfg = normalise({});

// A hose with a wye sensor keeps its last exhaust reading while its unit takes air in (dampers shut).
{
  const mem = { left: {}, right: {} };
  paint(cfg, R({ inside: 40, wye: 38, phase: "exhaust" }, { inside: 41, phase: "intake" }), mem);
  const p = paint(cfg, R({ inside: 15, wye: 14, phase: "intake" }, { inside: 42, phase: "exhaust" }), mem);
  assert.deepEqual(p.grads["g-hose-l"], [42, 38]);
}
// The estimated hood follows the exhausting unit, not a warmer one taking air in (summer).
{
  const p = paint(cfg, R({ inside: 23, phase: "exhaust" }, { inside: 29, phase: "intake" }));
  assert.equal(p.texts["t-hood"], "23.0 °C*");
}
// A hood or hood wye sensor wins, without the * mark.
assert.equal(paint(cfg, R({ inside: 23 }, { inside: 29 }, { hood_wye: 44 })).texts["t-hood"], "44.0 °C");
// An outlet sits behind its damper, open to the wye: the wye body's colour in every phase, down to its own sensor.
{
  const p = paint(cfg, R({ inside: 20, wye: 18, phase: "intake" }, { inside: 40, phase: "exhaust" }, { room: 22 }));
  assert.deepEqual(p.grads["g-out-l"], [18, 18]);
  assert.equal(p.texts["t-l-sup"], "18.0 °C");
  assert.deepEqual(p.grads["g-out-r"], [40, 40]);
  assert.equal(p.texts["t-r-sup"], "40.0 °C");
  const q = paint(cfg, R({ inside: 34, phase: "exhaust", outlet: 29 }, {}));
  assert.deepEqual(q.grads["g-out-l"], [34, 29]);
  assert.equal(q.texts["t-l-sup"], "29.0 °C");
}
// Display in °F; a missing gradient end takes the other end's colour; none at all is grey.
assert.equal(paint(cfg, R({ inside: 20 }, {}), undefined, { unit: "°F" }).texts["t-l-in"], "68.0 °F");
assert.equal(along(null, 30, 5), 30);
assert.equal(colour(along(null, null, 3)), "#9aa0a6");
// Forgiving options: a single note, a single marker, short unit names, empty names.
{
  const c = normalise({ notes: "one line", markers: { name: "x", side: "left" }, unit: "F", left: { name: "" }, heater: { name: "" } });
  assert.deepEqual(c.notes, ["one line"]);
  assert.equal(c.markers.length, 1);
  assert.equal(c.unit, "°F");
  assert.equal(c.left.name, "Recuperator 1");
  assert.equal(c.heater.name, "Heater");
  assert.equal(normalise({ markers: [{ name: "a" }, { name: "b" }, { name: "c", side: "right" }] }).markers.length, 2);
}
// Labels are escaped.
assert.ok(!renderStatic({ title: "<script>x</script>" }, {}).includes("<script>"));
// Replay: the state at a time is the last one at or before it; °F and K become °C.
{
  const series = [[100, "a"], [200, "b"], [300, "c"]];
  assert.equal(valueAt(series, 50), null);
  assert.equal(valueAt(series, 100), "a");
  assert.equal(valueAt(series, 250), "b");
  assert.equal(valueAt(series, 999), "c");
  assert.equal(indexAt([], 5), -1);
  assert.equal(valueAt(undefined, 5), null);
  assert.equal(celsius("212", "°F"), 100);
  assert.equal(Math.round(celsius("300", "K") * 100) / 100, 26.85);
  assert.equal(celsius("unavailable", "°C"), null);
  const c = normalise({});
  assert.equal(c.replay, true); assert.equal(c.replay_hours, 1.5); assert.equal(c.replay_speed, 120);
}
// The hood without a sensor: cycle peaks, fading from the previous peak to this one, holding after the last.
{
  const m = (x) => x * 60000;
  const ph = (pairs) => pairs.map(([t, v]) => [m(t), v]);
  const left = { phase: ph([[-8, "intake"], [0, "exhaust"], [8, "intake"], [16, "exhaust"], [24, "intake"], [32, "exhaust"], [40, "intake"]]),
                 inside: ph([[-8, 15], [0, 30], [8, 15], [16, 32], [24, 15], [32, 31], [40, 15]]) };
  const right = { phase: ph([[-8, "exhaust"], [0, "intake"], [8, "exhaust"], [16, "intake"], [24, "exhaust"], [32, "intake"], [40, "exhaust"]]),
                  inside: ph([[-8, 39], [0, 15], [8, 40], [16, 15], [24, 44], [32, 15], [40, 50]]) };
  const cycles = cyclePeaks(left.phase, [left, right]);
  assert.deepEqual(cycles.map((c) => [c.start / 60000, c.end / 60000, c.peak]), [[0, 16, 40], [16, 32, 44]]);
  assert.equal(hoodEstimate(cycles, m(-4)), null);   // before the first complete cycle
  assert.equal(hoodEstimate(cycles, m(8)), 40);      // first cycle: no previous peak, its own
  assert.equal(hoodEstimate(cycles, m(16)), 40);     // a cycle starts at the previous peak...
  assert.equal(hoodEstimate(cycles, m(24)), 42);     // ...and fades to its own
  assert.equal(hoodEstimate(cycles, m(45)), 44);     // the cycle under way: hold the last known peak
  // An estimate from the cycles is used before the probes' own estimate, with the * mark.
  const p = paint(normalise({}), R({ inside: 20, phase: "exhaust" }, { inside: 25, phase: "intake" }, { hood_estimate: 43 }));
  assert.equal(p.texts["t-hood"], "43.0 °C*");
}
console.log("all checks passed");
