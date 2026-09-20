// public/data/cdsco-months.json: how many samples failed in each CDSCO monthly alert.
// The feed's CDSCO card draws one bar per month from it; without the file the card falls back
// to its "no months" state, so this runs before a build and the result is committed.
//
//   node scripts/cdsco-months.mjs [api-base]
//
// It pages /v1/notices?source=cdsco_nsq and counts by row_ref.month: every number on the chart
// is the regulator's own row count, not a figure typed here.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] ?? process.env.NEXT_PUBLIC_API_URL ?? "https://ilbmeuwrt7.execute-api.ap-south-1.amazonaws.com").replace(/\/+$/, "");
const OUT = join(HERE, "..", "public", "data", "cdsco-months.json");
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const order = (m) => {
  const [name, year] = m.split("-");
  return Number(year) * 12 + MONTHS.indexOf(name);
};

const counts = new Map();
let cursor = null;
let pages = 0;
do {
  const url = `${BASE}/v1/notices?source=cdsco_nsq&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${url} -> ${resp.status}`);
  const body = await resp.json();
  for (const notice of body.notices ?? []) {
    const month = notice.row_ref?.month;
    if (month) counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  cursor = body.next_cursor;
  pages += 1;
} while (cursor && pages < 60);

const months = [...counts.entries()]
  .map(([month, count]) => ({ month, count }))
  .filter(({ month }) => MONTHS.includes(month.split("-")[0]))
  .sort((a, b) => order(a.month) - order(b.month))
  .slice(-11);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(months, null, 2)}\n`);
console.log(`${pages} pages -> ${months.length} months:`, months.map((m) => `${m.month} ${m.count}`).join(", "));
