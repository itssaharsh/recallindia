// The case page's words and state. Wording rules (CLAUDE.md): a CDSCO NSQ hit is "listed on
// CDSCO's <month> alert" (a failed quality test), never "recalled"; recalls are named as recalls;
// nothing is ever called "safe".

import { fmtDay, sourceLabel } from "./format";
import { monthLabel } from "./ingest";
import type { Case, CaseStatus, Item, Notice, PipelineStepName, StepRecord } from "./types";

/** Whole days from `a` to `b` (calendar dates, ISO strings). */
export function daysBetween(a?: string | null, b?: string | null): number | null {
  const start = a ? Date.parse(`${a.slice(0, 10)}T00:00:00Z`) : NaN;
  const end = b ? Date.parse(`${b.slice(0, 10)}T00:00:00Z`) : NaN;
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86_400_000) : null;
}

const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** "July 2026": the month list the row is on. Same rule as the claim letter (claim.py): a portal
 *  row carries it in row_ref, an archive PDF row's notice id starts with it. */
export function alertMonth(notice: Notice): string {
  const label = monthLabel(notice.row_ref?.month ?? notice.notice_id.split("-cdsco")[0]);
  if (/^[A-Z][a-z]+ \d{4}$/.test(label)) return label;
  const at = Date.parse(`${notice.published_at.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(at) ? MONTH_YEAR.format(at) : label;
}

/** The one-line answer at the top of the case, in display type (UI-SPEC C-15). */
export function outcomeLine(c: Case, item: Item | null, notice: Notice | null): string {
  if (c.decision === "alert") {
    const days = daysBetween(notice?.published_at, item?.purchase_date);
    if (item?.kind === "vehicle" && notice) {
      const what = [item.year, item.make || item.brand, item.model || item.name]
        .filter(Boolean)
        .map(String)
        .join(" ");
      return `Your ${what || item.name} matches ${sourceLabel(notice.source)} recall ${notice.notice_id} by make, model and year.`;
    }
    if (c.sold_after_notice && days !== null && days >= 0 && notice?.source === "cdsco_nsq") {
      return `You were sold this strip ${days} day${days === 1 ? "" : "s"} after CDSCO flagged it.`;
    }
    if (notice?.source === "cdsco_nsq") {
      return `Your strip's batch is on CDSCO's ${alertMonth(notice)} list of drug samples that failed quality tests.`;
    }
    if (notice) return `Your ${item?.name ?? "thing"} is on ${sourceLabel(notice.source)} recall ${notice.notice_id}.`;
    return "Your thing is on a notice";
  }
  if (c.decision === "dismiss") {
    const yours = c.range_check?.yours;
    const unit = item?.batch ? "batch" : item?.serial ? "serial" : item?.year ? "model year" : "unit";
    return yours ? `Your ${unit} ${yours} is not the one listed` : "The notice is about another unit";
  }
  return "This needs one more detail from you";
}

/** The line under a vehicle outcome: a US campaign matched on make, model and year. */
export function outcomeSubLine(c: Case, item: Item | null, notice: Notice | null): string | null {
  if (c.decision !== "alert" || item?.kind !== "vehicle" || notice?.source !== "nhtsa") return null;
  return "NHTSA covers US vehicles. Confirm with your dealer using the VIN.";
}

/** "Purchased 12 Jul 2026 · CDSCO alert 01 Jul 2026" (+ "sold after notice", set in bold). */
export function datesLine(item: Item | null, notice: Notice | null): string | null {
  if (!notice) return null;
  const kind = notice.source === "cdsco_nsq" ? "CDSCO alert" : `${sourceLabel(notice.source)} recall`;
  const parts = [];
  if (item?.purchase_date) parts.push(`Purchased ${fmtDay(item.purchase_date)}`);
  parts.push(`${kind} ${fmtDay(notice.published_at)}`);
  return parts.join(" · ");
}

/** How the case cites its notice: "failed CDSCO quality test, July 2026 alert, row 12" /
 *  "NHTSA recall 24V436000". */
export function citation(notice: Notice): string {
  if (notice.source === "cdsco_nsq") {
    const row = notice.row_ref?.row ? `, row ${notice.row_ref.row}` : "";
    return `failed CDSCO quality test, ${alertMonth(notice)} alert${row}`;
  }
  return `${sourceLabel(notice.source)} recall ${notice.notice_id}`;
}

/** Who the claim letter is addressed to, by item kind (claim.py ADDRESSEE). */
export function addressee(c: Case, item: Item | null): string {
  const who = c.claim_addressee ?? (item?.kind === "medicine" ? "pharmacy" : item?.kind === "vehicle" ? "dealer" : "retailer");
  return `the ${who}`;
}

/** What the evidence snapshot is, for the certificate and the checklist. */
export const SNAPSHOT_KIND: Record<string, string> = {
  pdf: "the alert PDF itself",
  portal_row: "the notice's row of CDSCO's portal list",
  source_json: "the recall record as the regulator's API serves it",
  stored_notice: "the notice as ingested (the source could not be fetched)",
};

/** What gets sealed, before it is: "the CDSCO row" / "the NHTSA recall record". */
export function snapshotNoun(notice: Notice | null): string {
  if (!notice) return "the notice";
  if (notice.source === "cdsco_nsq") return notice.adapter === "cdsco_pdf" ? "the CDSCO alert PDF" : "the CDSCO row";
  return `the ${sourceLabel(notice.source)} recall record`;
}

/** "2026-09-19 20:22:38 UTC": the certificate speaks one clock. */
export function fmtUtc(iso?: string | null): string {
  if (!iso) return "—";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : `${at.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export const fmtBytes = (n?: number | null) =>
  typeof n !== "number" ? "" : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`;

export const PIPELINE: { name: PipelineStepName; label: string }[] = [
  { name: "approve", label: "Approve" },
  { name: "seal_evidence", label: "Seal evidence" },
  { name: "write_letter", label: "Write letter" },
  { name: "verify", label: "Verify signature" },
];

export type StepState = "pending" | "running" | "done" | "failed";

export interface PipelineStep {
  name: PipelineStepName;
  label: string;
  state: StepState;
  seconds: number | null;
}

/** The statuses that move on their own: the case page polls once a second while in one. */
export const IN_FLIGHT = new Set<CaseStatus>(["approving", "sealing", "writing_letter", "verifying"]);

const stepSeconds = (step: StepRecord): number | null => {
  const from = Date.parse(step.started_at ?? "");
  const to = Date.parse(step.finished_at ?? "");
  return Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, (to - from) / 1000) : null;
};

/** C-17: the four steps exactly as the server recorded them (never a timer). */
export function pipelineState(c: Case): PipelineStep[] {
  return PIPELINE.map(({ name, label }) => {
    const step: StepRecord = c.steps?.[name] ?? {};
    const state: StepState = step.error
      ? "failed"
      : step.finished_at
        ? "done"
        : step.started_at
          ? "running"
          : "pending";
    return { name, label, state, seconds: stepSeconds(step) };
  });
}

/** The chip at the top of the case and on its card (the status table in UI-SPEC §5). */
export const CASE_CHIP: Partial<Record<CaseStatus, { label: string; tone: "hold" | "clear" | "muted" }>> = {
  waiting_approval: { label: "Waiting for you", tone: "hold" },
  approving: { label: "Approving", tone: "hold" },
  sealing: { label: "Sealing evidence", tone: "hold" },
  writing_letter: { label: "Writing letter", tone: "hold" },
  verifying: { label: "Verifying", tone: "hold" },
  verified: { label: "Verified", tone: "clear" },
  rejected: { label: "Rejected", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
  error: { label: "Error", tone: "hold" },
};
