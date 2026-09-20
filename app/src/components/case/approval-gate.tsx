"use client";

import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { addressee, snapshotNoun } from "@/lib/case";
import { fmtClock } from "@/lib/format";
import type { Case, Item, Notice } from "@/lib/types";

/** What the letter will ask for, in the words the letter uses. */
function remedyWord(item: Item | null, notice: Notice | null): string {
  if (item?.kind === "vehicle") return "a free repair under the recall";
  return notice?.remedy ? "the remedy the notice sets out" : "a refund or a replacement";
}

const seller = (item: Item | null) =>
  item?.bought_from || (item?.kind === "medicine" ? "pharmacy" : item?.kind === "vehicle" ? "dealer" : "seller");

/**
 * C-16: the human decides. Nothing is sealed and no letter is written without this click — the
 * Step Functions execution is physically parked on a task token until it happens.
 */
export function ApprovalGate({
  c,
  item,
  notice,
  busy,
  error,
  demoReadOnly,
  onApprove,
  onReject,
  onMakeCopy,
}: {
  c: Case;
  item: Item | null;
  notice: Notice | null;
  busy: "approve" | "reject" | null;
  error: string | null;
  /** the demo household's case: readable by anyone, answerable by nobody */
  demoReadOnly: boolean;
  onApprove: () => void;
  onReject: () => void;
  onMakeCopy: () => void;
}) {
  const status = c.status;
  const approvedAt = c.approval?.approved_at;
  const frame = "rounded-md border border-line-strong bg-surface-1 p-4 md:p-6";

  if (status === "verified" || status === "approving" || status === "sealing" || status === "writing_letter" || status === "verifying") {
    return (
      <div className={`${frame} flex items-center gap-2.5`}>
        <Check aria-hidden className="size-4 text-success" />
        <p className="text-[14px] text-ink">
          Approved at {fmtClock(approvedAt)} · the pipeline resumed
        </p>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className={frame}>
        <p className="text-[14px] text-ink">
          Rejected at {fmtClock(c.approval?.rejected_at)} · no letter was written
        </p>
      </div>
    );
  }
  if (status === "expired") {
    return (
      <div className={frame}>
        <p className="text-[14px] text-ink">
          This approval expired after 24 hours. Check the item again to start a new case.
        </p>
      </div>
    );
  }

  return (
    <div className={`${frame} space-y-3`}>
      <h2 className="font-display text-xl font-semibold text-ink">Approve the claim letter</h2>
      <p className="text-[15px] leading-relaxed text-ink">
        RecallIndia will seal a copy of this notice as evidence, then write a letter to the {seller(item)} asking for{" "}
        {remedyWord(item, notice)} that cites it. Nothing is sent; you download the letter.
      </p>
      {demoReadOnly ? (
        <div className="space-y-2.5">
          <p className="text-[13px] leading-relaxed text-muted">
            This is the demo household&apos;s case, already approved. Make your own copy to approve one yourself.
          </p>
          <Button variant="outline" onClick={onMakeCopy}>
            Make my own copy
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            <Button size="lg" className="px-5" onClick={onApprove} disabled={busy !== null} aria-busy={busy === "approve"}>
              {busy === "approve" && <Loader2 aria-hidden className="size-4 animate-spin" />}
              {busy === "approve" ? "Approving…" : "Approve claim letter"}
            </Button>
            <button
              type="button"
              onClick={onReject}
              disabled={busy !== null}
              className="rounded-sm px-2 py-1 text-sm text-muted hover:text-ink disabled:opacity-50"
            >
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </div>
          <p className="text-[13px] text-muted">
            Sealing {snapshotNoun(notice)} and writing to {addressee(c, item)} takes a few seconds.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-warning">
          {error}
        </p>
      )}
    </div>
  );
}
