"use client";

import { motion, useReducedMotion } from "motion/react";
import { memo } from "react";

import { SourceChip } from "@/components/common/source-chip";
import { fmtDay, noticeIdentifier } from "@/lib/format";
import { CROSSFADE, SNAP_IN } from "@/lib/motion";
import type { Notice } from "@/lib/types";

const ROW = "feed-row border-b border-line";

/**
 * One ledger row, 40px, radius 0: source · product · identifier · failed test / hazard · date.
 * A row that arrived by a live poll snaps in (translate-y spring, 220ms); rows that were already
 * on screen never animate, so they are plain list items (no motion component per row), and a
 * poll that adds rows does not re-render the ones already there (memo).
 */
export const FeedRow = memo(function FeedRow({
  notice,
  fresh,
  onOpen,
}: {
  notice: Notice;
  fresh: boolean;
  onOpen: (n: Notice) => void;
}) {
  const row = (
    <button
      type="button"
      onClick={() => onOpen(notice)}
      className="grid h-10 w-full grid-cols-[4rem_minmax(0,1fr)_6.5rem] items-center gap-3 px-5 text-left text-[13px] transition-colors hover:bg-surface-2 focus-visible:bg-surface-1 md:grid-cols-[4.75rem_minmax(0,1.2fr)_9rem_minmax(0,1fr)_6.5rem]"
    >
      <SourceChip notice={notice} />
      <span className="truncate text-ink">{notice.product || notice.title}</span>
      <span className="truncate font-mono text-[12.5px] text-ink">{noticeIdentifier(notice)}</span>
      <span className="hidden truncate text-muted md:block">{notice.hazard_or_failed_test || "—"}</span>
      <span className="hidden text-right text-xs text-muted md:block">{fmtDay(notice.published_at)}</span>
    </button>
  );
  return fresh ? <SnapIn>{row}</SnapIn> : <li className={ROW}>{row}</li>;
});

function SnapIn({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? CROSSFADE : SNAP_IN}
      className={ROW}
    >
      {children}
    </motion.li>
  );
}

export function FeedRowSkeleton() {
  return (
    <li aria-hidden className="grid h-10 grid-cols-[4rem_minmax(0,1fr)_6.5rem] items-center gap-3 border-b border-line px-5 md:grid-cols-[4.75rem_minmax(0,1.2fr)_9rem_minmax(0,1fr)_6.5rem]">
      <span className="h-5 w-14 bg-surface-1" />
      <span className="h-3 w-4/5 bg-surface-1" />
      <span className="h-3 w-20 bg-surface-1" />
      <span className="hidden h-3 w-3/4 bg-surface-1 md:block" />
      <span className="ml-auto hidden h-3 w-16 bg-surface-1 md:block" />
    </li>
  );
}
