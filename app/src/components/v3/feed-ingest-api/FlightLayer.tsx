"use client";
import * as React from "react";
import { DESKTOP, useMediaQuery } from "./hooks";
import type { FlightFrame, IngestFrame } from "./ingestTimeline";
import { clamp01, lerp } from "./motion";
import { IdChip, SourceChip } from "./primitives";
import { monthLabel } from "./format";

interface Pt {
  x: number;
  y: number;
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}
interface Geo {
  f: FlightFrame;
  ghost: (Box & { scale: number; card: number; opacity: number }) | null;
  echoes: (Box & { opacity: number })[];
  trail: { d: string; end: Pt; opacity: number } | null;
}

const lp = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
function bezier([p0, p1, p2, p3]: Pt[], t: number): Pt {
  const a = lp(p0, p1, t), b = lp(p1, p2, t), c = lp(p2, p3, t);
  return lp(lp(a, b, t), lp(b, c, t), t);
}
/** First part of a cubic split at t (de Casteljau), for the trail drawn up to the ghost. */
function splitAt([p0, p1, p2, p3]: Pt[], t: number): Pt[] {
  const a = lp(p0, p1, t), b = lp(p1, p2, t), c = lp(p2, p3, t);
  const ab = lp(a, b, t), bc = lp(b, c, t);
  return [p0, a, ab, lp(ab, bc, t)];
}
/**
 * Curve that bows upward: control points at 15 % and 70 % of dx, 25 % of |dy| above the start.
 * A downward flight (390: viewer → list below) gets no lift, so the ghost dives below the row
 * instead of crossing the table header (critique #2).
 */
function curve(a: Pt, b: Pt): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lift = dy < 0 ? 0.25 * -dy : 0;
  return [a, { x: a.x + 0.15 * dx, y: a.y - lift }, { x: a.x + 0.7 * dx, y: a.y - lift }, b];
}
/**
 * Content cross-fade, table snapshot → notice card, on flight progress. The spec says 35–60 %;
 * it runs 30–48 % so a paused mid-flight frame (≈ 48 %, where the ghost is still clear of the
 * notices pane) shows the finished card, not a double exposure. See README "Deviations".
 */
const CARD_FADE = [0.3, 0.48] as const;
/** Size keyframes on progress: row rect → notice card (35–60 %) → slot rect. */
const morph = (p: number, row: number, card: number, slot: number) => (p <= 0.35 ? lerp(row, card, p / 0.35) : p <= 0.6 ? card : lerp(card, slot, (p - 0.6) / 0.4));

/**
 * The ghosts in flight (spec 2.6): absolutely positioned over the workspace, measured from the
 * row box on the PDF and the LandingSlot in the list, so it works over pdf.js and the stand-in.
 * Renders nothing under reduced motion (the timeline emits no flights).
 */
export function FlightLayer({
  frame, workspace, month, layoutKey = 0,
}: {
  frame: IngestFrame;
  workspace: React.RefObject<HTMLElement | null>;
  month: string;
  /** Bumped by PdfStage.onLayout when row boxes move (stand-in measured, fonts loaded, resize). */
  layoutKey?: number;
}) {
  const desktop = useMediaQuery(DESKTOP, true);
  const [geo, setGeo] = React.useState<Geo[]>([]);
  const [resized, setResized] = React.useState(0);
  React.useEffect(() => {
    const on = () => setResized((n) => n + 1);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  React.useLayoutEffect(() => {
    const ws = workspace.current;
    if (!ws) return;
    if (!frame.flights.length) {
      setGeo((g) => (g.length ? [] : g));
      return;
    }
    const W = ws.getBoundingClientRect();
    const rel = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - W.left, y: r.top - W.top, w: r.width, h: r.height };
    };
    const cardW = desktop ? 352 : 290, cardH = desktop ? 96 : 84;
    const out: Geo[] = [];
    const desk = rel(ws.querySelector("[data-ingest-desk]"));
    for (const f of frame.flights) {
      let row = rel(ws.querySelector(`[data-ingest-box="${f.row}"]`));
      if (row && desk) {
        // start from the part of the row the desk actually shows (the page is wider than the desk at 390)
        const x0 = Math.max(row.x, desk.x), x1 = Math.min(row.x + row.w, desk.x + desk.w);
        const y0 = Math.max(row.y, desk.y), y1 = Math.min(row.y + row.h, desk.y + desk.h);
        if (x1 > x0 && y1 > y0) row = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      const slot = rel(ws.querySelector(`[data-ingest-slot="${f.row}"]`) ?? ws.querySelector(`[data-ingest-landed="${f.row}"]`));
      if (!row || !slot) continue;
      const c0 = { x: row.x + row.w / 2, y: row.y + row.h / 2 };
      const c3 = { x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 };
      const path = curve(c0, c3);
      const boxAt = (p: number): Box => {
        const c = bezier(path, p);
        return { x: c.x, y: c.y, w: morph(p, row.w, cardW, slot.w), h: morph(p, row.h, cardH, slot.h), rot: -2.5 * Math.sin(Math.PI * p) };
      };
      const trailPath = desktop ? curve({ x: row.x + row.w, y: c0.y }, { x: slot.x, y: c3.y }) : null;
      const drawn = trailPath ? splitAt(trailPath, clamp01(f.progress)) : null;
      out.push({
        f,
        ghost: f.ghost ? { ...boxAt(f.progress), scale: 1 + 0.02 * f.lift, card: clamp01((f.progress - CARD_FADE[0]) / (CARD_FADE[1] - CARD_FADE[0])), opacity: f.ghostOpacity } : null,
        echoes: f.echoes.slice(0, desktop ? 2 : 1).map((e) => ({ ...boxAt(e.progress), opacity: e.opacity })),
        trail:
          drawn && trailPath
            ? {
                d: `M${drawn[0].x} ${drawn[0].y}C${drawn[1].x} ${drawn[1].y},${drawn[2].x} ${drawn[2].y},${drawn[3].x} ${drawn[3].y}`,
                end: trailPath[3],
                opacity: f.trailOpacity,
              }
            : null,
      });
    }
    setGeo(out);
  }, [frame, workspace, desktop, layoutKey, resized]);

  if (!geo.length) return null;
  const place = (b: Box, scale = 1): React.CSSProperties => ({
    width: b.w,
    height: b.h,
    transform: `translate(${b.x - b.w / 2}px, ${b.y - b.h / 2}px) rotate(${b.rot}deg) scale(${scale})`,
  });

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[4] overflow-clip">
      <svg className="absolute inset-0 size-full overflow-visible">
        {geo.map(
          (g) =>
            g.trail && (
              <g key={`t${g.f.row}`} opacity={g.trail.opacity}>
                <path d={g.trail.d} fill="none" stroke="var(--color-cobalt)" strokeWidth={2} strokeDasharray="5 6" strokeLinecap="round" />
                <circle cx={g.trail.end.x} cy={g.trail.end.y} r={4} fill="var(--color-cobalt)" />
              </g>
            ),
        )}
      </svg>
      {geo.map((g) => (
        <React.Fragment key={g.f.row}>
          {g.echoes.map((e, k) => (
            <span key={k} className="absolute top-0 left-0 block rounded-[12px] border-[1.5px] border-dashed border-cobalt" style={{ ...place(e), opacity: e.opacity }} />
          ))}
          {g.ghost && (
            <div
              className="absolute top-0 left-0 overflow-hidden rounded-[12px] border-[1.5px] border-cobalt bg-surface-1"
              style={{ ...place(g.ghost, g.ghost.scale), opacity: g.ghost.opacity, boxShadow: g.f.lift > 0.5 ? "var(--shadow-ghost)" : "var(--shadow-1)" }}
            >
              <div className="fia-pdf-standin absolute inset-0 flex text-[10.5px] leading-[1.28] text-ink" style={{ opacity: 1 - g.ghost.card }}>
                {g.f.cells.map((c, k) => (
                  <span key={k} className="min-w-0 overflow-hidden border-r border-line px-1 py-1 whitespace-nowrap" style={{ flex: `0 0 ${[4, 17, 9, 6, 6, 27, 21, 10][k] ?? 10}%` }}>
                    {c}
                  </span>
                ))}
              </div>
              <div className="absolute inset-0 px-3 py-2.5 lg:px-3.5 lg:py-3" style={{ opacity: g.ghost.card }}>
                <div className="flex items-center gap-2">
                  <SourceChip source="cdsco_nsq" />
                  <span className="text-[12.5px] leading-none font-medium whitespace-nowrap text-ink-muted">
                    {monthLabel(month).long} · row {g.f.row}
                  </span>
                </div>
                <b className="mt-1.5 block truncate text-[14px] leading-[1.25] font-semibold text-ink lg:mt-2 lg:text-[15px]">{g.f.notice.product}</b>
                <div className="mt-1.5 flex items-center gap-2 text-[12px] leading-[1.2] text-ink-muted lg:mt-2 lg:text-[13px]">
                  {g.f.notice.batch && <IdChip size="sm">{g.f.notice.batch}</IdChip>}
                  <span className="min-w-0 truncate">{g.f.notice.test}</span>
                </div>
              </div>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
