"use client";
import * as React from "react";
import { animate, useReducedMotion } from "framer-motion";
import { Check, FileText } from "lucide-react";
import { cn } from "../ui";
import type { IngestFrame, RowFrame } from "./ingestTimeline";
import { EASE_PAGE } from "./motion";
import type { IngestBBox, IngestRun } from "./types";

/* ------------------------------------------------------------------ stage */

const StageContext = React.createContext<{ relayout: () => void }>({ relayout: () => undefined });

export interface PdfStageProps {
  /** Toolbar file name, e.g. "cdsco-nsq-june-2025.pdf" */
  fileName: string;
  pages: number;
  frame: IngestFrame;
  /** Auto-scroll to the row being read (360 ms ease-page). Off → the desk stays where the user put it. */
  follow?: boolean;
  /** Called when a page's row boxes are (re)measured, so the flight layer can re-measure too. */
  onLayout?: () => void;
  /**
   * The existing react-pdf viewer, unchanged. Put a <PageOverlay page={n} …/> inside each <Page>
   * (react-pdf pages are position:relative). Or <PdfStandIn/> for /kit and the video.
   */
  children: React.ReactNode;
  className?: string;
}

/**
 * Toolbar (file, page pips, "Page p of 6", "Textract · TABLES") + the desk (spec 2.4).
 * 1010 × 528 at 1536; 358 × 300 at 390 with the page zoomed to .70 and pannable.
 */
export function PdfStage({ fileName, pages, frame, follow = true, onLayout, children, className }: PdfStageProps) {
  const desk = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const [layoutTick, setLayoutTick] = React.useState(0);
  const [userHold, setUserHold] = React.useState(false);
  const holdTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollRaf = React.useRef(0);
  const onLayoutRef = React.useRef(onLayout);
  onLayoutRef.current = onLayout;
  const ctx = React.useMemo(
    () => ({
      relayout: () => {
        setLayoutTick((n) => n + 1);
        onLayoutRef.current?.();
      },
    }),
    [],
  );

  const hold = () => {
    if (!follow) return;
    setUserHold(true);
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setUserHold(false), 4000);
  };
  React.useEffect(() => () => clearTimeout(holdTimer.current), []);

  const { page, rowIndex } = frame.focus;
  React.useEffect(() => {
    const el = desk.current;
    if (!el || !follow || userHold) return;
    const target = el.querySelector<HTMLElement>(rowIndex != null ? `[data-ingest-anchor="${rowIndex}"]` : `[data-ingest-page="${page}"]`);
    if (!target) return;
    const d = el.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const rel = r.top - d.top;
    if (rowIndex != null && rel >= 0 && rel + r.height <= d.height * 0.65) return;
    const to = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + rel - (rowIndex != null ? d.height * 0.35 : 12)));
    if (reduced) {
      el.scrollTop = to;
      return;
    }
    const controls = animate(el.scrollTop, to, { duration: 0.36, ease: EASE_PAGE, onUpdate: (v) => (el.scrollTop = v) });
    return () => controls.stop();
  }, [page, rowIndex, follow, userHold, layoutTick, reduced]);

  return (
    <section aria-label="The PDF being read" className={cn("flex min-w-0 flex-col overflow-hidden rounded-md border border-line bg-desk", className)}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface-1 px-3 text-[13.5px] leading-none font-medium text-ink-muted lg:gap-2.5 lg:px-4">
        <FileText aria-hidden className="size-[18px] shrink-0 text-cobalt" strokeWidth={1.9} />
        <span className="max-w-[120px] truncate font-mono text-[13px] text-ink lg:max-w-none">{fileName}</span>
        <span aria-hidden className="ml-2.5 hidden gap-1 lg:flex">
          {Array.from({ length: pages }, (_, i) => {
            const p = i + 1;
            return (
              <i
                key={p}
                className={cn(
                  "block h-[18px] w-3.5 rounded-[3px]",
                  p === page ? "bg-surface-1 shadow-[inset_0_0_0_2px_var(--color-cobalt)]" : p <= frame.pagesDone ? "bg-cobalt-soft shadow-[inset_0_0_0_1.5px_var(--color-cobalt)]" : "bg-surface-1 shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]",
                )}
              />
            );
          })}
        </span>
        <span className="font-semibold whitespace-nowrap text-ink">
          Page {page} of {pages}
        </span>
        <span className="flex-1" />
        <span className="hidden rounded-pill bg-surface-2 px-2.5 py-1.5 text-[12px] font-semibold tracking-[.03em] text-ink-muted lg:inline">Textract · TABLES</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={desk}
          data-ingest-desk
          onWheel={hold}
          onTouchMove={hold}
          onScroll={() => {
            // the flight layer measures row boxes in workspace coordinates; re-measure after a scroll
            cancelAnimationFrame(scrollRaf.current);
            scrollRaf.current = requestAnimationFrame(() => onLayoutRef.current?.());
          }}
          className="absolute inset-0 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <StageContext.Provider value={ctx}>
            <div className="flex flex-col gap-3.5 px-[18px] pb-4 max-lg:[zoom:.7] lg:px-[26px]">{children}</div>
          </StageContext.Provider>
        </div>
        {follow && userHold && (
          <button
            type="button"
            onClick={() => {
              clearTimeout(holdTimer.current);
              setUserHold(false);
            }}
            className="absolute bottom-3 left-1/2 h-9 -translate-x-1/2 rounded-pill bg-surface-1 px-4 text-[14px] font-semibold text-ink shadow-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt pointer-coarse:h-11"
          >
            Follow the reader
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- overlay */

export interface PageOverlayProps {
  page: number;
  run: IngestRun;
  frame: IngestFrame;
  /** Row bboxes by run.rows index; default run.rows[i].bbox (Textract). The stand-in passes measured ones. */
  bboxes?: Record<number, IngestBBox>;
  /** Cell boxes by run.rows index; default run.rows[i].cell_bboxes. */
  cellBoxes?: Record<number, IngestBBox[]>;
}

const pct = (v: number) => `${v * 100}%`;

/**
 * Absolutely positioned over one page (never on the canvas): a box drawn round the row being
 * read, dashed Textract cells, the "Row n" flag in the left margin, then the white veil and the
 * gutter check once the row has lifted off. Also holds invisible anchors the desk scrolls to.
 */
export function PageOverlay({ page, run, frame, bboxes, cellBoxes }: PageOverlayProps) {
  const { relayout } = React.useContext(StageContext);
  const bboxOf = (i: number) => bboxes?.[i] ?? run.rows[i]?.bbox;
  const cellsOf = (i: number) => cellBoxes?.[i] ?? run.rows[i]?.cell_bboxes;
  const onPage = run.rows.map((r, i) => ({ r, i })).filter(({ r }) => r.page === page);
  const layoutKey = onPage
    .map(({ i }) => {
      const b = bboxOf(i);
      return b ? `${b.top.toFixed(4)}:${b.height.toFixed(4)}` : "-";
    })
    .join("|");
  React.useLayoutEffect(() => relayout(), [layoutKey, relayout]);

  return (
    <div data-ingest-page={page} aria-hidden className="pointer-events-none absolute inset-0 z-[1]">
      {onPage.map(({ i }) => {
        const b = bboxOf(i);
        return b ? <span key={`a${i}`} data-ingest-anchor={i} className="absolute" style={{ left: pct(b.left), top: pct(b.top), width: pct(b.width), height: pct(b.height) }} /> : null;
      })}
      {frame.rows
        .filter((rf) => rf.page === page)
        .map((rf) => {
          const b = bboxOf(rf.index);
          return b ? <RowOverlay key={rf.index} rf={rf} bbox={b} cells={cellsOf(rf.index)} /> : null;
        })}
      {frame.scan && frame.scan.page === page && <span className="absolute inset-x-0 block h-0.5 bg-cobalt/35" style={{ top: pct(frame.scan.y) }} />}
    </div>
  );
}

function RowOverlay({ rf, bbox, cells }: { rf: RowFrame; bbox: IngestBBox; cells?: IngestBBox[] }) {
  const b = rf.box;
  const edge = "absolute block bg-cobalt";
  const rel = (c: IngestBBox) => ({ left: (c.left - bbox.left) / bbox.width, top: (c.top - bbox.top) / bbox.height, width: c.width / bbox.width, height: c.height / bbox.height });
  const first = cells?.[0] ? rel(cells[0]) : null;
  return (
    <div data-ingest-box={rf.row} className="absolute" style={{ left: pct(bbox.left), top: pct(bbox.top), width: pct(bbox.width), height: pct(bbox.height) }}>
      <span className="absolute inset-0 block bg-cobalt-tint mix-blend-multiply" style={{ opacity: 0.9 * rf.fill }} />
      <span className="absolute inset-px block bg-white" style={{ opacity: rf.veil }} />
      {cells?.map((c, k) => {
        const r = rel(c);
        return (
          <span
            key={k}
            className="absolute block border border-dashed border-cobalt/55"
            style={{ left: `calc(${pct(r.left)} + 3px)`, top: 3, width: `calc(${pct(r.width)} - 6px)`, bottom: 3, opacity: rf.cells[k] ?? 0 }}
          />
        );
      })}
      <span className="absolute -inset-[3.5px] block" style={{ opacity: rf.boxOpacity }}>
        <span className={cn(edge, "inset-x-0 top-0 h-[2.5px] origin-left")} style={{ transform: `scaleX(${Math.min(1, b / 0.35)})` }} />
        <span className={cn(edge, "inset-y-0 right-0 w-[2.5px] origin-top")} style={{ transform: `scaleY(${Math.max(0, Math.min(1, (b - 0.35) / 0.15))})` }} />
        <span className={cn(edge, "inset-x-0 bottom-0 h-[2.5px] origin-right")} style={{ transform: `scaleX(${Math.max(0, Math.min(1, (b - 0.5) / 0.35))})` }} />
        <span className={cn(edge, "inset-y-0 left-0 w-[2.5px] origin-bottom")} style={{ transform: `scaleY(${Math.max(0, Math.min(1, (b - 0.85) / 0.15))})` }} />
      </span>
      <span
        className="absolute top-1/2 right-[calc(100%+3.5px)] rounded-l-[6px] bg-cobalt py-1.5 pr-1.5 pl-[7px] font-sans text-[11.5px] leading-none font-semibold whitespace-nowrap text-white"
        style={{ opacity: rf.tag.opacity, transform: `translateY(calc(-50% + ${rf.tag.y}px))` }}
      >
        Row {rf.row}
      </span>
      <span
        className="absolute top-1/2 grid size-[18px] place-items-center rounded-full bg-cobalt-soft text-cobalt"
        style={{ left: first ? pct(first.left + first.width / 2) : 17, opacity: rf.check.opacity, transform: `translate(-50%, -50%) scale(${rf.check.scale})` }}
      >
        <Check className="size-[11px]" strokeWidth={3.2} />
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- stand-in */

/**
 * HTML stand-in for the PDF pages (for /kit, Storybook and the video): the real cell text from the
 * run, drawn like the CDSCO table. It measures its own rows and cells and feeds them to PageOverlay,
 * so the overlay code path is the same one the pdf.js pages use.
 */
export function PdfStandIn({ run, frame }: { run: IngestRun; frame: IngestFrame }) {
  return (
    <>
      {Array.from({ length: run.pages }, (_, i) => (
        <StandInPage key={i} page={i + 1} run={run} frame={frame} />
      ))}
    </>
  );
}

function StandInPage({ page, run, frame }: { page: number; run: IngestRun; frame: IngestFrame }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = React.useState<{ rows: Record<number, IngestBBox>; cells: Record<number, IngestBBox[]> }>({ rows: {}, cells: {} });
  const rows = run.rows.map((r, i) => ({ r, i })).filter(({ r }) => r.page === page);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const p = el.getBoundingClientRect();
      if (!p.width || !p.height) return;
      const frac = (r: DOMRect): IngestBBox => ({ left: (r.left - p.left) / p.width, top: (r.top - p.top) / p.height, width: r.width / p.width, height: r.height / p.height });
      const out: typeof boxes = { rows: {}, cells: {} };
      el.querySelectorAll<HTMLTableRowElement>("tr[data-row-index]").forEach((tr) => {
        const i = Number(tr.dataset.rowIndex);
        out.rows[i] = frac(tr.getBoundingClientRect());
        out.cells[i] = [...tr.cells].map((td) => frac(td.getBoundingClientRect()));
      });
      setBoxes(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="fia-pdf-standin relative shrink-0 bg-white px-[30px] pt-[26px] pb-2.5 shadow-page max-lg:w-[956px]">
      {page === 1 && <p className="fia-title">{run.title}</p>}
      <table>
        <colgroup>
          {Array.from({ length: 8 }, (_, k) => (
            <col key={k} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {run.header.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ r, i }) => (
            <tr key={i} data-row-index={i}>
              {Array.from({ length: 8 }, (_, k) => (
                <td key={k}>{r.cells?.[k] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fia-foot">
        Page {page} of {run.pages}
      </p>
      <PageOverlay page={page} run={run} frame={frame} bboxes={boxes.rows} cellBoxes={boxes.cells} />
    </div>
  );
}
