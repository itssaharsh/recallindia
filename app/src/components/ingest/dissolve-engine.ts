// The PDF -> feed dissolve (DESIGN.md §Signature Interaction), driven imperatively so a row in
// flight costs no React render: one requestAnimationFrame clock runs a sorted list of events
// (outlines appear, a row lifts, a row flies, the page turns), flights are Web Animations on
// transform + opacity (compositor-friendly), and landings are handed to the column in one batch
// per frame. Rows are taken in page order; a page turns only after its last row has lifted.

import type { IngestRow } from "@/lib/ingest";
import {
  FLIGHT_MS,
  LIFT_MS,
  MAX_ANIMATED,
  OUTLINES_LEAD_MS,
  PAGE_SETTLE_MS,
  ROW_H,
  STAGGER_MS,
  flightEasing,
} from "@/lib/ingest-motion";

import type { ColumnHandle, Landing } from "./dissolve-column";
import type { StageHandle } from "./pdf-stage";
import { buildFlight } from "./row-markup";

export interface DissolveOptions {
  rows: IngestRow[];
  stage: StageHandle;
  column: ColumnHandle;
  /** a fixed, pointer-events-none layer over the page that flights are appended to */
  layer: HTMLElement;
  showPage: (page: number) => void;
  reduce: boolean;
  onDone: () => void;
}

type Outline = "shown" | "gone" | "done";
const setOutline = (el: HTMLElement | null, state: Outline) => el && (el.dataset.state = state);

/**
 * The row's own pixels: its region of the page image, fitted to the flight's box (`size`). The
 * flight is then scaled onto the lifted row, so at take-off the crop sits exactly over the row.
 */
function crop(stage: StageHandle, row: IngestRow, size: DOMRect): Partial<CSSStyleDeclaration> | null {
  const url = stage.pageImage(row.page);
  if (!url || !row.bbox || !row.bbox.width || !row.bbox.height) return null;
  const w = size.width / row.bbox.width;
  const h = size.height / row.bbox.height;
  return {
    backgroundImage: `url(${url})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${w}px ${h}px`,
    backgroundPosition: `${-row.bbox.left * w}px ${-row.bbox.top * h}px`,
  };
}

/** Start the dissolve; returns a cancel function (removes every flight, stops the clock). */
export function runDissolve(o: DissolveOptions): () => void {
  const order = o.rows
    .filter((r) => r.bbox && (r.notice || r.merged_into !== null))
    .sort((a, b) => a.page - b.page || a.row - b.row);
  const events: { at: number; run: () => void }[] = [];
  const first = order[0]?.page ?? 1;
  let page = first; // advanced by the loop below: the first event must not read it later
  events.push({
    at: 0,
    run: () => {
      o.showPage(first);
      o.stage.outlines().forEach((el) => setOutline(el, "shown"));
      measure();
    },
  });
  let t = OUTLINES_LEAD_MS;
  for (const row of order) {
    if (row.page !== page) {
      const next = row.page;
      t += LIFT_MS; // the page's last row has lifted off before the page turns
      events.push({ at: t, run: () => o.showPage(next) });
      t += PAGE_SETTLE_MS;
      page = next;
    }
    const at = t;
    events.push({ at, run: () => launch(row) });
    t += STAGGER_MS;
  }
  events.sort((a, b) => a.at - b.at);

  const slotOf = new Map<number, number>();
  let nextSlot = 0;
  let inFlight = 0;
  let landed: { row: IngestRow; el: HTMLElement | null }[] = [];
  const removals: { el: HTMLElement; frame: number }[] = [];
  const animations = new Set<Animation>();
  let frame = 0;
  let raf = 0;
  let cancelled = false;
  const t0 = performance.now();
  // Geometry is measured once: every page sits in the same box and the column does not move while
  // rows land, so a flight never forces a layout (a getBoundingClientRect per flight after DOM
  // changes cost ~2 synchronous layouts per row at 4x CPU).
  let geometry: { page: DOMRect; list: DOMRect; visible: number } | null = null;
  const measure = () => {
    const pageBox = o.stage.pageRect();
    const col = o.column.measure();
    geometry = pageBox && col ? { page: pageBox, list: col.box, visible: col.visible } : null;
  };

  /** where a row sits on the page, on screen */
  function rowRect(row: IngestRow): DOMRect | null {
    if (!geometry || !row.bbox) return null;
    const { page } = geometry;
    return new DOMRect(
      page.left + row.bbox.left * page.width,
      page.top + row.bbox.top * page.height,
      row.bbox.width * page.width,
      row.bbox.height * page.height,
    );
  }
  function slot(k: number): DOMRect | null {
    if (!geometry) return null;
    const { list, visible } = geometry;
    return new DOMRect(list.left, list.top + Math.min(k, visible - 1) * ROW_H, list.width, ROW_H);
  }
  /** translateY -8px, scale 1.02 about the centre */
  const lifted = (r: DOMRect) =>
    new DOMRect(r.left - r.width * 0.01, r.top - r.height * 0.01 - 8, r.width * 1.02, r.height * 1.02);
  /** the transform that puts an element laid out at `to` over `from` */
  const over = (from: DOMRect, to: DOMRect) =>
    `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;

  /**
   * One row, one element, one animation: the flight is laid out at its feed slot but starts
   * transformed exactly over the row (its pixels are a crop of the page), lifts off (120 ms,
   * -8px, x1.02) and springs to the slot (300 ms). The outline under it becomes an empty slot.
   */
  function launch(row: IngestRow) {
    const outline = o.stage.outline(row.row);
    const k = row.notice ? nextSlot++ : slotOf.get(row.merged_into ?? -1);
    if (row.notice) slotOf.set(row.row, k!);
    const from = rowRect(row);
    const to = k === undefined ? null : slot(k);
    setOutline(outline, "gone");
    // reduced motion, or the cap of animated rows reached (never at a 45 ms stagger): no
    // flight, the row crossfades into the column
    if (o.reduce || inFlight >= MAX_ANIMATED || !to || !from || !from.width) {
      landed.push({ row, el: null });
      return;
    }
    const { el, paper } = buildFlight(row.notice, crop(o.stage, row, to));
    Object.assign(el.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
    o.layer.append(el);
    const total = LIFT_MS + FLIGHT_MS;
    // three keyframes with linear interpolation and ONE effect-level easing (lift, then spring):
    // effect-level linear() runs on the compositor, per-keyframe linear() measured as not
    const flight = el.animate(
      [
        { transform: over(from, to), offset: 0 },
        { transform: over(lifted(from), to), offset: LIFT_MS / total },
        { transform: "none", offset: 1 },
      ],
      { duration: total, easing: flightEasing(), fill: "forwards" },
    );
    // the page's pixels fade off the structured row beneath them (a continuation line has no row
    // beneath: it just fades out). One opacity animation: every animated child is a layer.
    const fadeOut = paper.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FLIGHT_MS * 0.8,
      delay: LIFT_MS + (row.notice ? FLIGHT_MS * 0.1 : 0),
      easing: "linear",
      fill: "both",
    });
    [flight, fadeOut].forEach((a) => animations.add(a));
    inFlight++;
    flight.onfinish = () => {
      inFlight--;
      landed.push({ row, el });
    };
  }

  function flushLandings() {
    if (!landed.length) return;
    const batch: Landing[] = [];
    let merged = 0;
    for (const { row, el } of landed) {
      if (row.notice) batch.push({ row: row.row, notice: row.notice });
      else merged++;
      // keep the flight on screen until React has committed the landed row under it
      if (el) removals.push({ el, frame: frame + 2 });
    }
    landed = [];
    if (batch.length) o.column.land(batch);
    if (merged) o.column.merged(merged);
  }

  function tick(now: number) {
    if (cancelled) return;
    frame++;
    const elapsed = now - t0;
    while (events.length && events[0].at <= elapsed) events.shift()!.run();
    flushLandings();
    for (let i = removals.length - 1; i >= 0; i--) {
      if (removals[i].frame <= frame) {
        removals[i].el.remove();
        removals.splice(i, 1);
      }
    }
    if (events.length || inFlight > 0 || landed.length || removals.length) {
      raf = requestAnimationFrame(tick);
      return;
    }
    animations.clear();
    // the page is whole again: the rows are data now, the outlines stay to show what was read
    o.stage.outlines().forEach((el) => setOutline(el, "done"));
    o.onDone();
  }
  raf = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    animations.forEach((a) => a.cancel());
    o.layer.replaceChildren();
  };
}
