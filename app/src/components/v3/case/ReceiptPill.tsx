"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Check, TriangleAlert, X } from "lucide-react";
import { Button, cn } from "../ui";
import { useLive, useMedia } from "./hooks";
import { S } from "./motion";

/**
 * C3 · ApprovalReceipt: what the gate collapses into (`case-1536.png`, y 469, 1044×56, radius 999;
 * radius 14 under 768). Focus lands here after approval (tabIndex -1).
 */
export type ReceiptKind = "done" | "running" | "approved" | "rejected" | "expired";

export interface ReceiptPillProps {
  kind: ReceiptKind;
  demo: boolean;
  /** "05:28" (IST) from approval.approved_at / rejected_at / expired_at */
  time: string;
  /** "20 Sep 2026" */
  date?: string;
  /** "9.0" from pipelineTotalMs */
  totalSecs?: string | null;
  /** reduced motion: auto-scroll is off, so offer the jump link */
  showJump?: boolean;
  onCheckAgain?: () => void;
  /** fade in after the gate collapses (false on first paint) */
  animateIn?: boolean;
  ref?: React.Ref<HTMLDivElement>;
  className?: string;
}

export function ReceiptPill({ kind, demo, time, date, totalSecs, showJump, onCheckAgain, animateIn = false, ref, className }: ReceiptPillProps) {
  const narrow = useMedia("(max-width: 767px)");
  const mounted = useLive();
  const lead = demo ? <><b>Approved at {time} IST</b> for the demo household.</> : <b>You approved this at {time} IST.</b>;
  let body: React.ReactNode;
  if (kind === "done") body = <>{lead} Sealed, written and verified in {totalSecs ?? "…"} s.</>;
  else if (kind === "running") body = <>{lead} Sealing your claim…</>;
  else if (kind === "approved") body = lead;
  else if (kind === "rejected") body = <><b>You dismissed this match at {time} IST.</b> Nothing was sealed.</>;
  else body = <><b>This approval expired at {time} IST.</b> Nothing was sealed.</>;
  const ok = kind === "done" || kind === "running" || kind === "approved";

  return (
    <motion.div
      ref={ref}
      tabIndex={-1}
      layoutId="approval"
      initial={animateIn ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ opacity: { delay: 0.08, duration: 0.18 }, layout: S.layout }}
      // radius lives in CSS for the first paint; framer needs it in style to correct it during the morph
      style={mounted ? { borderRadius: narrow ? 14 : 999 } : undefined}
      className={cn(
        "flex min-h-14 rounded-pill max-md:rounded-md items-center gap-3 border border-line bg-surface-1 py-2 pr-5 pl-2.5 text-[15px] leading-[1.4] text-ink-muted outline-none",
        "focus-visible:shadow-[0_0_0_2px_var(--surface-1),0_0_0_4px_var(--cobalt)] [&_b]:font-semibold [&_b]:text-ink",
        "max-md:items-start max-md:py-3 max-md:pr-3.5 max-md:pl-3 max-md:text-[14px]",
        className,
      )}
    >
      <motion.span layout className={cn("grid size-9 flex-none place-items-center rounded-full", ok ? "bg-success-soft text-success" : "bg-surface-2 text-ink-muted")}>
        {ok ? <Check aria-hidden className="size-[18px]" strokeWidth={2.8} /> : <X aria-hidden className="size-[18px]" strokeWidth={2.6} />}
      </motion.span>
      <motion.span layout className="min-w-0">
        {body}
        {showJump && kind === "running" && (
          <a href="#evidence" className="ml-2 font-semibold whitespace-nowrap text-cobalt underline-offset-2 hover:underline">
            Jump to your claim ↓
          </a>
        )}
      </motion.span>
      {kind === "expired" ? (
        <Button variant="secondary" size="sm" onClick={onCheckAgain} className="ml-auto flex-none">Check this thing again</Button>
      ) : (
        date && <motion.span layout className="ml-auto text-[13px] leading-none font-medium whitespace-nowrap text-ink-muted tabular-nums max-md:hidden">{date}</motion.span>
      )}
    </motion.div>
  );
}

/** Failed step or timed-out polling (spec §1 "failed", §4). Sits under the receipt. */
export function PipelineErrorCard({ stepLabel, error, timedOut, onCheckStatus }: { stepLabel?: string; error?: string; timedOut?: boolean; onCheckStatus?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-1 px-5 py-4 shadow-1 max-md:order-1">
      <span className="grid size-9 flex-none place-items-center rounded-full bg-warning-soft text-warning">
        <TriangleAlert aria-hidden className="size-[18px]" strokeWidth={2.2} />
      </span>
      <p className="mr-auto min-w-0 text-[15px] leading-[1.45] text-ink">
        {timedOut ? "Still working." : `${stepLabel} failed: ${error?.replace(/\.$/, "")}. Nothing was sent to anyone.`}
      </p>
      <Button variant="secondary" size="sm" onClick={onCheckStatus}>Check status again</Button>
    </div>
  );
}
