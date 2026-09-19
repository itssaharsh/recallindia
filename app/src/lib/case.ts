// The case page's words and state. Wording rules (CLAUDE.md): a CDSCO NSQ hit is "listed on
// CDSCO's <month> alert" (a failed quality test), never "recalled"; recalls are named as recalls;
// nothing is ever called "safe".

import { fmtDay, sourceLabel } from "./format";
import { monthLabel } from "./ingest";
import type { ApprovalStep, ApprovalStepName, AuditEvent, Case, Item, Notice } from "./types";

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

const unitOf = (item: Item | null) =>
  item?.batch ? `batch ${item.batch}` : item?.serial ? `serial ${item.serial}` : null;

/** The one-line answer at the top of the case, in display type. */
export function outcomeLine(c: Case, item: Item | null, notice: Notice | null): string {
  if (c.decision === "alert") {
    const days = daysBetween(notice?.published_at, item?.purchase_date);
    if (c.sold_after_notice && days !== null && days >= 0) {
      return `You were sold this ${days} day${days === 1 ? "" : "s"} after the notice`;
    }
    if (notice?.source === "cdsco_nsq") {
      return `Your ${unitOf(item) ?? item?.name ?? "medicine"} is listed on CDSCO's ${alertMonth(notice)} alert`;
    }
    if (notice) {
      const what = item?.kind === "vehicle" && item.year ? `${item.year} ${item.name}` : (item?.name ?? "product");
      return `Your ${what} is on ${sourceLabel(notice.source)} recall ${notice.notice_id}`;
    }
    return "Your item is on a notice";
  }
  if (c.decision === "dismiss") {
    const yours = c.range_check?.yours;
    const unit = item?.batch ? "batch" : item?.serial ? "serial" : item?.year ? "model year" : "unit";
    return yours ? `Your ${unit} ${yours} is not the one listed` : "The notice is about another unit";
  }
  return "This needs one more detail from you";
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

export const APPROVAL_STEP_NAMES: ApprovalStepName[] = ["WaitForApproval", "Claim", "Evidence"];

/** WaitForApproval / Claim / Evidence from the case alone (mirrors ui_api.approval_steps_from_case,
 *  used when the item's last check is not this case's execution). */
export function approvalStepsFromCase(c: Case): ApprovalStep[] {
  const steps: Record<ApprovalStepName, ApprovalStep> = {
    WaitForApproval: { name: "WaitForApproval", state: "pending" },
    Claim: { name: "Claim", state: "pending" },
    Evidence: { name: "Evidence", state: "pending" },
  };
  const approval = c.approval;
  if (approval?.status === "waiting") {
    steps.WaitForApproval = { name: "WaitForApproval", state: "running", started_at: approval.token_issued_at };
  } else if (approval && approval.status !== "approved") {
    const ended = approval.status === "rejected" ? approval.rejected_at : approval.expired_at;
    steps.WaitForApproval = { name: "WaitForApproval", state: "failed", ended_at: ended, summary: { error: approval.status } };
    steps.Claim.state = "skipped";
    steps.Evidence.state = "skipped";
  } else if (approval?.status === "approved") {
    steps.WaitForApproval = { name: "WaitForApproval", state: "done", ended_at: approval.approved_at };
    const failed = (event: string) => c.audit?.find((a) => a.event === event);
    for (const [name, done, event] of [
      ["Claim", Boolean(c.claim_pdf_s3_key), "claim.failed"],
      ["Evidence", Boolean(c.evidence), "evidence.failed"],
    ] as const) {
      const failure = failed(event);
      steps[name] = done
        ? { name, state: "done" }
        : failure
          ? { name, state: "failed", summary: { error: failure.detail?.error } }
          : { name, state: "pending" };
    }
  }
  return APPROVAL_STEP_NAMES.map((n) => steps[n]);
}

/** The approval steps are over: the letter and the evidence are made (or failed). */
export const sealed = (steps: ApprovalStep[]) =>
  steps.every((s) => s.name === "WaitForApproval" || ["done", "failed", "skipped"].includes(s.state));

const RANK: Record<string, number> = { pending: 0, running: 1, done: 2, failed: 2, skipped: 2 };

/** Step Functions history and the case, merged: each step as far along as either has seen it
 *  (the history knows a step started; the case knows its result the moment it is written). */
export function mergeSteps(fromCase: ApprovalStep[], fromHistory?: ApprovalStep[] | null): ApprovalStep[] {
  if (!fromHistory?.length) return fromCase;
  return fromCase.map((mine) => {
    const theirs = fromHistory.find((s) => s.name === mine.name);
    if (!theirs) return mine;
    return RANK[theirs.state] >= RANK[mine.state] ? { ...mine, ...theirs, summary: { ...mine.summary, ...theirs.summary } } : mine;
  });
}

/** After an approval, the first step still to do is the one running (Claim starts the moment
 *  the task token is answered, Evidence the moment Claim ends). */
export function withCurrent(steps: ApprovalStep[]): ApprovalStep[] {
  if (steps[0]?.state !== "done" || steps.some((s) => s.state === "running")) return steps;
  const next = steps.findIndex((s) => s.state === "pending");
  return next < 0 ? steps : steps.map((s, i) => (i === next ? { ...s, state: "running" } : s));
}

// --- demo replay --------------------------------------------------------------------------
// Demo data is a recording of a live case after it was approved, signed and sealed. The page
// plays it back from the moment it waited for the human: Approve replays Claim -> Evidence with
// the recorded gaps, then shows the recorded case, its claim link and its verify answers.

const AFTER_APPROVAL = /^(approval\.(approved|rejected|expired|send_failed)|claim\.|evidence\.)/;

/** The recorded case as it stood while it waited: no answer, no letter, no evidence. */
export function asWaiting(c: Case): Case {
  return {
    ...c,
    approval: { status: "waiting", token_issued_at: c.approval?.token_issued_at ?? c.created_at ?? "" },
    claim_pdf_s3_key: null,
    claim_text: null,
    claim_addressee: null,
    claim_created_at: null,
    evidence: null,
    audit: (c.audit ?? []).filter((a) => !AFTER_APPROVAL.test(a.event)),
  };
}

export const canReplay = (c: Case) => c.approval?.status === "approved" && Boolean(c.evidence) && Boolean(c.claim_pdf_s3_key);

/** The recording at a replay stage: 0 waiting · 1 approved (Claim running) · 2 letter drafted
 *  (Evidence running) · 3 sealed (the recorded case itself). */
export function replayCase(c: Case, stage: number): Case {
  if (stage >= 3) return c;
  const waiting = asWaiting(c);
  if (stage <= 0) return waiting;
  const shown = (a: AuditEvent) =>
    !a.event.startsWith("evidence.") && (stage >= 2 || !a.event.startsWith("claim.")) && !a.event.startsWith("approval.send_failed");
  return {
    ...waiting,
    approval: c.approval,
    ...(stage >= 2
      ? {
          claim_pdf_s3_key: c.claim_pdf_s3_key,
          claim_text: c.claim_text,
          claim_addressee: c.claim_addressee,
          claim_created_at: c.claim_created_at,
        }
      : {}),
    audit: (c.audit ?? []).filter(shown),
  };
}

const at = (audit: AuditEvent[] | undefined, event: string) => {
  const hit = audit?.find((a) => a.event === event);
  return hit ? Date.parse(hit.ts) : NaN;
};

/** Milliseconds after Approve at which the recorded Claim and Evidence finished (each step on
 *  screen for at least `floor` ms, so a one-second recording still reads as two steps). */
export function replayTimings(c: Case, floor = 900): { claim: number; evidence: number } {
  const approved = Date.parse(c.approval?.approved_at ?? "") || at(c.audit, "approval.approved");
  const claim = at(c.audit, "claim.drafted") - approved;
  const evidence = at(c.audit, "evidence.signed") - approved;
  const claimMs = Math.max(floor, Number.isFinite(claim) ? claim : 0);
  return { claim: claimMs, evidence: Math.max(claimMs + floor, Number.isFinite(evidence) ? evidence : 0) };
}
