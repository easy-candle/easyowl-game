// Generates synthetic EURUSD 5m data so the app runs out of the box.
// Replace public/data/eurusd-5m.json with real data (see csv-to-json.js).
import { writeFileSync } from 'node:fs';

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

const start = Date.UTC(2025, 0, 1) / 1000;
const end = start + 365 * 86400;
const out = [];
let price = 1.035;
let vol = 0.00012;

for (let t = start; t < end; t += 300) {
  const d = new Date(t * 1000);
  const day = d.getUTCDay();
  const h = d.getUTCHours();
  if (day === 6) continue;
  if (day === 5 && h >= 22) continue;
  if (day === 0 && h < 22) continue;

  const session = h >= 7 && h < 17 ? 1.4 : 0.7;
  vol = Math.min(0.0003, Math.max(0.00006, vol * 0.98 + 0.02 * 0.00012 + Math.abs(gauss()) * 0.000005));
  const sd = vol * session;
  const open = price;
  const close = open + gauss() * sd;
  const high = Math.max(open, close) + Math.abs(gauss()) * sd * 0.5;
  const low = Math.min(open, close) - Math.abs(gauss()) * sd * 0.5;
  const r = (x) => Math.round(x * 1e5) / 1e5;
  out.push([t, r(open), r(high), r(low), r(close)]);
  price = close;
}

writeFileSync('public/data/eurusd-5m.json', JSON.stringify(out));
console.log('candles:', out.length);
