import type { Notice, SourceId } from "./types";

// Times are shown in the viewer's local time, 24-hour, so "last poll 14:02:11" reads the same
// in the video and in a browser in Mumbai.
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const HM = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const DAY = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const DAY_TIME = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const COUNT = new Intl.NumberFormat("en-IN");

function parse(iso?: string | null): Date | null {
  if (!iso) return null;
  // A bare date ("2026-07-01") is a calendar day, not UTC midnight: keep it on that day.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const fmtTime = (iso?: string | null) => (parse(iso) ? TIME.format(parse(iso)!) : "--:--:--");
export const fmtHm = (iso?: string | null) => (parse(iso) ? HM.format(parse(iso)!) : "--:--");
export const fmtDay = (iso?: string | null) => (parse(iso) ? DAY.format(parse(iso)!) : "");
export const fmtCount = (n?: number | null) => COUNT.format(n ?? 0);

/** "14:02" today, "18 Sep 14:02" otherwise: a pill should not say a stale time looks fresh. */
export function fmtWhen(iso?: string | null): string {
  const date = parse(iso);
  if (!date) return "never";
  const today = new Date();
  return date.toDateString() === today.toDateString() ? HM.format(date) : DAY_TIME.format(date);
}

export const SOURCE_LABEL: Record<string, string> = {
  cdsco_nsq: "CDSCO",
  cpsc: "CPSC",
  nhtsa: "NHTSA",
  openfda: "openFDA",
  siam: "SIAM",
};
export const sourceLabel = (s: SourceId) => SOURCE_LABEL[s] ?? s.toUpperCase();

/** The identifier a person would check on the thing they own. */
export function noticeIdentifier(n: Notice): string {
  const batches = n.batches ?? [];
  if (batches.length) return batches.length > 1 ? `${batches[0]} +${batches.length - 1}` : batches[0];
  if (n.serial_ranges?.length) return n.serial_ranges[0];
  if (n.source === "nhtsa") return n.notice_id;
  if (n.model) return n.model;
  return n.notice_id;
}

/** Where in the source the row came from: "PDF page 5 · row 50" / "JUL-2026 · row 12". */
export function rowRefLabel(n: Notice): string | null {
  const ref = n.row_ref;
  if (!ref) return null;
  if (ref.page) return `PDF page ${ref.page} · row ${ref.row ?? "?"}`;
  if (ref.month) return `${ref.month} · row ${ref.row ?? "?"}`;
  return ref.row ? `row ${ref.row}` : null;
}

export function confidenceLabel(n: Notice): string {
  const adapter =
    n.adapter === "cdsco_portal" ? "CDSCO NSQ portal" : n.adapter === "cdsco_pdf" ? "CDSCO archive PDF" : sourceLabel(n.source);
  const conf = n.source_confidence ? n.source_confidence.replace("-", " · ") : "regulator data";
  return `${conf} — ${adapter}`;
}
