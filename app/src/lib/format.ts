import type { Notice, SourceId } from "./types";

// One clock everywhere: India Standard Time, 24-hour, labelled. A page that mixes an unlabelled
// local time with a UTC one cannot be read at a glance (and the video is recorded in IST).
export const ZONE = "Asia/Kolkata";
export const ZONE_LABEL = "IST";
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: ZONE });
const HM = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONE });
const DAY = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: ZONE });
const DAY_TIME = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONE });
const COUNT = new Intl.NumberFormat("en-IN");

function parse(iso?: string | null): Date | null {
  if (!iso) return null;
  // A bare date ("2026-07-01") is a calendar day, not UTC midnight: keep it on that day.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const fmtTime = (iso?: string | null) => (parse(iso) ? TIME.format(parse(iso)!) : "--:--:--");
export const fmtHm = (iso?: string | null) => (parse(iso) ? HM.format(parse(iso)!) : "--:--");
/** A time a person will quote back ("approved at 17:04 IST"): always says which clock. */
export const fmtClock = (iso?: string | null) => `${fmtHm(iso)} ${ZONE_LABEL}`;
/** A stamp on a record: "20 Sep 2026, 17:04:11 IST". */
export const fmtStamp = (iso?: string | null) =>
  parse(iso) ? `${DAY.format(parse(iso)!)}, ${TIME.format(parse(iso)!)} ${ZONE_LABEL}` : "—";
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

/** How a person would cite the notice: "CDSCO JUL-2026 alert, row 12" (never "recall": an NSQ
 *  row is a failed quality test) or "NHTSA recall 24V436000". */
export function noticeRef(n: Notice): string {
  const ref = n.row_ref;
  if (n.source === "cdsco_nsq") {
    if (ref?.month) return `CDSCO ${ref.month} alert, row ${ref.row ?? "?"}`;
    if (ref?.page) return `CDSCO alert PDF, page ${ref.page} row ${ref.row ?? "?"}`;
    return `CDSCO alert ${n.notice_id}`;
  }
  return `${sourceLabel(n.source)} recall ${n.notice_id}`;
}

/** The hazard as a sentence: NHTSA prefixes its consequence with the component path in caps
 *  ("BACK OVER PREVENTION: SENSING SYSTEM: CAMERA: A rearview camera ..."). */
export function riskSentence(n: Notice): string {
  return (n.hazard_or_failed_test ?? "").replace(/^(?:[A-Z0-9][A-Z0-9 ,/&()'.-]*:\s+)+(?=[A-Z])/, "").trim();
}

export function confidenceLabel(n: Notice): string {
  const adapter =
    n.adapter === "cdsco_portal" ? "CDSCO NSQ portal" : n.adapter === "cdsco_pdf" ? "CDSCO archive PDF" : sourceLabel(n.source);
  const conf = n.source_confidence ? n.source_confidence.replace("-", " · ") : "regulator data";
  return `${conf} — ${adapter}`;
}
