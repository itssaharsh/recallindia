/**
 * Pure formatting and derivation helpers for /case. No Intl month names (en-GB prints "Sept"),
 * so the copy matches the spec exactly ("20 Sep 2026") on every runtime.
 */
import type { AuditEntry, CaseEvidence, CaseRecord, CaseStep, Item, Notice, NoticeSource, StepKey } from "./types";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const IST = "Asia/Kolkata";

type Parts = { y: number; m: number; d: number; hh: string; mm: string; ss: string };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Date-only strings ("2026-07-01") are calendar dates: read them in UTC so they never shift. */
function toDate(iso: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : new Date(iso);
}

function parts(iso: string, tz: string): Parts {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(toDate(iso))) p[x.type] = x.value;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hh: p.hour === "24" ? "00" : p.hour, mm: p.minute, ss: p.second };
}

const pad = (n: number) => String(n).padStart(2, "0");
const zoneOf = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? "UTC" : IST);

/** "05:28" (IST) */
export const istTime = (iso: string) => { const p = parts(iso, IST); return `${p.hh}:${p.mm}`; };
/** "05:28:31" (IST) */
export const istTimeSec = (iso: string) => { const p = parts(iso, IST); return `${p.hh}:${p.mm}:${p.ss}`; };
/** "20 Sep 2026" (IST for timestamps, as-is for date-only strings) */
export const dayMonYear = (iso: string) => { const p = parts(iso, zoneOf(iso)); return `${pad(p.d)} ${MON[p.m - 1]} ${p.y}`; };
/** "01 Jul" */
export const dayMon = (iso: string) => { const p = parts(iso, zoneOf(iso)); return `${pad(p.d)} ${MON[p.m - 1]}`; };
/** "July 2026" */
export const monthYear = (iso: string) => { const p = parts(iso, zoneOf(iso)); return `${MONTH[p.m - 1]} ${p.y}`; };
/** "20 September 2026" */
export const longDate = (iso: string) => { const p = parts(iso, zoneOf(iso)); return `${p.d} ${MONTH[p.m - 1]} ${p.y}`; };
/** "2026-09-19 23:58 UTC" */
export const utcStamp = (iso: string) => { const p = parts(iso, "UTC"); return `${p.y}-${pad(p.m)}-${pad(p.d)} ${p.hh}:${p.mm} UTC`; };
/** "05:28 IST, 20 Sep 2026" */
export const istStamp = (iso: string) => `${istTime(iso)} IST, ${dayMonYear(iso)}`;
/**
 * S3 Object Lock retain-until is a UTC instant; the certificate prints its UTC calendar date
 * ("19 Oct 2026"), the same date the audit log and the bucket show.
 */
export const lockDate = (iso: string) => { const p = parts(iso, "UTC"); return `${pad(p.d)} ${MON[p.m - 1]} ${p.y}`; };
export const lockDateIso = (iso: string) => { const p = parts(iso, "UTC"); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };

/** Whole calendar days between two date-only (or ISO) values, b − a. */
export function daysBetween(a: string, b: string): number {
  const da = toDate(a.slice(0, 10)).getTime();
  const db = toDate(b.slice(0, 10)).getTime();
  return Math.round((db - da) / 86_400_000);
}

/** Calendar days from a (inclusive) to b (inclusive), as date-only strings. */
export function dayRange(a: string, b: string): string[] {
  const start = toDate(a.slice(0, 10)).getTime();
  const n = daysBetween(a, b);
  return Array.from({ length: n + 1 }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
}

export const dayNum = (isoDate: string) => pad(Number(isoDate.slice(8, 10)));

/** "JUL-2026" → "July 2026" */
export function alertMonthLabel(month: string | null | undefined): string {
  if (!month) return "";
  const [mon, y] = month.split("-");
  const i = MON.findIndex((m) => m.toUpperCase() === mon?.toUpperCase());
  return i < 0 ? month : `${MONTH[i]} ${y}`;
}

/** "2025-10" | "Oct-2025" → "10/2025" (the way a strip prints it) */
export function stripDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const iso = /^(\d{4})-(\d{2})/.exec(v);
  if (iso) return `${iso[2]}/${iso[1]}`;
  const mon = /^([A-Za-z]{3})[- ](\d{4})$/.exec(v);
  if (mon) {
    const i = MON.findIndex((m) => m.toLowerCase() === mon[1].toLowerCase());
    if (i >= 0) return `${pad(i + 1)}/${mon[2]}`;
  }
  return v;
}

/* ------------------------------------------------------------------ durations */

export function stepMs(step: CaseStep | undefined | null): number | null {
  if (!step?.started_at || !step.finished_at) return null;
  return Math.max(0, new Date(step.finished_at).getTime() - new Date(step.started_at).getTime());
}

/** Total = verify.finished_at − approve.finished_at (spec C8). */
export function pipelineTotalMs(c: CaseRecord | null): number | null {
  const a = c?.steps.approve.finished_at;
  const v = c?.steps.verify.finished_at;
  if (!a || !v) return null;
  return Math.max(0, new Date(v).getTime() - new Date(a).getTime());
}

/** 1 decimal, as a number for NumberFlow */
export const secs1 = (ms: number) => Math.round(ms / 100) / 10;
/** "1.0 s" */
export const secsLabel = (ms: number) => `${secs1(ms).toFixed(1)} s`;

/* ------------------------------------------------------------------ hashes, bytes, keys */

export const hex = (byte: number) => `0x${byte.toString(16).padStart(2, "0")}`;
export const hashGroups = (h: string): [string, string] => [h.slice(0, 32), h.slice(32)];
/** "56237b4d…4b9c29a7" */
export const shortHash = (h: string) => (h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-8)}` : h);
/** "evidence/case_demo_ft5427/56237b4d…29a7.bin" (no "….bin" glitch) */
export function shortKey(key: string): string {
  const slash = key.lastIndexOf("/");
  const dir = key.slice(0, slash + 1);
  const file = key.slice(slash + 1);
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : "";
  return stem.length > 16 ? `${dir}${stem.slice(0, 8)}…${stem.slice(-4)}${ext}` : key;
}
export const bytesLabel = (n: number) => n.toLocaleString("en-IN");

/* ------------------------------------------------------------------ notice */

export const SOURCE_SHORT: Record<NoticeSource, string> = { cdsco_nsq: "CDSCO", cpsc: "CPSC", nhtsa: "NHTSA", openfda: "openFDA" };

export const hostOf = (url: string) => { try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; } };

/** CDSCO portal rows are "product | batch | mfg | exp | manufacturer | result | lab type | lab | month". */
export interface CdscoColumns { product: string; batch: string; mfg: string; exp: string; manufacturer: string; result: string; labType: string; lab: string; month: string }
export function cdscoColumns(raw: string): CdscoColumns | null {
  const c = raw.split(" | ");
  if (c.length < 9) return null;
  return { product: c[0], batch: c[1], mfg: c[2], exp: c[3], manufacturer: c[4], result: c[5], labType: c[6], lab: c[7], month: c[8] };
}

/** The phrase highlighted in the regulator's sentence: "…with respect to Dissolution Test." → "Dissolution Test". */
export function deriveHighlight(n: Notice): string | null {
  const s = n.hazard_or_failed_test ?? "";
  const m = /with respect to (.+?)\.?$/i.exec(s);
  if (m) return m[1];
  const c = /^(Content of [^(]+)/i.exec(s);
  if (c) return c[1].trim();
  return null;
}

/** "Failed CDSCO quality test · JUL-2026 alert, row 12" (never "recalled" for CDSCO). */
export function bandSourceLine(n: Notice): string {
  if (n.source === "cdsco_nsq") return `Failed CDSCO quality test · ${n.row_ref?.month ?? ""} alert, row ${n.row_ref?.row ?? "?"}`;
  if (n.source === "nhtsa") return `NHTSA recall ${n.campaign ?? n.notice_id}`;
  if (n.source === "cpsc") return `CPSC recall ${n.notice_id}`;
  return `openFDA enforcement report ${n.notice_id}`;
}

/** "CDSCO · JUL-2026 · row 12" */
export function noticeFact(n: Notice): string {
  if (n.source === "cdsco_nsq") return `CDSCO · ${n.row_ref?.month ?? ""} · row ${n.row_ref?.row ?? "?"}`;
  return `${SOURCE_SHORT[n.source]} · ${n.campaign ?? n.notice_id}`;
}

/** "row 12" for CDSCO, "the notice" otherwise: used in "Seal row 12", "Cites the sealed copy of row 12" … */
export const noticeNoun = (n: Notice | null) => (n?.source === "cdsco_nsq" && n.row_ref?.row != null ? `row ${n.row_ref.row}` : "the notice");

/* ------------------------------------------------------------------ item */

export const addresseeLabel = (a: string) => `to the ${a}`;

export function itemCodeLabel(item: Item): { code: string; label: string; spoken: string } | null {
  if (item.kind === "vehicle" && item.year) return { code: String(item.year), label: "Your model year", spoken: `Model year ${item.year}` };
  if (item.batch) return { code: item.batch, label: "Your batch", spoken: "" };
  if (item.serial) return { code: item.serial, label: "Your serial", spoken: `Serial ${Array.from(item.serial).join(" ")}` };
  return null;
}

/* ------------------------------------------------------------------ reasoning and audit */

export interface WhyLine { label: string; text: string }

/** "brand 'X' matches; product 'Y' fuzzy 100; batch Z in listed [Z]" → labelled lines (spec C9). */
export function parseReasoning(reasoning: string, kind: Item["kind"] = "medicine"): WhyLine[] {
  return reasoning.split("; ").filter(Boolean).map((clause) => {
    let m = /^brand '(.+)' matches$/.exec(clause);
    if (m) return { label: "Maker", text: `"${m[1]}" matches` };
    m = /^product '(.+)' fuzzy (\d+)$/.exec(clause);
    if (m) return { label: kind === "medicine" ? "Medicine" : "Product", text: `"${m[1]}", fuzzy score ${m[2]}` };
    m = /^batch (\S+) in listed \[(.*)\]$/.exec(clause);
    if (m) return { label: "Batch", text: `${m[1]} is in the listed batches [${m[2]}]` };
    m = /^year (\d{4}) in (\d{4})[–-](\d{4})$/.exec(clause);
    if (m) return { label: "Model year", text: `${m[1]} is inside ${m[2]}–${m[3]}` };
    return { label: "", text: clause };
  });
}

export function matchFacts(reasoning: string): { sameMaker: boolean; sameProduct: boolean } {
  const product = /product '.+' fuzzy (\d+)/.exec(reasoning);
  return { sameMaker: /brand '.+' matches/.test(reasoning), sameProduct: product ? Number(product[1]) >= 90 : false };
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** One human line per audit event (spec C9 copy). Unknown events print their detail as "k: v". */
export function auditDetail(e: AuditEntry, ev: CaseEvidence | null): string {
  const d = e.detail ?? {};
  switch (e.event) {
    case "case.created":
      return `decision: ${str(d.decision)}`;
    case "decision.alert":
    case "decision.near_miss":
      return str(d.reason).split("; ")[0];
    case "approval.approved": {
      const who = str(d.approver);
      return who.startsWith("seed:") ? who.slice(5).replace(/-/g, " ") : who ? "you" : "approved";
    }
    case "approval.rejected":
      return "dismissed · nothing sealed";
    case "evidence.signed": {
      const kind = str(d.kind).replace(/_/g, " ");
      const until = d.retain_until ? ` · locked until ${lockDateIso(str(d.retain_until))}` : "";
      return `${kind} · ${bytesLabel(Number(d.bytes ?? 0))} bytes${until}`;
    }
    case "claim.drafted":
      return `${str(d.pdf_s3_key)} · ${bytesLabel(Number(d.bytes ?? 0))} bytes · ${addresseeLabel(str(d.addressee))}`;
    case "evidence.verified":
      return `${d.valid ? "valid" : "does not match"}${ev ? ` · ${ev.key_alias}` : ""}`;
    case "evidence.tamper_test":
      return `byte ${str(d.flipped_byte_index)} ${hex(Number(d.byte_before))} → ${hex(Number(d.byte_after))} · does not match (demo control)`;
    default:
      return Object.entries(d).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : str(v)}`).join(" · ");
  }
}

/* ------------------------------------------------------------------ claim letter */

export interface LetterModel {
  date: string;
  to: string[];
  subject: string;
  greeting: string;
  /** paragraphs shown in the preview (up to and including "I bought it on …") */
  body: string[];
}

/** Paragraphs as the API wrote them. The preview stops after the paragraph that begins "I bought it on". */
export function parseLetter(text: string): LetterModel {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const date = /^\d{1,2} [A-Z][a-z]+ \d{4}$/.test(blocks[0] ?? "") ? blocks.shift()! : "";
  const toIdx = blocks.findIndex((b) => b.startsWith("To:"));
  const to = toIdx >= 0 ? blocks.splice(toIdx, 1)[0].split("\n") : [];
  const subjIdx = blocks.findIndex((b) => b.startsWith("Subject:"));
  const subject = subjIdx >= 0 ? blocks.splice(subjIdx, 1)[0] : "";
  const greetIdx = blocks.findIndex((b) => /^Dear\b/.test(b));
  const greeting = greetIdx >= 0 ? blocks.splice(greetIdx, 1)[0] : "";
  const stop = blocks.findIndex((b) => b.startsWith("I bought it on"));
  const body = stop >= 0 ? blocks.slice(0, stop + 1) : blocks.slice(0, 3);
  return { date, to, subject, greeting, body };
}

export const STEP_ORDER: StepKey[] = ["approve", "seal_evidence", "write_letter", "verify"];
export const STEP_LABEL: Record<StepKey, string> = {
  approve: "Approve",
  seal_evidence: "Seal evidence",
  write_letter: "Write letter",
  verify: "Verify signature",
};

/** The first step with an error, if any. */
export function failedStep(c: CaseRecord | null): { key: StepKey; error: string } | null {
  if (!c) return null;
  for (const k of STEP_ORDER) {
    const e = c.steps[k]?.error;
    if (e) return { key: k, error: e };
  }
  return null;
}
