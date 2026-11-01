// Write a static picture of the card from fixed readings, for a README or a wiki.
// Usage: node tools/render.mjs config.json readings.json out.svg [°C|°F]
//   config.json:   the card's options, as in the dashboard YAML (JSON form)
//   readings.json: { "left": { "inside", "outside", "wye", "outlet", "supply" }, "right": {...},
//                    "hood", "hood_wye", "heater_intake", "room" }   (°C; any may be left out)
import { readFileSync, writeFileSync } from "node:fs";
import { renderStatic } from "../basement-ducting-card.js";

const [config, readings, out, unit = "°C"] = process.argv.slice(2);
if (!out) {
  console.error("usage: node tools/render.mjs config.json readings.json out.svg [°C|°F]");
  process.exit(2);
}
const svg = renderStatic(JSON.parse(readFileSync(config, "utf8")), JSON.parse(readFileSync(readings, "utf8")), { unit });
writeFileSync(out, svg);
console.log("wrote", out);
