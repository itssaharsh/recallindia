"use client";

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { fmtCount } from "@/lib/format";
import type { RowNotice } from "@/lib/ingest";
import { MAX_ANIMATED, ROW_H } from "@/lib/ingest-motion";

import { ROW_CELLS, ROW_CHIP, ROW_GRID, rowTexts } from "./row-markup";

export interface Landing {
  row: number;
  notice: RowNotice;
}

export interface ColumnHandle {
  /** where the k-th landed notice will sit on screen (the bottom slot once the column is full) */
  slotRect: (k: number) => DOMRect | null;
  land: (batch: Landing[]) => void;
  merged: (count: number) => void;
  reset: () => void;
}

/**
 * The right column: a large tabular counter and the rows as they land, oldest at the top like the
 * table they came from. While rows are landing only the rows that fit are mounted (the older ones
 * scroll off the top); once the run is settled every row is there to scroll through.
 */
export const DissolveColumn = memo(
  forwardRef<
    ColumnHandle,
    {
      title: string;
      rowsIn: number | null;
      settled: boolean;
      reduce: boolean;
      empty: string;
    }
  >(function DissolveColumn({ title, rowsIn, settled, reduce, empty }, ref) {
    const list = useRef<HTMLDivElement>(null);
    const [landed, setLanded] = useState<Landing[]>([]);
    const [mergedLines, setMergedLines] = useState(0);
    const [visible, setVisible] = useState(10);
    const visibleRef = useRef(10);

    useEffect(() => {
      const el = list.current;
      if (!el) return;
      const ro = new ResizeObserver(([entry]) => {
        const v = Math.max(1, Math.min(MAX_ANIMATED, Math.floor(entry.contentRect.height / ROW_H)));
        visibleRef.current = v;
        setVisible(v);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const slotRect = useCallback((k: number) => {
      const el = list.current;
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const slot = Math.min(k, visibleRef.current - 1);
      return new DOMRect(box.left, box.top + slot * ROW_H, box.width, ROW_H);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        slotRect,
        land: (batch) => setLanded((prev) => [...prev, ...batch]),
        merged: (count) => setMergedLines((m) => m + count),
        reset: () => {
          setLanded([]);
          setMergedLines(0);
        },
      }),
      [slotRect],
    );

    // while landing: the newest rows that fit; settled: all of them, scrollable
    const shown = settled ? landed : landed.slice(-visible);
    const hidden = landed.length - shown.length;

    return (
      <div className="flex min-h-0 min-w-0 flex-col border border-line bg-surface-1">
        <div className="flex items-end justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="m-0 text-xs text-muted">{title}</p>
            <p className="m-0 text-xs text-muted">
              {rowsIn !== null ? `${fmtCount(rowsIn)} rows read` : "rows read: —"}
              {mergedLines > 0 ? ` · ${mergedLines} continuation line${mergedLines === 1 ? "" : "s"} merged` : ""}
            </p>
          </div>
          {/* no aria-live: 55 updates in a few seconds would flood a screen reader; the banner
            after Publish announces the result */}
          <p className="m-0 flex items-baseline gap-2">
            <span className="font-display text-5xl leading-none font-semibold text-text tabular-nums">
              {fmtCount(landed.length)}
            </span>
            <span className="text-sm text-muted">notices</span>
          </p>
        </div>
        <div ref={list} className={`relative min-h-0 flex-1 ${settled ? "overflow-y-auto" : "overflow-hidden"}`}>
          {landed.length === 0 && (
            <p className="m-0 flex h-full items-center justify-center px-6 text-center text-[13px] text-muted">{empty}</p>
          )}
          {hidden > 0 && !settled && <span className="sr-only">{hidden} earlier rows are above</span>}
          <ol className="m-0 list-none p-0" aria-label="Notices from this PDF">
            {shown.map((l) => (
              <LandedRow key={l.row} notice={l.notice} fade={reduce} />
            ))}
          </ol>
        </div>
      </div>
    );
  }),
);

const LandedRow = memo(function LandedRow({ notice, fade }: { notice: RowNotice; fade: boolean }) {
  const [product, batch, test] = rowTexts(notice);
  return (
    <li className={`border-b border-line bg-surface-2 ${fade ? "ingest-fade-in" : ""}`}>
      <div className={ROW_GRID} title={`${notice.product} · ${notice.maker}`}>
        <span className={ROW_CHIP}>CDSCO</span>
        <span className={ROW_CELLS[0]}>{product}</span>
        <span className={ROW_CELLS[1]}>{batch}</span>
        <span className={ROW_CELLS[2]}>{test}</span>
      </div>
    </li>
  );
});
