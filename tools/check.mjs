// Checks of the colouring rules (node tools/check.mjs); run in CI.
import assert from "node:assert/strict";
import { normalise, paint, renderStatic, along, colour, valueAt, indexAt, celsius } from "../basement-ducting-card.js";

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
// An outlet: supply while taking air in (from the wye), else its own sensor, else the room.
{
  const p = paint(cfg, R({ inside: 20, wye: 18, phase: "intake" }, { inside: 40, phase: "exhaust" }, { room: 22 }));
  assert.deepEqual(p.grads["g-out-l"], [18, 18]);
  assert.equal(p.texts["t-l-sup"], "18.0 °C");
  assert.deepEqual(p.grads["g-out-r"], [22, 22]);
  assert.equal(p.texts["t-r-sup"], "idle");
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
console.log("all checks passed");
