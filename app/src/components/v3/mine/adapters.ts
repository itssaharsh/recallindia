/**
 * Map the live `/v1/notices/{id}` shape onto the `NoticeView` fields the /mine cards read.
 * Pure functions: the route fetches, then calls `noticeFromApi(json, item)` before passing notices to MineView.
 * Field names below were read from the live API (ap-south-1) on 20 Sep 2026.
 */
import { diffIndices } from "./derive";
import type { HouseholdItem, NoticeView, SourceKey } from "./types";

/** `/v1/notices` item (the fields this adapter reads). */
export interface ApiNotice {
  notice_id: string;
  source: SourceKey | string;
  title: string;
  /** "2026-07-01" */
  published_at: string;
  batches?: string[] | null;
  row_ref?: { page?: number | null; row?: number | null; month?: string | null } | null;
  hazard_or_failed_test?: string | null;
  lab?: string | null;
  brand?: string | null;
  product?: string | null;
  /** CDSCO: the row as published, "|"-separated. NHTSA: the recall text. */
  raw_excerpt?: string | null;
  vehicles?: { make: string; model: string; year_from: number; year_to: number }[] | null;
  /** Not in v2; if the backend adds these, they win over the parsing below. */
  summary?: string | null;
  lab_type?: string | null;
}

const norm = (s: string) => s.toUpperCase().replace(/[\s.\-]/g, "");

/** The listed batch this item matched (exact), or the closest one (near-miss / needs-you). */
function pickBatch(batches: string[], yours?: string | null): string | null {
  if (!batches.length) return null;
  if (!yours) return batches[0]!;
  const exact = batches.find((b) => norm(b) === norm(yours));
  if (exact) return exact;
  return [...batches].sort((a, b) => diffIndices(yours, a).k - diffIndices(yours, b).k)[0]!;
}

/** "ELECTRICAL SYSTEM:BODY CONTROL MODULE:SOFTWARE: An unexpected…" → "An unexpected…" */
function stripComponent(s: string): string {
  const m = /^[A-Z0-9 ,/&()-]+(?::[A-Z0-9 ,/&()-]+)*:\s+(.*)$/s.exec(s);
  return (m ? m[1]! : s).trim();
}

export function noticeFromApi(n: ApiNotice, item?: HouseholdItem | null): NoticeView {
  const source = (["cdsco_nsq", "cpsc", "nhtsa", "openfda"].includes(n.source) ? n.source : "cpsc") as SourceKey;
  const base: NoticeView = { notice_id: n.notice_id, source, title: n.title, published_at: n.published_at };

  if (source === "cdsco_nsq") {
    // raw row: product | batch | mfg | exp | maker, address | failed test | lab type | lab | month
    const cols = (n.raw_excerpt ?? "").split("|").map((c) => c.trim());
    return {
      ...base,
      batch: pickBatch(n.batches ?? [], item?.batch),
      month: n.row_ref?.month ?? cols[8] ?? null,
      row: n.row_ref?.row ?? null,
      reason: n.hazard_or_failed_test && /with respect to|does not/i.test(n.hazard_or_failed_test) ? n.hazard_or_failed_test : (cols[5] ?? n.hazard_or_failed_test ?? null),
      lab: cols[7] || n.lab || null,
      lab_type: n.lab_type ?? (cols[6] || null),
      maker: (cols[4] ?? "").split(",")[0]?.trim() || n.brand || null,
    };
  }

  if (source === "nhtsa") {
    const make = item?.make?.toLowerCase();
    const model = item?.model?.toLowerCase();
    const vs = (n.vehicles ?? []).filter((v) => (!make || v.make.toLowerCase() === make) && (!model || v.model.toLowerCase() === model));
    const pool = vs.length ? vs : (n.vehicles ?? []);
    const years = pool.length ? ([Math.min(...pool.map((v) => v.year_from)), Math.max(...pool.map((v) => v.year_to))] as [number, number]) : null;
    return {
      ...base,
      campaign: n.notice_id,
      summary: n.summary ?? (n.hazard_or_failed_test ? stripComponent(n.hazard_or_failed_test) : null),
      model_years: years,
      maker: n.brand ?? null,
    };
  }

  if (source === "cpsc") return { ...base, number: n.notice_id, summary: n.summary ?? n.hazard_or_failed_test ?? n.title, maker: n.brand ?? null };
  return { ...base, recall_number: n.notice_id, summary: n.summary ?? n.hazard_or_failed_test ?? n.title, maker: n.brand ?? null };
}
