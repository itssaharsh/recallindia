// The PDF -> feed dissolve (DESIGN.md §Signature Interaction), driven imperatively so a row in
// flight costs no React render: one requestAnimationFrame clock runs a sorted list of events
// (outlines appear, a row lifts, a row flies, the page turns), flights are Web Animations on
// transform + opacity (compositor-friendly), and landings are handed to the column in one batch
// per frame. Rows are taken in page order; a page turns only after its last row has lifted.

import type { IngestRow } from "@/lib/ingest";
import {
  FLIGHT_MS,
  LIFT_EASING,
  LIFT_MS,
  MAX_ANIMATED,
  OUTLINES_LEAD_MS,
  PAGE_SETTLE_MS,
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

type Outline = "shown" | "lifted" | "gone" | "done";
const setOutline = (el: HTMLElement | null, state: Outline) => el && (el.dataset.state = state);

/** Copy a row's pixels out of the rendered page, so the real PDF row is what lifts off. */
function snapshot(stage: StageHandle, row: IngestRow): HTMLCanvasElement | null {
  const source = stage.canvas(row.page);
  if (!source || !row.bbox || !source.width) return null;
  const sx = row.bbox.left * source.width;
  const sy = row.bbox.top * source.height;
  const sw = row.bbox.width * source.width;
  const sh = row.bbox.height * source.height;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw));
  out.height = Math.max(1, Math.round(sh));
  out.getContext("2d")?.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
  out.className = "absolute inset-0 h-full w-full";
  return out;
}

/** Start the dissolve; returns a cancel function (removes every flight, stops the clock). */
export function runDissolve(o: DissolveOptions): () => void {
  const order = o.rows
    .filter((r) => r.bbox && (r.notice || r.merged_into !== null))
    .sort((a, b) => a.page - b.page || a.row - b.row);
  const events: { at: number; run: () => void }[] = [];
  let page = order[0]?.page ?? 1;
  events.push({
    at: 0,
    run: () => {
      o.showPage(page);
      o.stage.outlines().forEach((el) => setOutline(el, "shown"));
    },
  });
  let t = OUTLINES_LEAD_MS;
  for (const row of order) {
    if (row.page !== page) {
      const next = row.page;
      t += LIFT_MS; // the page's last row finishes lifting before the page turns
      events.push({ at: t, run: () => o.showPage(next) });
      t += PAGE_SETTLE_MS;
      page = next;
    }
    const at = t;
    events.push({ at, run: () => lift(row) });
    events.push({ at: at + (o.reduce ? 0 : LIFT_MS), run: () => fly(row) });
    t += STAGGER_MS;
  }
  events.sort((a, b) => a.at - b.at);

  const slotOf = new Map<number, number>();
  let nextSlot = 0;
  let inFlight = 0;
  let landed: { row: IngestRow; el: HTMLElement | null }[] = [];
  const removals: { el: HTMLElement; frame: number }[] = [];
  const animations = new Set<Animation>();
  const lifts = new Map<number, Animation>();
  let frame = 0;
  let raf = 0;
  let cancelled = false;
  const t0 = performance.now();

  function lift(row: IngestRow) {
    const el = o.stage.outline(row.row);
    setOutline(el, "lifted");
    if (!el || o.reduce) return;
    const a = el.animate([{ transform: "none" }, { transform: "translateY(-8px) scale(1.02)" }], {
      duration: LIFT_MS,
      easing: LIFT_EASING,
      fill: "forwards",
    });
    animations.add(a);
    lifts.set(row.row, a);
  }

  /** the row has left: its outline drops back into place as an empty slot on the page */
  function vacate(row: IngestRow, el: HTMLElement | null) {
    lifts.get(row.row)?.cancel();
    lifts.delete(row.row);
    setOutline(el, "gone");
  }

  function fly(row: IngestRow) {
    const outline = o.stage.outline(row.row);
    const k = row.notice ? nextSlot++ : slotOf.get(row.merged_into ?? -1);
    if (row.notice) slotOf.set(row.row, k!);
    const from = outline?.getBoundingClientRect();
    const to = k === undefined ? null : o.column.slotRect(k);
    // reduced motion, or the cap of animated rows reached (never at a 45 ms stagger): no
    // flight, the row crossfades into the column
    if (o.reduce || inFlight >= MAX_ANIMATED || !to || !from || !from.width) {
      vacate(row, outline);
      landed.push({ row, el: null });
      return;
    }
    const { el, paper, row: content } = buildFlight(row.notice, snapshot(o.stage, row));
    Object.assign(el.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
    o.layer.append(el);
    vacate(row, outline);
    const start = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
    const flight = el.animate([{ transform: start }, { transform: "none" }], {
      duration: FLIGHT_MS,
      easing: flightEasing(),
      fill: "forwards",
    });
    // the page's pixels hand over to the structured row; a continuation line just fades out
    const fadeOut = paper.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: row.notice ? FLIGHT_MS * 0.75 : FLIGHT_MS,
      easing: "linear",
      fill: "forwards",
    });
    const fadeIn = content.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FLIGHT_MS * 0.6,
      delay: FLIGHT_MS * 0.2,
      easing: "linear",
      fill: "both",
    });
    [flight, fadeOut, fadeIn].forEach((a) => animations.add(a));
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
