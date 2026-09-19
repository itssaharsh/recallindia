"use client";

import { motion, useReducedMotion } from "motion/react";

import { SourceChip } from "@/components/common/source-chip";
import { fmtDay, noticeIdentifier } from "@/lib/format";
import { CROSSFADE, SNAP_IN } from "@/lib/motion";
import type { Notice } from "@/lib/types";

/**
 * One ledger row, 40px, radius 0: source · product · identifier · failed test / hazard · date.
 * A row that arrived by a live poll snaps in (translate-y spring, 220ms); rows that were already
 * on screen never animate.
 */
export function FeedRow({ notice, fresh, onOpen }: { notice: Notice; fresh: boolean; onOpen: (n: Notice) => void }) {
  const reduce = useReducedMotion();
  const enter = !fresh
    ? false
    : reduce
      ? { opacity: 0 }
      : { opacity: 0, y: -12 };
  return (
    <motion.li
      initial={enter}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? CROSSFADE : SNAP_IN}
      className="feed-row border-b border-line"
    >
      <button
        type="button"
        onClick={() => onOpen(notice)}
        className="grid h-10 w-full grid-cols-[4rem_minmax(0,1fr)_6.5rem] items-center gap-3 px-5 text-left text-[13px] transition-colors hover:bg-surface-1 focus-visible:bg-surface-1 md:grid-cols-[4.75rem_minmax(0,1.2fr)_9rem_minmax(0,1fr)_6.5rem]"
      >
        <SourceChip notice={notice} />
        <span className="truncate text-text">{notice.product || notice.title}</span>
        <span className="truncate font-mono text-[12.5px] text-text">{noticeIdentifier(notice)}</span>
        <span className="hidden truncate text-muted md:block">{notice.hazard_or_failed_test || "—"}</span>
        <span className="hidden text-right text-xs text-muted md:block">{fmtDay(notice.published_at)}</span>
      </button>
    </motion.li>
  );
}

export function FeedRowSkeleton() {
  return (
    <li aria-hidden className="grid h-10 grid-cols-[4rem_minmax(0,1fr)_6.5rem] items-center gap-3 border-b border-line px-5 md:grid-cols-[4.75rem_minmax(0,1.2fr)_9rem_minmax(0,1fr)_6.5rem]">
      <span className="h-5 w-14 bg-surface-2" />
      <span className="h-3 w-4/5 bg-surface-2" />
      <span className="h-3 w-20 bg-surface-2" />
      <span className="hidden h-3 w-3/4 bg-surface-2 md:block" />
      <span className="ml-auto hidden h-3 w-16 bg-surface-2 md:block" />
    </li>
  );
}
