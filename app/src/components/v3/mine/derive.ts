/**
 * Pure helpers for /mine: face derivation, sort, counts, copy and formatting.
 * No React, no I/O. Everything here is deterministic so server and client render the same text.
 */
import type {
  CheckStatus,
  Face,
  HouseholdItem,
  ItemKind,
  MineFilter,
  MineStats,
  NoticeView,
  OcrResult,
  OcrWord,
  SourceKey,
  SourceStep,
  StatusFilter,
} from "./types";

/* ------------------------------------------------------------ formatting */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_MS = 330 * 60_000;

function isDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** A Date whose UTC fields read as IST wall time (date-only strings stay on their calendar day). */
function istParts(iso: string): Date {
  const d = new Date(iso);
  return isDateOnly(iso) ? d : new Date(d.getTime() + IST_MS);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "15:08" (IST, 24 h). */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = istParts(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "01 Jul 2026" (IST). */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = istParts(iso);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Whole calendar days from a to b in IST (b − a). */
export function daysBetween(a: string, b: string): number {
  const da = istParts(a);
  const db = istParts(b);
  const ua = Date.UTC(da.getUTCFullYear(), da.getUTCMonth(), da.getUTCDate());
  const ub = Date.UTC(db.getUTCFullYear(), db.getUTCMonth(), db.getUTCDate());
  return Math.round((ub - ua) / 86_400_000);
}

/** "4,868" */
export function fmtCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** Parse "12 Jul 2026", "12/07/2026" or "2026-07-12" into "2026-07-12"; null when unreadable. */
export function parseHumanDate(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (isDateOnly(s)) return s;
  let m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(s);
  if (m) {
    const mi = MONTHS.findIndex((x) => x.toLowerCase() === m![2].slice(0, 3).toLowerCase());
    if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(Number(m[1]))}`;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return null;
}

/** "CDSCO, CPSC, NHTSA and openFDA" */
export function joinSources(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export const SOURCE_ORDER: SourceKey[] = ["cdsco_nsq", "cpsc", "nhtsa", "openfda"];
export const SOURCE_LABEL: Record<SourceKey, string> = {
  cdsco_nsq: "CDSCO",
  cpsc: "CPSC",
  nhtsa: "NHTSA",
  openfda: "openFDA",
};

/* ------------------------------------------------------------------ faces */

/** spec §1 "Face derivation" (unchanged from v2); `checking` overrides while check-status is RUNNING. */
export function deriveFace(item: HouseholdItem, check?: CheckStatus | null): Face {
  if (check?.status === "RUNNING") return "checking";
  if (item.status === "alert") return "alert";
  if (item.status === "hold") return "needs-you";
  if (item.case?.decision === "dismiss") return "near-miss";
  if (item.last_checked_at) return "clear";
  return "unchecked";
}

export const BIG_FACES: ReadonlySet<Face> = new Set<Face>(["alert", "needs-you", "near-miss", "checking"]);

const RANK: Record<Face, number> = { alert: 0, "needs-you": 1, "near-miss": 2, checking: 3, unchecked: 3, clear: 4 };

/** Card title: vehicles carry their year ("Jeep Compass 2022"). */
export function displayName(item: HouseholdItem): string {
  if (item.kind === "vehicle" && item.year && !item.name.includes(String(item.year))) return `${item.name} ${item.year}`;
  return item.name;
}

const byName = (a: HouseholdItem, b: HouseholdItem) =>
  displayName(a).localeCompare(displayName(b), "en", { sensitivity: "base" });

/**
 * "Needs you first" (spec §2.5): alert (newest notice first) → needs-you → near-miss →
 * checking and unchecked → clear A–Z.
 */
export function sortItems(
  items: HouseholdItem[],
  faces: Record<string, Face>,
  notices: Record<string, NoticeView | undefined>,
): HouseholdItem[] {
  return [...items].sort((a, b) => {
    const fa = faces[a.item_id] ?? "unchecked";
    const fb = faces[b.item_id] ?? "unchecked";
    if (RANK[fa] !== RANK[fb]) return RANK[fa] - RANK[fb];
    if (fa === "alert" && fb === "alert") {
      const pa = (a.notice_id && notices[a.notice_id]?.published_at) || "";
      const pb = (b.notice_id && notices[b.notice_id]?.published_at) || "";
      if (pa !== pb) return pa < pb ? 1 : -1;
    }
    return byName(a, b);
  });
}

export interface FaceCounts {
  total: number;
  alert: number;
  "needs-you": number;
  "near-miss": number;
  checking: number;
  clear: number;
  unchecked: number;
}

export function countFaces(faces: Face[]): FaceCounts {
  const c: FaceCounts = { total: faces.length, alert: 0, "needs-you": 0, "near-miss": 0, checking: 0, clear: 0, unchecked: 0 };
  for (const f of faces) c[f] += 1;
  return c;
}

/* ---------------------------------------------------------------- filters */

export function matchesStatus(face: Face, show: StatusFilter): boolean {
  return show === "all" || face === show;
}

/** If the URL asks for a pill that is hidden (needs-you at 0), fall back to All (spec §2.4). */
export function effectiveFilter(filter: MineFilter, counts: FaceCounts): MineFilter {
  if (filter.show === "needs-you" && counts["needs-you"] === 0) return { ...filter, show: "all" };
  return filter;
}

/** Counts in each group reflect the other group's selection (spec §2.4). */
export function filterCounts(items: HouseholdItem[], faces: Record<string, Face>, filter: MineFilter) {
  const status: Record<StatusFilter, number> = { all: 0, alert: 0, "needs-you": 0, "near-miss": 0, clear: 0 };
  const kind: Record<ItemKind, number> = { medicine: 0, vehicle: 0, appliance: 0, other: 0 };
  for (const it of items) {
    const f = faces[it.item_id] ?? "unchecked";
    if (filter.kind === null || it.kind === filter.kind) {
      status.all += 1;
      if (f === "alert" || f === "needs-you" || f === "near-miss" || f === "clear") status[f] += 1;
    }
    if (matchesStatus(f, filter.show)) kind[it.kind] += 1;
  }
  return { status, kind };
}

/* ------------------------------------------------------------------- copy */

export type HeadlinePattern = "alerts" | "needs-you" | "first-check" | "all-clear" | "empty";

/** OutcomeLine (spec §2.2). `n` is the rolling number; `before`/`after` wrap it. */
export function headline(counts: FaceCounts, checkedAt: string | null): { pattern: HeadlinePattern; n: number | null; before: string; after: string; text: string } {
  const make = (pattern: HeadlinePattern, n: number | null, before: string, after: string) => ({
    pattern,
    n,
    before,
    after,
    text: `${before}${n ?? ""}${after}`,
  });
  if (counts.total === 0) return make("empty", null, "Add the things in your house", "");
  if (counts.alert > 0) return make("alerts", counts.alert, "", counts.alert === 1 ? " thing you own is on a notice" : " things you own are on a notice");
  if (counts["needs-you"] > 0) return make("needs-you", counts["needs-you"], "", counts["needs-you"] === 1 ? " thing needs you" : " things need you");
  const settled = counts.total - counts.checking - counts.unchecked;
  if (settled === 0 && counts.checking > 0) return make("first-check", counts.total, "Checking ", ` things against 4 sources`);
  return make("all-clear", null, `No match in 4 sources as of ${fmtTime(checkedAt)}`, "");
}

/** Latest `last_checked_at` across items. */
export function latestCheck(items: HouseholdItem[]): string | null {
  let best: string | null = null;
  for (const it of items) if (it.last_checked_at && (!best || it.last_checked_at > best)) best = it.last_checked_at;
  return best;
}

function pollMinutes(s: string): number | null {
  const m = /(\d+)\s*(min|minute|minutes|h|hour|hours|day|days)/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  return u.startsWith("min") ? n : u.startsWith("h") ? n * 60 : n * 1440;
}

/** Next poll: `next_poll_at` when the API sends it, else the soonest `last_run_at + polls_every`. */
export function nextPoll(stats: MineStats): string | null {
  if (stats.next_poll_at) return stats.next_poll_at;
  let best: number | null = null;
  for (const s of stats.sources) {
    const mins = pollMinutes(s.polls_every);
    if (!mins || !s.last_run_at) continue;
    const t = new Date(s.last_run_at).getTime() + mins * 60_000;
    if (best === null || t < best) best = t;
  }
  return best === null ? null : new Date(best).toISOString();
}

/** Alert band source line (spec §2.6). Never "recalled" for CDSCO. */
export function sourceLine(n: NoticeView): { main: string; detail: string | null } {
  switch (n.source) {
    case "cdsco_nsq":
      return { main: "Failed CDSCO quality test", detail: `${n.month ?? ""} alert, row ${n.row ?? "?"}` };
    case "nhtsa":
      return { main: `NHTSA recall ${n.campaign ?? n.notice_id}`, detail: null };
    case "cpsc":
      return { main: `CPSC recall ${n.number ?? n.notice_id}`, detail: null };
    case "openfda":
      return { main: `openFDA recall ${n.recall_number ?? n.notice_id}`, detail: null };
  }
}

/** "CDSCO JUL-2026 alert, row 12" */
export function cdscoRef(n: NoticeView): string {
  return `CDSCO ${n.month ?? ""} alert, row ${n.row ?? "?"}`;
}

export function alertMeta(item: HouseholdItem): string {
  if (item.kind === "vehicle") return "Matched by make, model and year";
  if (item.kind === "medicine") return item.brand ?? "";
  return "Matched by brand and model";
}

/* ------------------------------------------------------------------ quote */

const HAZARDS = ["rearview image", "fire", "burn", "choking", "small parts", "short circuit", "crash", "shock", "contamination"];

/** NoticeQuote highlight (spec §2.9): returns [before, highlighted, after]; highlighted may be "". */
export function splitHighlight(text: string, source: SourceKey): [string, string, string] {
  if (source === "cdsco_nsq") {
    const key = "with respect to ";
    const i = text.toLowerCase().indexOf(key);
    if (i >= 0) {
      const start = i + key.length;
      let end = text.length;
      while (end > start && /[\s.]/.test(text[end - 1]!)) end -= 1;
      return [text.slice(0, start), text.slice(start, end), text.slice(end)];
    }
    return [text, "", ""];
  }
  const lower = text.toLowerCase();
  let best: { i: number; len: number } | null = null;
  for (const h of HAZARDS) {
    const i = lower.indexOf(h);
    if (i >= 0 && (!best || i < best.i)) best = { i, len: h.length };
  }
  if (!best) return [text, "", ""];
  return [text.slice(0, best.i), text.slice(best.i, best.i + best.len), text.slice(best.i + best.len)];
}

/* ------------------------------------------------------------------- diff */

const SEP = /[\s.\-]/;

/**
 * Indexes (into each original string) of characters that differ, compared per position after
 * upper-casing and stripping spaces, dots and hyphens (spec §2.6 near-miss).
 */
export function diffIndices(a: string, b: string): { a: number[]; b: number[]; k: number } {
  const keep = (s: string) => Array.from(s).map((ch, i) => ({ ch: ch.toUpperCase(), i })).filter((x) => !SEP.test(x.ch));
  const ka = keep(a);
  const kb = keep(b);
  const outA: number[] = [];
  const outB: number[] = [];
  const len = Math.max(ka.length, kb.length);
  let k = 0;
  for (let p = 0; p < len; p += 1) {
    const x = ka[p];
    const y = kb[p];
    if (!x || !y || x.ch !== y.ch) {
      k += 1;
      if (x) outA.push(x.i);
      if (y) outB.push(y.i);
    }
  }
  return { a: outA, b: outB, k };
}

/* ------------------------------------------------------------------- scan */

const DATE_LIKE = [/^\d{2}\/\d{4}$/, /^\d{2}-\d{2}$/];

/**
 * Candidate rule (spec §2.12): `is_batch` words; with none, words of 4–12 characters mixing letters
 * and digits that are not dates and not part of the name.
 */
export function batchCandidates(ocr: OcrResult): number[] {
  const flagged = ocr.words.map((w, i) => (w.is_batch ? i : -1)).filter((i) => i >= 0);
  if (flagged.length) return flagged;
  const nameTokens = new Set((ocr.fields.name ?? "").toUpperCase().split(/\s+/).filter(Boolean));
  return ocr.words
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => {
      const t = w.text.trim();
      if (t.length < 4 || t.length > 12) return false;
      if (!/[A-Za-z]/.test(t) || !/\d/.test(t)) return false;
      if (DATE_LIKE.some((re) => re.test(t))) return false;
      if (nameTokens.has(t.toUpperCase())) return false;
      return true;
    })
    .map(({ i }) => i);
}

export type ScanOutcome = { kind: "confirmed"; index: number } | { kind: "candidates"; indices: number[] } | { kind: "failed" };

export function scanOutcome(ocr: OcrResult): ScanOutcome {
  const c = batchCandidates(ocr);
  if (c.length === 1) return { kind: "confirmed", index: c[0]! };
  if (c.length > 1) return { kind: "candidates", indices: c };
  return { kind: "failed" };
}

/** Words that belong to a read-back field: `field` when the API sends it, else a heuristic. */
export function fieldWords(ocr: OcrResult, batchIndex: number | null): { name: number[]; batch: number[]; exp: number[] } {
  const hasField = ocr.words.some((w) => w.field);
  if (hasField) {
    const pick = (f: OcrWord["field"]) => ocr.words.map((w, i) => (w.field === f ? i : -1)).filter((i) => i >= 0);
    return { name: pick("name"), batch: batchIndex !== null ? [batchIndex] : pick("batch"), exp: pick("exp_date") };
  }
  const nameTokens = new Set((ocr.fields.name ?? "").toUpperCase().replace(/(\d)([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean));
  const name = ocr.words.map((w, i) => (nameTokens.has(w.text.toUpperCase()) ? i : -1)).filter((i) => i >= 0);
  const exp = ocr.words
    .map((w, i) => (/^EXP/i.test(w.text) || (ocr.fields.exp_date && w.text === ocr.fields.exp_date) ? i : -1))
    .filter((i) => i >= 0);
  return { name, batch: batchIndex !== null ? [batchIndex] : [], exp };
}

/* ---------------------------------------------------------- check rows */

/**
 * Rows for the checking face in source order. Uses the v3 `sources[]`; with only v2 pipeline
 * steps, every source reads "running" until the check ends (no invented progress).
 */
export function sourceRows(check: CheckStatus | null | undefined): SourceStep[] {
  const by = new Map<SourceKey, SourceStep>();
  for (const s of check?.sources ?? []) by.set(s.source, s);
  return SOURCE_ORDER.map((source) => by.get(source) ?? { source, state: check?.sources ? "waiting" : "running", result: null });
}

export function checkProgress(rows: SourceStep[]): { done: number; running: number; fraction: number } {
  const done = rows.filter((r) => r.state === "done").length;
  const running = rows.filter((r) => r.state === "running").length;
  return { done, running, fraction: Math.min(1, (done + 0.5 * running) / Math.max(1, rows.length)) };
}

export function runningCopy(kind: ItemKind): string {
  if (kind === "vehicle") return "Matching make, model and year";
  if (kind === "medicine") return "Matching batch";
  return "Matching brand and model";
}

/* ------------------------------------------------------------ face label */

export const FACE_LABEL: Record<Face, string> = {
  alert: "on a notice",
  "needs-you": "needs you",
  "near-miss": "near-miss",
  checking: "checking",
  clear: "no match",
  unchecked: "not checked yet",
};

export const KIND_LABEL: Record<ItemKind, string> = { medicine: "Medicine", vehicle: "Vehicle", appliance: "Appliance", other: "Other" };
export const KIND_PLURAL: Record<ItemKind, string> = { medicine: "Medicines", vehicle: "Vehicles", appliance: "Appliances", other: "Other" };
export const KINDS: ItemKind[] = ["medicine", "vehicle", "appliance", "other"];
