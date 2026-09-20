"use client";
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Stamp, X } from "lucide-react";
import { Chip, cn, type ChipTone } from "../ui";
import { CHIP_LG } from "./classes";
import { dayMonYear, istTime } from "./format";
import { S } from "./motion";
import type { CaseUiState } from "./types";

/** C1 · CaseCrumbs: a way back, what this case is, and its status. */
export interface CaseCrumbsProps {
  state: CaseUiState;
  /** item.name */
  itemName: string | null;
  /** case.case_id */
  caseId: string | null;
  /** case.created_at */
  createdAt: string | null;
  /** set after "Verify again" (ISO) */
  verifiedAgainAt?: string | null;
  backHref?: string;
}

interface ChipModel { key: string; tone: ChipTone; icon: React.ReactNode; text: string }

const ICON = "size-3.5 shrink-0";

export function crumbChip(state: CaseUiState, verifiedAgainAt?: string | null): ChipModel | null {
  switch (state) {
    case "verified":
      return verifiedAgainAt
        ? { key: "again", tone: "clear", icon: <Check className={ICON} strokeWidth={2.8} />, text: `Verified again · ${istTime(verifiedAgainAt)} IST` }
        : { key: "ready", tone: "clear", icon: <Check className={ICON} strokeWidth={2.8} />, text: "Claim ready · verified" };
    case "waiting":
    case "readonly":
      return { key: "wait", tone: "info", icon: <Stamp className={ICON} strokeWidth={2} />, text: "Waiting for you" };
    case "approving":
    case "sealing":
    case "writing":
    case "verifying":
      return {
        key: "run", tone: "info", text: "Sealing your claim…",
        icon: <span aria-hidden className="size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" />,
      };
    case "invalid":
      return { key: "bad", tone: "alert", icon: <X className={ICON} strokeWidth={2.8} />, text: "Tamper test · invalid" };
    case "rejected":
      return { key: "rej", tone: "hold", icon: <X className={ICON} strokeWidth={2.4} />, text: "Dismissed" };
    case "expired":
      return { key: "exp", tone: "hold", icon: <X className={ICON} strokeWidth={2.4} />, text: "Expired" };
    case "failed":
      return { key: "fail", tone: "hold", icon: <X className={ICON} strokeWidth={2.4} />, text: "Paused · a step failed" };
    default:
      return null;
  }
}

export function CaseCrumbs({ state, itemName, caseId, createdAt, verifiedAgainAt, backHref = "/mine" }: CaseCrumbsProps) {
  const chip = crumbChip(state, verifiedAgainAt);
  return (
    <nav aria-label="Breadcrumb" className="mt-4 flex min-h-11 items-center gap-3 max-md:mt-3">
      <a
        href={backHref}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-pill border border-line bg-surface-1 pr-4 pl-3",
          "text-[14px] leading-none font-medium text-ink transition-colors duration-150 hover:bg-surface-2",
          "relative after:absolute after:-inset-y-0.5 after:inset-x-0 after:content-['']", // 44 px hit area
        )}
      >
        <ArrowLeft aria-hidden className="size-[18px] text-ink-muted" strokeWidth={2.1} />
        My things
      </a>
      {itemName && <span className="text-[14px] leading-none font-medium text-ink-muted max-md:hidden">/ {itemName}</span>}
      <span className="flex-1" />
      {caseId && <span className="font-mono text-[13px] leading-none text-ink-muted max-md:hidden">{caseId}</span>}
      {createdAt && <span className="text-[13px] leading-none font-medium text-ink-muted max-md:hidden">· opened {dayMonYear(createdAt)}</span>}
      <div role="status" className="flex">
        <AnimatePresence initial={false} mode="popLayout">
          {chip && (
            <motion.span
              key={chip.key}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: 0.16 }, layout: S.chip }}
              className="inline-flex"
            >
              <Chip tone={chip.tone} className={CHIP_LG}>
                {chip.icon}
                {chip.text}
              </Chip>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
