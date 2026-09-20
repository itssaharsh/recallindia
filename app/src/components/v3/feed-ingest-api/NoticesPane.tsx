"use client";
import * as React from "react";
import NumberFlow from "@number-flow/react";
import { useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button, Card, cn } from "../ui";
import { fmtSec } from "./format";
import { useElementHeight } from "./hooks";
import { recordedTotalMs, type IngestFrame } from "./ingestTimeline";
import { IdChip, ObjectTile, SmallChip, SolidChip } from "./primitives";
import type { IngestRun, IngestSpeed } from "./types";

export interface NoticesPaneProps {
  run: IngestRun;
  frame: IngestFrame;
  speed: IngestSpeed;
  /** "/feed?source=cdsco_nsq&since=2025-06-01" */
  feedHref: string;
  onReplay: () => void;
}

const DIFF_WORD = { new: "New", changed: "Changed", unchanged: "Unchanged" } as const;

/**
 * The counter and the landed notices (spec 2.5): 430 × 528 at 1536, full width under the viewer
 * at 390 (rows 57 px, counter 56 px). Newest first; the LandingSlot opens as each ghost lifts.
 */
export function NoticesPane({ run, frame, speed, feedHref, onReplay }: NoticesPaneProps) {
  const reduced = useReducedMotion() ?? false;
  const [listRef, listH] = useElementHeight<HTMLOListElement>();
  const total = frame.slots.length + frame.landed.length;
  const rowH = 55; // 50 + 5 gap (57 + 5 on phones, where the list shows 6)
  const capacity = listH ? Math.max(1, Math.floor((listH + 5) / rowH)) : 6;
  const hiddenRows = frame.landed.slice(Math.max(0, capacity - frame.slots.length)).map((l) => l.row).sort((a, b) => a - b);
  const empty = total === 0;
  const done = frame.done;

  const [said, setSaid] = React.useState("");
  const lastSaid = React.useRef(0);
  React.useEffect(() => {
    const now = Date.now();
    if (frame.count === 0 || now - lastSaid.current < 2000) return;
    lastSaid.current = now;
    setSaid(`${frame.count} ${frame.count === 1 ? "notice" : "notices"}`);
  }, [frame.count]);

  return (
    <Card as="section" aria-label="Notices from this PDF" className="flex min-w-0 flex-col overflow-hidden">
      <header className="flex items-end justify-between px-4 pt-3.5 pb-2.5 lg:px-[18px] lg:pt-4 lg:pb-3">
        <div className="flex items-end gap-2.5">
          <span className="inline-flex h-[.85em] items-center self-end font-display text-[56px] leading-none font-extrabold tracking-[-.04em] text-cobalt lg:text-[64px]">
            <NumberFlow value={frame.count} animated={!reduced} transformTiming={{ duration: 240, easing: "ease-out" }} spinTiming={{ duration: 240, easing: "ease-out" }} />
          </span>
          <span className="pb-px font-display text-[22px] leading-none font-extrabold tracking-[-.02em] text-ink lg:text-[26px]">{frame.count === 1 ? "notice" : "notices"}</span>
        </div>
        <p className="text-right text-[14px] leading-[1.3] font-medium text-ink-muted">
          <b className="mr-1 font-display text-[20px] leading-none font-extrabold text-ink tabular-nums lg:text-[22px]">{frame.rowsRead}</b>
          rows read
          <span className="block text-[13px]">from {run.pages} pages</span>
        </p>
        <span className="sr-only" aria-live="polite">
          {said}
        </span>
      </header>

      {done ? (
        <p className="mx-4 text-[13.5px] leading-[1.3] font-medium text-ink-muted lg:mx-[18px]">
          {run.rows_in} rows read · {run.notices_out} notices · {fmtSec(recordedTotalMs(run))} s end to end
        </p>
      ) : (
        <div
          role="progressbar"
          aria-label="Rows normalised"
          aria-valuemin={0}
          aria-valuemax={run.rows_in}
          aria-valuenow={frame.processed}
          className="mx-4 h-1.5 overflow-hidden rounded-pill bg-surface-2 lg:mx-[18px]"
        >
          <span className="block h-full rounded-pill bg-cobalt transition-[width] duration-[240ms] ease-out" style={{ width: `${(frame.processed / run.rows_in) * 100}%` }} />
        </div>
      )}

      {empty ? (
        <div className="flex flex-1 items-center gap-3 px-4 py-5 lg:items-start lg:px-[18px]">
          <ObjectTile name="doc" source="cdsco_nsq" size={44} />
          <p className="text-[14px] leading-[1.4] text-ink-muted">Rows land here as Textract reads them.</p>
        </div>
      ) : (
        <ol
          ref={listRef}
          reversed
          className="mt-3 flex max-h-[367px] min-h-0 flex-1 flex-col gap-[5px] overflow-y-auto px-3 [scrollbar-width:none] lg:max-h-none [&::-webkit-scrollbar]:hidden"
        >
          {frame.slots.map((s) => (
            <li
              key={`s${s.index}`}
              data-ingest-slot={s.row}
              className="grid shrink-0 grid-cols-[30px_minmax(0,1fr)] items-center gap-2.5 overflow-hidden rounded-[10px] border-[1.5px] border-dashed border-cobalt bg-cobalt-soft/45 px-2.5 text-[13.5px] leading-[1.2] font-semibold text-cobalt"
              style={{ height: 50 * s.open, opacity: Math.min(1, s.open * 1.5) }}
            >
              <span className="grid size-[30px] place-items-center rounded-sm bg-cobalt text-[13px] font-semibold text-white">{s.row}</span>
              <span className="truncate">{s.label}</span>
            </li>
          ))}
          {frame.landed.map((l, k) => {
            const newest = k === 0 && !done;
            return (
              <li
                key={`l${l.index}`}
                data-ingest-landed={l.row}
                className={cn(
                  "grid min-h-[57px] shrink-0 grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] border px-2.5 py-1.5 lg:min-h-[50px]",
                  newest ? "border-cobalt-edge bg-cobalt-wash" : "border-line bg-surface-1",
                )}
                style={{ opacity: l.opacity, transform: l.scale !== 1 ? `scale(${l.scale})` : undefined }}
              >
                <span className="grid size-[30px] place-items-center rounded-sm bg-surface-2 text-[13px] font-semibold text-ink">{l.row}</span>
                <span className="flex min-w-0 flex-col gap-1">
                  <b className="truncate text-[14px] leading-[1.2] font-semibold text-ink">{l.notice.product}</b>
                  <span className="flex min-w-0 items-center gap-2 text-[12.5px] leading-[1.2] text-ink-muted">
                    {l.notice.batch && <IdChip size="sm">{l.notice.batch}</IdChip>}
                    <span className="min-w-0 truncate">{l.notice.test}</span>
                  </span>
                </span>
                {l.diffChip > 0 ? (
                  <span style={{ opacity: l.diffChip }}>
                    <SmallChip tone={l.diff === "new" ? "info" : "neutral"}>{DIFF_WORD[l.diff]}</SmallChip>
                  </span>
                ) : newest ? (
                  <SolidChip>New</SolidChip>
                ) : (
                  <span className="text-[12px] leading-none whitespace-nowrap text-ink-muted">{(l.agoMs / speed / 1000).toFixed(1)} s ago</span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {done ? (
        <footer className="flex gap-2 border-t border-line px-3 py-3 lg:px-[18px]">
          <Button href={feedHref} className="flex-1">
            See them in the feed
            <ArrowRight aria-hidden className="size-[18px]" />
          </Button>
          <Button variant="secondary" onClick={onReplay}>
            Replay again
          </Button>
        </footer>
      ) : (
        !empty &&
        hiddenRows.length > 0 && (
          <button
            type="button"
            onClick={() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })}
            className="min-h-11 border-t border-line px-4 py-2.5 text-left text-[13px] leading-none font-medium text-ink-muted hover:bg-wash lg:min-h-9 lg:px-[18px]"
          >
            + {hiddenRows.length} more ·{" "}
            {hiddenRows.length === 1
              ? `row ${hiddenRows[0]}`
              : hiddenRows.length === 2
                ? `rows ${hiddenRows[0]} and ${hiddenRows[1]}`
                : `rows ${hiddenRows[0]}–${hiddenRows[hiddenRows.length - 1]}`}
          </button>
        )
      )}
    </Card>
  );
}
