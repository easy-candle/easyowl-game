// Usage: node scripts/csv-to-json.js input.csv
// CSV columns: time,open,high,low,close
// time can be unix seconds or a date string like "2025-01-01 00:05" (treated as UTC).
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/csv-to-json.js input.csv'); process.exit(1); }

const rows = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
const out = [];
for (const line of rows) {
  const p = line.split(/[,;\t]/);
  if (p.length < 5) continue;
  let t = Number(p[0]);
  if (Number.isNaN(t)) {
    t = Date.parse(p[0].replace(/\./g, '-').replace(' ', 'T') + 'Z') / 1000;
  }
  const [o, h, l, c] = p.slice(1, 5).map(Number);
  if (!t || [o, h, l, c].some(Number.isNaN)) continue;
  out.push([t, o, h, l, c]);
}
out.sort((a, b) => a[0] - b[0]);
writeFileSync('public/data/eurusd-5m.json', JSON.stringify(out));
console.log('candles:', out.length);
