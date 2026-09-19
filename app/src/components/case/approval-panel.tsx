"use client";

import { FileText } from "lucide-react";
import { useState } from "react";

import { GLYPH, STATE_WORD, TONE } from "@/components/mine/checklist";
import { Button } from "@/components/ui/button";
import { addressee, fmtBytes, snapshotNoun } from "@/lib/case";
import { fmtDay, fmtTime, fmtWhen } from "@/lib/format";
import type { ApprovalStep, Case, Item, Notice } from "@/lib/types";

const DAY_MS = 86_400_000;

/** Microcopy per step = action + the specific thing + the rule (R25), from real results. */
function stepCopy(step: ApprovalStep, c: Case, item: Item | null, notice: Notice | null): string {
  const s = (step.summary ?? {}) as Record<string, unknown>;
  const to = addressee(c, item);
  const noun = snapshotNoun(notice);
  switch (step.name) {
    case "WaitForApproval":
      if (step.state === "done") return `Approved by ${c.approval?.approver ?? "you"} at ${fmtTime(c.approval?.approved_at)}: the check resumed`;
      if (step.state === "failed")
        return c.approval?.status === "expired" ? "No answer within 24 hours: the approval closed" : "Rejected: nothing drafted, nothing sealed";
      return "Waiting for you: Step Functions holds the check at WaitForApproval";
    case "Claim":
      if (step.state === "done") {
        const size = fmtBytes(typeof s.bytes === "number" ? s.bytes : null);
        return `Drafted the claim letter to ${to}${size ? ` · PDF ${size}` : ""}`;
      }
      if (step.state === "failed") return `Could not draft the letter: ${String(s.error ?? "unknown error")}`;
      if (step.state === "running") return `Drafting the claim letter to ${to} from the notice and your purchase`;
      if (step.state === "skipped") return "No claim letter";
      return `Draft the claim letter to ${to}`;
    case "Evidence": {
      const until = c.evidence?.object_lock_retain_until ?? (typeof s.retain_until === "string" ? s.retain_until : null);
      if (step.state === "done") return `Sealed ${noun}: write-once until ${fmtDay(until)}, signed with KMS`;
      if (step.state === "failed") return `Could not seal the evidence: ${String(s.error ?? "unknown error")}`;
      if (step.state === "running") return `Sealing ${noun}: S3 Object Lock, then a KMS signature over its SHA-256`;
      if (step.state === "skipped") return "No evidence sealed";
      return `Seal ${noun} as evidence (S3 Object Lock + KMS)`;
    }
  }
}

function Steps({ steps, c, item, notice }: { steps: ApprovalStep[]; c: Case; item: Item | null; notice: Notice | null }) {
  return (
    <ol className="m-0 list-none space-y-1.5 p-0" aria-label="After your answer">
      {steps.map((step) => (
        <li key={step.name} className="flex items-start gap-2.5 text-[13px] leading-snug">
          <span aria-hidden className={`w-3 shrink-0 font-mono ${TONE[step.state]}`}>
            {GLYPH[step.state]}
          </span>
          <span className={step.state === "done" ? "text-text" : step.state === "failed" ? "text-alert" : "text-muted"}>
            {stepCopy(step, c, item, notice)}
            <span className="sr-only"> ({STATE_WORD[step.state]})</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The human gate. While the task token is open: "Waiting for you" in hold amber, Approve (the
 * only primary button in the app) and Reject (a text button, confirmed inline). After Approve,
 * the Dynamic Checklist advances Claim -> Evidence from real state; then the letter itself.
 */
export function ApprovalPanel({
  c,
  item,
  notice,
  steps,
  busy,
  error,
  demo,
  replay,
  opening,
  onApprove,
  onReject,
  onOpenClaim,
  claimError,
}: {
  c: Case;
  item: Item | null;
  notice: Notice | null;
  steps: ApprovalStep[];
  busy: "approve" | "reject" | "claim" | null;
  error: string | null;
  demo: boolean;
  /** demo data: Approve replays the recorded case instead of calling the API */
  replay: boolean;
  /** an alert case written a moment ago, whose WaitForApproval task has not stored its token yet */
  opening: boolean;
  onApprove: () => void;
  onReject: () => void;
  onOpenClaim: () => void;
  claimError: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const status = c.approval?.status;
  const opened = c.approval?.token_issued_at;
  const closes = opened ? new Date(Date.parse(opened) + DAY_MS).toISOString() : null;

  const frame =
    status === "waiting"
      ? "border-line border-l-4 border-l-hold bg-surface-2"
      : status === "approved"
        ? "border-line bg-surface-2"
        : "border-line bg-surface-1";

  return (
    <div className={`space-y-4 rounded-md border p-4 md:p-5 ${frame}`}>
      {status === "waiting" && (
        <>
          <div className="space-y-1">
            <p className="m-0 font-mono text-[12px] font-medium tracking-[0.1em] text-hold uppercase" role="status">
              Waiting for you
            </p>
            <p className="m-0 text-xs text-muted">
              Since {fmtWhen(opened)}
              {closes ? ` · closes ${fmtWhen(closes)} (24 h)` : ""}
            </p>
          </div>
          <p className="m-0 text-[14px] leading-relaxed text-text">
            Approve to draft a claim letter to {addressee(c, item)} and seal a signed copy of {snapshotNoun(notice)} as
            evidence. Nothing is sent anywhere: the letter is yours to hand over.
          </p>
          <p className="m-0 text-[13px] leading-relaxed text-muted">
            Step Functions has paused this check at WaitForApproval. It cannot draft or seal anything until you answer.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            <Button size="lg" className="px-5" onClick={onApprove} disabled={busy !== null}>
              {busy === "approve" ? "Approving…" : "Approve"}
            </Button>
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={busy !== null || demo}
                title={demo ? "Demo data is read-only: rejecting runs on the live API" : undefined}
                className="text-sm text-muted underline-offset-4 hover:text-text hover:underline disabled:opacity-50 disabled:hover:no-underline"
              >
                Reject
              </button>
            ) : (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-muted">Reject? Nothing will be drafted.</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    onReject();
                  }}
                  disabled={busy !== null}
                  className="font-medium text-alert underline-offset-4 hover:underline"
                >
                  {busy === "reject" ? "Rejecting…" : "Reject case"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-muted underline-offset-4 hover:text-text hover:underline"
                >
                  Keep waiting
                </button>
              </span>
            )}
          </div>
          {replay && (
            <p className="m-0 text-xs text-muted">
              Demo data: Approve replays case {c.case_id} as it ran on the live API (Claim, then Evidence, with the
              recorded timings).
            </p>
          )}
        </>
      )}

      {status === "approved" && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="m-0 font-mono text-[12px] font-medium tracking-[0.1em] text-text uppercase">Approved</p>
            <p className="m-0 font-mono text-[11px] text-muted">{fmtWhen(c.approval?.approved_at)}</p>
          </div>
          <Steps steps={steps} c={c} item={item} notice={notice} />
          {c.claim_pdf_s3_key && (
            <div className="space-y-2.5 border-t border-line pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="m-0 text-[13px] text-muted">
                  Claim letter to <span className="text-text">{addressee(c, item)}</span>
                </p>
                <Button variant="outline" size="sm" onClick={onOpenClaim} disabled={busy === "claim"}>
                  <FileText aria-hidden />
                  {busy === "claim" ? "Opening…" : "Open claim letter"}
                </Button>
              </div>
              {claimError && <p className="m-0 text-xs text-alert">Could not open the letter: {claimError}</p>}
              {c.claim_text && (
                <pre
                  tabIndex={0}
                  aria-label="Claim letter text"
                  className="m-0 max-h-80 overflow-y-auto bg-paper px-4 py-3.5 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink"
                >
                  {c.claim_text}
                </pre>
              )}
            </div>
          )}
        </>
      )}

      {status === "rejected" && (
        <>
          <p className="m-0 font-mono text-[12px] font-medium tracking-[0.1em] text-muted uppercase">Rejected</p>
          <p className="m-0 text-[14px] leading-relaxed text-text">
            You rejected this at {fmtWhen(c.approval?.rejected_at)}. No letter was drafted and nothing was sealed; the check
            ended in Step Functions with the error Rejected.
          </p>
        </>
      )}

      {status === "expired" && (
        <>
          <p className="m-0 font-mono text-[12px] font-medium tracking-[0.1em] text-muted uppercase">Expired</p>
          <p className="m-0 text-[14px] leading-relaxed text-text">
            No answer within 24 hours: the approval closed at {fmtWhen(c.approval?.expired_at)} and nothing was drafted.
            Check the item again from My things to open a new case.
          </p>
        </>
      )}

      {!status && (
        <>
          <p className="m-0 font-mono text-[12px] font-medium tracking-[0.1em] text-muted uppercase">
            {opening ? "Opening the approval" : "No approval open"}
          </p>
          <p className="m-0 text-[14px] leading-relaxed text-text">
            {opening
              ? "The check hands this case to you in a moment: Step Functions is starting WaitForApproval."
              : "This case was decided before approvals existed, so there is nothing to approve. Check the item again from My things to open one that waits for you."}
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="m-0 text-[13px] text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
