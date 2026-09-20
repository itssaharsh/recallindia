/**
 * Display rules from spec/feed-ingest-api.md (§0.3, 1.6.3, 1.7). Pure functions over API
 * fields, so the same notice reads the same in the feed row, the sheet, the palette and /mine.
 */
import type { IllustrationName } from "./Illustration";
import { fmtDate, istParts, monthKeyOf, monthLabel, sentenceCase, titleWord } from "./format";
import { SOURCES, SOURCE_ORDER } from "./sources";
import type { HouseholdMatch, Notice, NoticeGroup, SourceId, Stats } from "./types";

const squash = (s: string) => s.replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
const capFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* ------------------------------------------------------------ CDSCO rows */

export interface RawRow {
  sno?: string;
  drug: string;
  batch: string;
  mfg: string;
  exp: string;
  manufacturer: string;
  result: string;
  drawnBy?: string;
  testedBy: string;
  month?: string;
}

/**
 * Split a CDSCO `raw_excerpt` on " | ".
 * Portal rows: drug, batch, mfg, exp, manufacturer, result, drawn by, tested by, month.
 * PDF rows:    S. No., drug, batch, mfg, exp, manufacturer, result, tested by.
 */
export function splitRawRow(n: Notice): RawRow | null {
  if (n.source !== "cdsco_nsq" || !n.raw_excerpt) return null;
  const c = n.raw_excerpt.split(" | ").map((s) => s.trim());
  if (/^\d+\.?$/.test(c[0] ?? "") && c.length >= 8) {
    const [sno, drug, batch, mfg, exp, manufacturer, result, testedBy] = c;
    return { sno, drug, batch, mfg, exp, manufacturer, result, testedBy };
  }
  if (c.length >= 8) {
    const [drug, batch, mfg, exp, manufacturer, result, drawnBy, testedBy, month] = c;
    return { drug, batch, mfg, exp, manufacturer, result, drawnBy, testedBy, month };
  }
  return null;
}

/** "JUL-2026" for a CDSCO notice (row_ref.month, else the raw row's month, else published_at). */
export function cdscoMonth(n: Notice): string {
  return n.row_ref?.month ?? splitRawRow(n)?.month ?? monthKeyOf(n.published_at);
}

/** "The sample does not conform … with respect to Dissolution Test." → "Dissolution Test" */
export function cdscoFailedTest(text: string): string {
  const t = squash(text);
  const m = t.match(/with respect to (?:the )?(?:test for )?(.+?)\.?$/i);
  return capFirst(m ? m[1] : t);
}

/** "Oxford Pharma, Puhana Chowk, Roorkee, Distt. Haridwar-247667 (U.K)" → "Roorkee, Distt. Haridwar (U.K)" */
export function makerPlace(manufacturer: string, brand: string | null): string {
  let rest = squash(manufacturer).replace(/^M\/s\.?\s*/i, "");
  if (brand && rest.toLowerCase().startsWith(brand.toLowerCase())) rest = rest.slice(brand.length);
  const parts = rest.split(",").map((p) => p.trim()).filter(Boolean);
  const tail = parts.slice(-2).map((p) =>
    p.replace(/[-–\s]*\d{3}\s?\d{3}\b/g, "").replace(/\s+(\([^)]*\))/, " $1").replace(/[.\s]+$/, "").trim(),
  );
  return tail.filter(Boolean).join(", ");
}

/* --------------------------------------------------------------- labels */

/** The id under the source chip: "JUL-2026 · row 129", "June 2025 · page 2, row 9", or notice_id. */
export function rowIdText(n: Notice): string {
  const r = n.row_ref;
  if (n.source === "cdsco_nsq" && r?.row != null) {
    if (r.page != null) return `${monthLabel(cdscoMonth(n)).long} · page ${r.page}, row ${r.row}`;
    return `${cdscoMonth(n)} · row ${r.row}`;
  }
  return n.notice_id;
}

/** openFDA products arrive as full label text; keep the name, strength and form. */
export function displayProduct(n: Notice): string {
  let p = squash(n.product);
  if (n.source !== "openfda") return p;
  p = p.replace(/^(carton|vial|bottle|package|container)?\s*label:\s*/i, "");
  p = p.replace(/,?\s*\((?=[^)]*%)[^)]*\)/g, ""); // ingredient percentages
  const cut = p.search(/,\s*(?:\d+\s*(?:capsules|tablets|single dose vials|vials|count)\b|rx only|sterile|manufactured|distributed|made in|ndc|upc)|\s-\s|\.\s/i);
  if (cut > 0) p = p.slice(0, cut);
  return p.replace(/,\s*\(/g, " (").replace(/[,.\s]+$/, "");
}

export function isCdsco(n: Notice): boolean {
  return n.source === "cdsco_nsq";
}

export interface Identifiers {
  label: string;
  chips: string[];
  more: number;
}

/** Identifier column: BATCH / LOT / DATE CODES / MODEL / MODEL YEARS, max 3 chips then "+n". */
export function identifiers(n: Notice): Identifiers {
  let label = "Model or batch";
  let all: string[] = [];
  if (n.source === "nhtsa" && n.vehicles.length) {
    label = "Model years";
    const years = new Set<number>();
    for (const v of n.vehicles) for (let y = v.year_from; y <= v.year_to; y++) years.add(y);
    all = [...years].sort().map(String);
  } else if (n.batches.length) {
    label = n.source === "cdsco_nsq" ? "Batch" : n.source === "openfda" ? "Lot" : n.source === "cpsc" ? "Date codes" : "Batch";
    all = n.batches;
  } else if (n.model) {
    label = "Model";
    all = [n.model];
  }
  return { label, chips: all.slice(0, 3), more: Math.max(0, all.length - 3) };
}

export interface Hazard {
  label: string;
  description: string;
}

const CPSC_HAZARDS: [RegExp, string][] = [
  [/fire[^.]*burn|burn[^.]*fire/i, "Fire and burn hazard"],
  [/explosion/i, "Fire and explosion hazard"],
  [/\bfire\b/i, "Fire hazard"],
  [/shock|electrocution/i, "Electric shock hazard"],
  [/choking|small parts/i, "Choking hazard"],
  [/magnet/i, "Magnet ingestion hazard"],
  [/head injury/i, "Head injury hazard"],
  [/lead (?:poisoning|content|levels?|paint)/i, "Lead poisoning hazard"],
  [/tip-?over/i, "Tip-over hazard"],
];

/** Hazard label + description (spec 1.6.3 §4). A CDSCO row is never "recalled". */
export function hazard(n: Notice): Hazard {
  const text = squash(n.hazard_or_failed_test ?? "");
  switch (n.source) {
    case "cdsco_nsq":
      return { label: "Failed CDSCO quality test", description: cdscoFailedTest(text) };
    case "openfda": {
      const i = text.indexOf(":");
      if (i > 0) return { label: sentenceCase(text.slice(0, i)), description: capFirst(text.slice(i + 1).trim()) };
      return { label: /dissolution/i.test(text) ? "Failed dissolution" : "Quality problem", description: capFirst(text) };
    }
    case "cpsc": {
      const label = CPSC_HAZARDS.find(([re]) => re.test(text))?.[1] ?? "Safety hazard";
      let first = text.split(/(?<=\.)\s/)[0] ?? text;
      first = first.replace(/^The recalled [\w-]+\s+(?=\w)/i, ""); // "The recalled toy violates…" → "violates…"
      first = first.replace(/,\s*posing[^.]*\.?$/i, ".");
      return { label, description: capFirst(first) };
    }
    case "nhtsa": {
      const i = text.lastIndexOf(":");
      return { label: /crash/i.test(text) ? "Crash risk" : "Injury risk", description: capFirst(i >= 0 ? text.slice(i + 1).trim() : text) };
    }
  }
}

/** Remedy chip from the "; Repair|Refund|Replace" suffix. NHTSA remedies are free by law ("free of charge"). */
export function remedyLabel(n: Notice): string | null {
  const r = n.remedy ?? "";
  const suffix = r.includes(";") ? r.slice(r.lastIndexOf(";") + 1).trim().toLowerCase() : "";
  if (suffix.startsWith("repair")) return "Free repair";
  if (suffix.startsWith("refund")) return "Refund";
  if (suffix.startsWith("replace")) return "Replacement";
  if (n.source === "nhtsa" && /free of charge/i.test(r)) return "Free repair";
  return null;
}

/** ObjectTile illustration from the product words (spec §0.2). */
export function illustrationFor(n: Notice): IllustrationName {
  const p = n.product.toLowerCase();
  if (n.source === "nhtsa") return "suv";
  if (n.source === "openfda") {
    if (/injection|vial/.test(p)) return "vial";
    if (/sunscreen|\bgel\b|cream/.test(p)) return "tube";
    return "bottle";
  }
  if (/tablet|capsule/.test(p)) return "strip";
  if (/injection|vial/.test(p)) return "vial";
  if (/sauna/.test(p)) return "sauna";
  if (/\btoys?\b|board/.test(p)) return "board";
  if (/grill/.test(p)) return "grill";
  if (/\branges?\b|stove|cooktop/.test(p)) return "stove";
  if (/mattress/.test(p)) return "mattress";
  if (/helmet/.test(p)) return "helmet";
  if (/sunscreen|\bgel\b|cream/.test(p)) return "tube";
  return SOURCES[n.source].illustration;
}

/** "Aceclofenac & Paracetamol Tablets IP, CDSCO, Failed CDSCO quality test, 01 Jul 2026" */
export function accessibleRowName(n: Notice): string {
  return `${displayProduct(n)}, ${SOURCES[n.source].label}, ${hazard(n).label}, ${fmtDate(n.published_at)}`;
}

/* --------------------------------------------------------------- sheet */

/** "Content of Aceclofenac (82.94%)" → { substance: "Aceclofenac", pct: 82.94 } */
export function contentPercent(test: string | null): { substance: string; pct: number } | null {
  const m = squash(test ?? "").match(/^(?:content of|assay of)?\s*(.*?)\s*\(([\d.]+)\s*%\)/i);
  if (!m) return null;
  const pct = Number(m[2]);
  return Number.isFinite(pct) ? { substance: m[1] || "the active ingredient", pct } : null;
}

export type Outcome =
  | { kind: "content"; batch: string; substance: string; pct: number }
  | { kind: "failed"; batch: string; failed: string }
  | { kind: "hazard"; lead: string; rest: string }
  | { kind: "vehicle"; id: string; years: string; make: string; model: string };

export function outcome(n: Notice): Outcome {
  const batch = n.batches[0] ?? "";
  if (n.source === "cdsco_nsq") {
    const c = contentPercent(n.hazard_or_failed_test);
    return c ? { kind: "content", batch, ...c } : { kind: "failed", batch, failed: cdscoFailedTest(n.hazard_or_failed_test ?? "") };
  }
  if (n.source === "nhtsa") {
    const v = n.vehicles[0];
    const years = identifiers(n).chips;
    const span = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : years[0] ?? "";
    return { kind: "vehicle", id: n.notice_id, years: span, make: titleWord(v?.make ?? n.brand ?? ""), model: titleWord(v?.model ?? n.model ?? "") };
  }
  const h = hazard(n);
  const rem = squash((n.remedy ?? "").replace(/;\s*(repair|refund|replace\w*)\s*$/i, ""));
  const firstRemedy = rem.split(/(?<=\.)\s/)[0] ?? "";
  return { kind: "hazard", lead: h.label, rest: n.source === "cpsc" ? firstRemedy : h.description };
}

/** Sheet maker line: "Oxford Pharma · Roorkee, Distt. Haridwar (U.K)" (CDSCO), else brand. */
export function makerLine(n: Notice): string {
  const raw = splitRawRow(n);
  const brand = n.brand ?? "";
  if (!raw) return brand;
  const place = makerPlace(raw.manufacturer, brand);
  return place ? `${brand} · ${place}` : brand;
}

/* ---------------------------------------------------------------- feed */

/** Rounded share of the total per source: CDSCO 55%, CPSC 38%, openFDA 6%, NHTSA 1%. */
export function sourceShares(stats: Stats): { source: SourceId; count: number; pct: number }[] {
  return SOURCE_ORDER.map((source) => {
    const count = stats.sources.find((s) => s.source === source)?.count ?? 0;
    return { source, count, pct: stats.total ? Math.round((count / stats.total) * 100) : 0 };
  });
}

/** Group loaded notices by IST publish date, newest first. Groups over 6 rows show 5 unless expanded. */
export function groupByDate(notices: Notice[], expanded: ReadonlySet<string> = new Set()): NoticeGroup[] {
  const map = new Map<string, Notice[]>();
  for (const n of notices) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(n.published_at) ? n.published_at : istParts(n.published_at).ymd;
    map.set(d, [...(map.get(d) ?? []), n]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, rows]) => {
      const bySource: Partial<Record<SourceId, number>> = {};
      for (const r of rows) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
      const show = rows.length > 6 && !expanded.has(date) ? rows.slice(0, 5) : rows;
      return { date, notices: show, loaded: rows.length, bySource };
    });
}

/** "14 notices · CPSC" or "13 notices · CPSC 12, NHTSA 1" */
export function groupSubline(g: NoticeGroup): string {
  const entries = SOURCE_ORDER.filter((s) => g.bySource[s]).map((s) => [s, g.bySource[s]!] as const);
  const noun = g.loaded === 1 ? "notice" : "notices";
  if (entries.length === 1) return `${g.loaded} ${noun} · ${SOURCES[entries[0][0]].label}`;
  return `${g.loaded} ${noun} · ${entries.map(([s, c]) => `${SOURCES[s].label} ${c}`).join(", ")}`;
}

/* ----------------------------------------------------------- household */

export interface MatchLabel {
  name: string;
  /** Batch chip right after the name (medicines) */
  batch?: string;
  /** "· CDSCO JUL-2026, row 12" or "· NHTSA" */
  detail: string;
  /** Notice id chip after the detail (vehicles and others) */
  id?: string;
}

export function matchLabel(m: HouseholdMatch): MatchLabel {
  const src = SOURCES[m.notice.source].label;
  const r = m.notice.row_ref;
  if (m.item.batch && m.notice.source === "cdsco_nsq") {
    const where = r?.month ? ` ${r.month}, row ${r.row}` : r?.page ? ` page ${r.page}, row ${r.row}` : "";
    return { name: m.item.label ?? m.item.name.split(" ")[0], batch: m.item.batch, detail: `· ${src}${where}` };
  }
  const vehicleName = [m.item.make, m.item.model, m.item.year].filter(Boolean).join(" ");
  const name = m.item.label ?? (m.item.kind === "vehicle" && vehicleName ? vehicleName : m.item.name);
  return { name, detail: `· ${src}`, id: m.notice.notice_id };
}
