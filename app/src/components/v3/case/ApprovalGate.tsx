"use client";
import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Copy, FileText, Key, Lock, Stamp } from "lucide-react";
import { Button, cn } from "../ui";
import { PRIMARY_SHADOW } from "./classes";
import { EASE_DRAW, S } from "./motion";

/**
 * C3 · ApprovalGate: the human-in-the-loop moment, inline and never a modal (no role="dialog" anywhere).
 * Matches the gate in `case-waiting-1536.png`. Shares `layoutId="approval"` with <ReceiptPill>, so on the
 * approve response the card collapses into the receipt (height 234→56, radius 22→999, one 380/34 spring).
 */
export interface ApprovalGateProps {
  /** "waiting" (own household) or "readonly" (demo: primary becomes "Make my own copy") */
  mode: "waiting" | "readonly";
  /** POST /approve in flight: "Approving…", both buttons aria-disabled */
  approving?: boolean;
  /** POST /reject in flight */
  dismissing?: boolean;
  /** "row 12" / "the notice" */
  noticeNoun: string;
  /** "CDSCO" */
  sourceShort: string;
  /** case.claim_addressee: "pharmacy" */
  addressee: string;
  /** item.kind === "medicine" → "strip" */
  thingNoun: string;
  retentionDays?: number;
  onApprove?: () => void;
  onDismiss?: () => void;
  onMakeCopy?: () => void;
  className?: string;
}

export function ApprovalGate({
  mode, approving = false, dismissing = false, noticeNoun, sourceShort, addressee, thingNoun, retentionDays = 30,
  onApprove, onDismiss, onMakeCopy, className,
}: ApprovalGateProps) {
  const [confirming, setConfirming] = React.useState(false);
  const reduce = useReducedMotion();
  const busy = approving || dismissing;
  const readonly = mode === "readonly";
  const mine = thingNoun === "strip" ? "my strip" : "mine";

  return (
    <motion.section
      layoutId="approval"
      aria-labelledby="gate-h"
      transition={{ layout: S.layout }}
      style={{ borderRadius: 22 }}
      className={cn(
        "relative border-2 border-cobalt bg-surface-1 px-7 py-[26px]",
        "shadow-[0_2px_4px_rgb(10_88_194/.08),0_26px_50px_-22px_rgb(10_88_194/.5)]",
        "max-md:px-[18px] max-md:py-5",
        className,
      )}
    >
      <AnimatePresence initial={false} mode="wait">
        {confirming ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
            className="flex flex-wrap items-center gap-4"
          >
            <p className="mr-auto text-[16px] leading-[1.55] font-semibold text-ink">
              Dismiss this match? The case closes and nothing is sealed.
            </p>
            <Button
              variant="secondary"
              loading={dismissing}
              aria-disabled={busy || undefined}
              onClick={() => { if (!busy) onDismiss?.(); }}
              className="h-12! text-danger hover:text-danger-hover"
            >
              Dismiss match
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} className="h-12!">Keep it</Button>
          </motion.div>
        ) : (
          <motion.div
            key="ask"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
            className="grid grid-cols-[minmax(0,1fr)_300px] items-center gap-7 max-md:grid-cols-1 max-md:gap-[18px]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-3.5">
                <span className="relative grid size-13 flex-none place-items-center rounded-full bg-cobalt text-white">
                  <Stamp aria-hidden className="size-[26px]" strokeWidth={1.9} />
                  {!approving && (
                    <motion.span
                      aria-hidden
                      className="absolute -inset-[7px] rounded-full border-2 border-cobalt"
                      initial={false}
                      animate={reduce ? { opacity: 0.35, scale: 1 } : { scale: [0.86, 1.18], opacity: [0.5, 0] }}
                      transition={reduce ? { duration: 0 } : { duration: 1.8, ease: EASE_DRAW, repeat: Infinity }}
                    />
                  )}
                </span>
                <h2 id="gate-h" className="font-display text-[32px] leading-[1.05] font-extrabold tracking-[-.03em] text-ink max-md:text-[26px]">
                  Waiting for you
                </h2>
              </div>
              <p className="mt-3 max-w-[600px] text-[16px] leading-[1.55] text-ink-muted [&_b]:font-semibold [&_b]:text-ink">
                If this is your {thingNoun}, approve and RecallIndia <b>seals {sourceShort}&apos;s {noticeNoun} as evidence</b> and{" "}
                <b>writes a claim letter</b> to the {addressee}. Nothing is sent to anyone.
                {readonly && <> The demo household is read-only. Make your own copy to approve this case.</>}
              </p>
              <ol aria-label="What approving does" className="mt-[18px] flex flex-wrap items-center gap-[7px] max-md:hidden">
                <FlowStep icon={<Lock className="size-[17px]" strokeWidth={1.9} />} title={`Seal ${noticeNoun}`} sub={`S3 Object Lock, ${retentionDays} days`} />
                <FlowArrow />
                <FlowStep icon={<FileText className="size-[17px]" strokeWidth={1.9} />} title="Write your letter" sub={`To the ${addressee}`} />
                <FlowArrow />
                <FlowStep icon={<Key className="size-[17px]" strokeWidth={1.9} />} title="Verify the signature" sub="AWS KMS" />
              </ol>
            </div>
            <div className="flex flex-col gap-2.5">
              {readonly ? (
                <Button
                  onClick={onMakeCopy}
                  icon={<Copy aria-hidden className="size-5" strokeWidth={1.9} />}
                  className={cn("h-14! w-full text-[16.5px]!", PRIMARY_SHADOW)}
                >
                  Make my own copy
                </Button>
              ) : (
                <Button
                  loading={approving}
                  aria-disabled={busy || undefined}
                  onClick={() => { if (!busy) onApprove?.(); }}
                  icon={<Stamp aria-hidden className="size-5" strokeWidth={1.9} />}
                  className={cn("h-14! w-full text-[16.5px]!", PRIMARY_SHADOW)}
                >
                  {approving ? "Approving…" : "Approve and seal evidence"}
                </Button>
              )}
              <Button
                variant="secondary"
                aria-disabled={busy || readonly || undefined}
                onClick={() => { if (!busy && !readonly) setConfirming(true); }}
                className={cn("h-12! w-full", readonly && "text-ink-muted")}
              >
                Dismiss, it&apos;s not {mine}
              </Button>
              <span className="mt-0.5 text-center text-[13px] leading-[1.45] text-ink-muted">
                About 9 seconds from approval to a signed, locked claim.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function FlowStep({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <li className="flex items-center gap-[9px] rounded-pill bg-surface-2 py-[7px] pr-[13px] pl-[7px]">
      <i aria-hidden className="grid size-8 flex-none place-items-center rounded-full bg-white text-cobalt not-italic">{icon}</i>
      <span className="text-[14px] leading-[1.2] font-semibold text-ink">
        {title}
        <small className="block text-[12px] leading-[1.3] font-normal text-ink-muted">{sub}</small>
      </span>
    </li>
  );
}

function FlowArrow() {
  return (
    <li aria-hidden className="flex">
      <ArrowRight className="size-3.5 flex-none text-line-strong" strokeWidth={2.2} />
    </li>
  );
}
