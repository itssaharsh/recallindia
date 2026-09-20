"use client";

import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from "react";

import { fmtCount } from "@/lib/format";
import type { RowNotice } from "@/lib/ingest";
import { MAX_ANIMATED, ROW_H } from "@/lib/ingest-motion";

import { ROW_CELLS, ROW_CHIP, ROW_GRID, buildLandedRow, rowTexts } from "./row-markup";

export interface Landing {
  row: number;
  notice: RowNotice;
}

export interface ColumnHandle {
  /** the list's box and how many rows fit: measured once, the list does not move while landing */
  measure: () => { box: DOMRect; visible: number } | null;
  land: (batch: Landing[]) => void;
  merged: (count: number) => void;
  reset: () => void;
}

/**
 * The right column: a large tabular counter and the rows as they land, oldest at the top like the
 * table they came from. While rows land, the list and the counter are written directly (a React
 * render per landing measured as a real share of the frame budget at 4x CPU) and only the rows that
 * fit are kept, older ones leaving at the top; once the run is settled React renders every row,
 * scrollable.
 */
export const DissolveColumn = memo(
  forwardRef<ColumnHandle, { title: string; rowsIn: number | null; settled: boolean; reduce: boolean; empty: string }>(
    function DissolveColumn({ title, rowsIn, settled, reduce, empty }, ref) {
      const list = useRef<HTMLDivElement>(null);
      const live = useRef<HTMLOListElement>(null);
      const counter = useRef<HTMLSpanElement>(null);
      const emptyNote = useRef<HTMLParagraphElement>(null);
      const all = useRef<Landing[]>([]);
      const visible = useRef(10);
      const reduceRef = useRef(reduce);
      reduceRef.current = reduce;
      const [landed, setLanded] = useState<Landing[]>([]);
      const [mergedLines, setMergedLines] = useState(0);

      useEffect(() => {
        const el = list.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
          visible.current = Math.max(1, Math.min(MAX_ANIMATED, Math.floor(entry.contentRect.height / ROW_H)));
        });
        ro.observe(el);
        return () => ro.disconnect();
      }, []);

      // settled: hand the whole list to React, once
      useEffect(() => {
        if (settled) setLanded([...all.current]);
      }, [settled]);

      useImperativeHandle(
        ref,
        () => ({
          measure: () => (list.current ? { box: list.current.getBoundingClientRect(), visible: visible.current } : null),
          land: (batch) => {
            const ol = live.current;
            for (const l of batch) {
              all.current.push(l);
              if (!ol) continue;
              ol.append(buildLandedRow(l.notice, reduceRef.current));
              while (ol.childElementCount > visible.current) ol.firstElementChild?.remove();
            }
            if (counter.current) counter.current.textContent = fmtCount(all.current.length);
            if (emptyNote.current) emptyNote.current.hidden = all.current.length > 0;
          },
          merged: (count) => setMergedLines((m) => m + count),
          reset: () => {
            all.current = [];
            live.current?.replaceChildren();
            if (counter.current) counter.current.textContent = "0";
            if (emptyNote.current) emptyNote.current.hidden = false;
            setLanded([]);
            setMergedLines(0);
          },
        }),
        [],
      );

      return (
        <div className="ingest-layer flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-line bg-surface-1 shadow-1">
          <div className="flex items-end justify-between gap-3 border-b border-line px-5 pt-5 pb-4">
            {/* no aria-live: 55 updates in a few seconds would flood a screen reader; the banner
                after Publish announces the result */}
            <p className="m-0 flex items-baseline gap-2.5">
              {/* written directly while rows land; React only ever renders its first "0" */}
              <span
                ref={counter}
                className="font-display text-[64px] leading-[0.85] font-extrabold tracking-[-0.04em] text-cobalt tabular-nums"
              >
                0
              </span>
              <span className="font-display text-[24px] leading-none font-extrabold tracking-[-0.02em] text-ink">notices</span>
            </p>
            <div className="min-w-0 text-right">
              <p className="m-0 font-display text-[18px] leading-tight font-bold text-ink tabular-nums">
                {rowsIn !== null ? `${fmtCount(rowsIn)} rows read` : "rows read: —"}
              </p>
              <p className="m-0 mt-0.5 text-[13px] text-ink-muted">
                {title}
                {mergedLines > 0 ? ` · ${mergedLines} continuation line${mergedLines === 1 ? "" : "s"} merged` : ""}
              </p>
            </div>
          </div>
          <div ref={list} className={`relative min-h-0 flex-1 ${settled ? "overflow-y-auto" : "overflow-hidden"}`}>
            <p ref={emptyNote} className="m-0 flex h-full min-h-40 items-center justify-center px-8 text-center text-[14px] leading-relaxed text-ink-muted">
              {empty}
            </p>
            {/* landing: rows are appended here directly (React renders no children into it) */}
            <ol ref={live} className="m-0 list-none p-0" hidden={settled} aria-hidden />
            {settled && (
              <ol className="m-0 list-none p-0" aria-label="Notices from this PDF">
                {landed.map((l) => (
                  <LandedRow key={l.row} notice={l.notice} />
                ))}
              </ol>
            )}
          </div>
        </div>
      );
    },
  ),
);

const LandedRow = memo(function LandedRow({ notice }: { notice: RowNotice }) {
  const [product, batch, test] = rowTexts(notice);
  return (
    <li className="border-b border-line bg-surface-1 contain-content">
      <div className={ROW_GRID} title={`${notice.product} · ${notice.maker}`}>
        <span className={ROW_CHIP}>CDSCO</span>
        <span className={ROW_CELLS[0]}>{product}</span>
        <span className={ROW_CELLS[1]}>{batch}</span>
        <span className={ROW_CELLS[2]}>{test}</span>
      </div>
    </li>
  );
});
