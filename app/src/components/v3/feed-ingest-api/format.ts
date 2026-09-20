/**
 * Formatting. All times are shown in IST (Asia/Kolkata) through Intl, so server and
 * client render the same string. Date-only fields ("2026-07-01") are never shifted.
 */

const IST = "Asia/Kolkata";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** 4868 → "4,868" */
export const fmtInt = (n: number): string => n.toLocaleString("en-IN");

/** 27100 → "27.1" (seconds, one decimal) */
export const fmtSec = (ms: number): string => (Math.round(ms / 100) / 10).toFixed(1);

const pad = (n: number) => String(n).padStart(2, "0");

interface Ymd { y: number; m: number; d: number }

function ymdOf(dateOrIso: string): Ymd {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOrIso)) {
    const [y, m, d] = dateOrIso.split("-").map(Number);
    return { y, m, d };
  }
  const p = istParts(dateOrIso);
  return { y: p.y, m: p.m, d: p.d };
}

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Calendar parts of an ISO instant in IST. */
export function istParts(iso: string): Ymd & { hh: number; mm: number; ymd: string } {
  const get = (t: string) => Number(partsFmt.formatToParts(new Date(iso)).find((p) => p.type === t)?.value ?? 0);
  const y = get("year"), m = get("month"), d = get("day"), hh = get("hour"), mm = get("minute");
  return { y, m, d, hh, mm, ymd: `${y}-${pad(m)}-${pad(d)}` };
}

/** "2026-07-01" | ISO → "01 Jul 2026" */
export function fmtDate(dateOrIso: string): string {
  const { y, m, d } = ymdOf(dateOrIso);
  return `${pad(d)} ${MON[m - 1]} ${y}`;
}

/** "2026-09-17" → "17 Sep" */
export function fmtDayMonth(dateOrIso: string): string {
  const { m, d } = ymdOf(dateOrIso);
  return `${pad(d)} ${MON[m - 1]}`;
}

/** "2026-09-17" → "Thursday, 17 Sep 2026" */
export function fmtWeekdayDate(dateOrIso: string): string {
  const { y, m, d } = ymdOf(dateOrIso);
  return `${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${fmtDate(dateOrIso)}`;
}

/** ISO → "15:08" (IST) */
export function fmtTime(iso: string): string {
  const p = istParts(iso);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

/** ISO → "19 Sep 2026, 00:10" (IST) */
export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)}, ${fmtTime(iso)}`;
}

/** ISO → "19 Sep, 00:10" (IST) */
export function fmtDayMonthTime(iso: string): string {
  return `${fmtDayMonth(iso)}, ${fmtTime(iso)}`;
}

/** Whether `iso` falls on the same IST day as `now`, the day before, or earlier. */
export function dayRelation(iso: string, now: string): "today" | "yesterday" | "earlier" {
  const a = istParts(iso).ymd;
  const n = istParts(now);
  if (a === n.ymd) return "today";
  const prev = new Date(Date.UTC(n.y, n.m - 1, n.d - 1));
  const prevYmd = `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
  return a === prevYmd ? "yesterday" : "earlier";
}

/** "15:08" today, "23:54 yesterday", else "17 Sep, 23:54" */
export function fmtWhen(iso: string, now: string): string {
  const rel = dayRelation(iso, now);
  if (rel === "today") return fmtTime(iso);
  if (rel === "yesterday") return `${fmtTime(iso)} yesterday`;
  return fmtDayMonthTime(iso);
}

/** Minutes between two instants (b − a), rounded down. */
export const minutesBetween = (a: string, b: string): number => Math.floor((Date.parse(b) - Date.parse(a)) / 60000);

/** "JUL-2026" → { long: "July 2026", short: "JUL 2026", key: "JUL-2026" } */
export function monthLabel(key: string): { long: string; short: string; key: string } {
  const [mon, year] = key.split("-");
  const i = MON.findIndex((m) => m.toUpperCase() === mon?.toUpperCase());
  return { long: i >= 0 ? `${MONTH[i]} ${year}` : key, short: `${mon?.toUpperCase()} ${year}`, key };
}

/** "2026-07-01" → "JUL-2026" */
export function monthKeyOf(date: string): string {
  const { y, m } = ymdOf(date);
  return `${MON[m - 1].toUpperCase()}-${y}`;
}

/** Sentence case for labels that arrive in title or upper case ("Subpotent Product" → "Subpotent product"). */
export function sentenceCase(s: string): string {
  const t = s.trim();
  return t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : t;
}

/** "compass" → "Compass" (NHTSA sends lower case) */
export const titleWord = (s: string): string => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** "JUN-2025" → "2025-06-01" */
export function monthStart(key: string): string {
  const [mon, year] = key.split("-");
  const i = MON.findIndex((m) => m.toUpperCase() === mon?.toUpperCase());
  return `${year}-${pad(i + 1)}-01`;
}

/** YYYY-MM-DD, `n` days before `now` in IST (the "CPSC this week" example uses today − 5). */
export function daysBefore(now: string, n: number): string {
  const p = istParts(now);
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d - n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
