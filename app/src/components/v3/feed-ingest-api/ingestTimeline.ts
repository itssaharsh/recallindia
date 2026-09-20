/**
 * The /ingest replay as a pure function of time (spec 2.6, "keep it exactly").
 *
 *   frame = ingestFrame(run, schedule, tMs, { reduced })
 *
 * `tMs` is replay time at 1×; the hook advances it by dt × speed, so 2×/4× divide every
 * duration and pause freezes every spring mid-flight. Stills for the acceptance states
 * (?state=dissolving, reading, done…) use the same function with a hand-placed schedule.
 */
import { fmtSec } from "./format";
import { clamp01, easeDraw, springAt, SPRING_FLIGHT, SPRING_SETTLE, SPRING_SNAPPY } from "./motion";
import type { IngestRowNotice, IngestRun, IngestStepKey } from "./types";

/** Per-row choreography at 1× (ms from the row's start). */
export const ROW = {
  draw: 240, fillIn: 160, cellsAt: 120, cellStagger: 15, cellFade: 120, tagAt: 140,
  liftAt: 320, liftMs: 120, flightAt: 440, veilAt: 440, veilMs: 300, checkAt: 600,
  landAt: 860, ghostFadeMs: 60, boxFadeAt: 900, boxFadeMs: 160, trailFadeMs: 200, echoLags: [60, 120] as const, done: 1100,
  /**
   * spring-flight (380/34) settles to 0.5 % in ≈ 310 ms; the spec's flight window is 420 ms
   * (440–860). The spring's clock runs at 0.74× so the same curve (bounce ≤ .06) fills the window.
   */
  flightClock: 0.74,
} as const;

/** Stage timing at 1×. */
export const STAGE = { fetchMs: 600, extractPageMs: 400, gapMs: 400, fullRows: 3, fullGap: 900, cadence: 180, everyThirdFrom: 19, diffMs: 800, publishMs: 500 } as const;

export interface Schedule {
  fetch: [number, number];
  extract: [number, number];
  normalise: [number, number];
  diff: [number, number];
  publish: [number, number];
  /** Absolute start per run.rows index (Infinity = never in this schedule). */
  rowStart: number[];
  /** Whether that row's ghost flies (the others dissolve in place). */
  flies: boolean[];
  /** A step that stops (the failed state) and when. */
  fail?: { step: IngestStepKey; at: number } | null;
  end: number;
}

export type StepStatus = "pending" | "running" | "done" | "failed";

export interface StepFrame {
  key: IngestStepKey;
  label: string;
  status: StepStatus;
  sub: string;
  /** Done-disc pop, 0 → 1 (scale .6 → 1) */
  pop: number;
  /** Fill of the connector to the right of this step, 0 → 1 */
  connector: number;
  /** Polite announcement once done, e.g. "Extract tables done, 57 rows" */
  announce: string;
}

export interface RowFrame {
  index: number;
  row: number;
  page: number;
  /** Perimeter drawn, 0 → 1 */
  box: number;
  boxOpacity: number;
  fill: number;
  cells: number[];
  tag: { opacity: number; y: number };
  veil: number;
  check: { opacity: number; scale: number };
}

export interface FlightFrame {
  index: number;
  row: number;
  /** false once landed (only the trail is still fading) */
  ghost: boolean;
  /** 1 → 0 over the last 60 ms before landing, as the slot takes over */
  ghostOpacity: number;
  lift: number;
  progress: number;
  echoes: { progress: number; opacity: number }[];
  trailOpacity: number;
  notice: IngestRowNotice;
  cells: string[];
}

export interface SlotFrame {
  index: number;
  row: number;
  label: string;
  /** Height factor 0 → 1 (50 px) */
  open: number;
}

export interface LandedFrame {
  index: number;
  row: number;
  notice: IngestRowNotice;
  agoMs: number;
  opacity: number;
  scale: number;
  diff: "new" | "changed" | "unchanged";
  /** Diff chip opacity during the Diff step */
  diffChip: number;
}

export interface IngestFrame {
  t: number;
  stage: "fetch" | "extract" | "normalise" | "diff" | "publish" | "done" | "failed";
  steps: StepFrame[];
  /** What the desk follows: a row (normalise) or a page top (extract). */
  focus: { page: number; rowIndex: number | null };
  pagesDone: number;
  scan: { page: number; y: number } | null;
  rowsRead: number;
  rows: RowFrame[];
  flights: FlightFrame[];
  slots: SlotFrame[];
  /** Newest first */
  landed: LandedFrame[];
  count: number;
  processed: number;
  done: boolean;
}

/* ------------------------------------------------------------ schedules */

export function replaySchedule(run: IngestRun): Schedule {
  const fetch: [number, number] = [0, STAGE.fetchMs];
  const extract: [number, number] = [fetch[1], fetch[1] + STAGE.extractPageMs * run.pages];
  const n0 = extract[1] + STAGE.gapMs;
  const rowStart = run.rows.map((_, i) =>
    n0 + (i < STAGE.fullRows ? i * STAGE.fullGap : (STAGE.fullRows - 1) * STAGE.fullGap + (i - (STAGE.fullRows - 1)) * STAGE.cadence),
  );
  const flies = run.rows.map((r, i) => !!r.notice && (i < STAGE.everyThirdFrom || (i - STAGE.everyThirdFrom) % 3 === 0));
  const normalise: [number, number] = [n0, Math.max(...rowStart) + ROW.done];
  const diff: [number, number] = [normalise[1], normalise[1] + STAGE.diffMs];
  const publish: [number, number] = [diff[1], diff[1] + STAGE.publishMs];
  return { fetch, extract, normalise, diff, publish, rowStart, flies, end: publish[1] };
}

export type IngestStill = "empty" | "step1" | "step2" | "step3" | "step4" | "step5" | "reading" | "dissolving" | "done" | "failed-extract";

/**
 * Acceptance stills. "reading" / "dissolving" / "step3" reproduce ingest-1536.png: rows 1–8 have
 * landed (row 8 is "New", row 7 0.4 s ago …), row 9 is boxed (reading) or mid-flight (dissolving).
 */
export function ingestStill(run: IngestRun, still: IngestStill, opts: { reduced?: boolean } = {}): IngestFrame {
  const s = replaySchedule(run);
  const at = (t: number, sched = s) => ingestFrame(run, sched, t, opts);
  switch (still) {
    case "step1":
      return at(s.fetch[0] + 300);
    case "empty":
    case "step2":
      return at(s.extract[0] + STAGE.extractPageMs * 2.5);
    case "step4":
      return at(s.diff[0] + 400);
    case "step5":
      return at(s.publish[0] + 250);
    case "done":
      return at(s.end + 1);
    case "failed-extract": {
      const failAt = s.extract[0] + STAGE.extractPageMs * 1.5;
      return at(failAt + 1, { ...s, fail: { step: "extract", at: failAt } });
    }
    case "reading":
    case "dissolving":
    case "step3": {
      const k = 8; // row 9
      const T = 100_000;
      // 545 ms: progress ≈ .48, the card face is complete and the ghost stays clear of the notices pane (ingest-1536.png)
      const local = still === "reading" ? 280 : 545;
      const rowStart = run.rows.map((_, i) => {
        if (i > k) return Infinity;
        if (i === k) return T - local;
        const landedAgo = i === k - 1 ? 250 : 400 * (k - 1 - i);
        return T - landedAgo - ROW.landAt;
      });
      const flies = run.rows.map((r) => !!r.notice);
      const sched: Schedule = {
        ...s,
        fetch: [T - 40_000, T - 39_400],
        extract: [T - 39_400, T - 39_400 + STAGE.extractPageMs * run.pages],
        normalise: [T - 20_000, T + 60_000],
        diff: [T + 60_000, T + 60_800],
        publish: [T + 60_800, T + 61_300],
        rowStart,
        flies,
        end: T + 61_300,
      };
      return at(T, sched);
    }
  }
}

/* ---------------------------------------------------------------- frame */

const stepLabels: Record<IngestStepKey, string> = { fetch: "Fetch PDF", extract: "Extract tables", normalise: "Normalise", diff: "Diff vs last run", publish: "Publish" };
const ORDER: IngestStepKey[] = ["fetch", "extract", "normalise", "diff", "publish"];

export function ingestFrame(run: IngestRun, s: Schedule, t: number, { reduced = false }: { reduced?: boolean } = {}): IngestFrame {
  const failedAt = s.fail && t >= s.fail.at ? s.fail : null;
  const tt = failedAt ? Math.min(t, failedAt.at) : t;
  const ms = (k: IngestStepKey) => run.steps.find((x) => x.key === k)?.ms ?? 0;
  const label = (k: IngestStepKey) => run.steps.find((x) => x.key === k)?.label ?? stepLabels[k];

  /* rows */
  const rows: RowFrame[] = [];
  const flights: FlightFrame[] = [];
  const slots: SlotFrame[] = [];
  const landed: LandedFrame[] = [];
  let processed = 0;
  const inFlight = run.rows.reduce((n, _, i) => {
    const l = tt - s.rowStart[i];
    return n + (s.flies[i] && !reduced && l >= ROW.liftAt && l < ROW.landAt ? 1 : 0);
  }, 0);

  run.rows.forEach((r, i) => {
    const local = tt - s.rowStart[i];
    if (!(local >= 0)) return;
    const flies = s.flies[i] && !reduced && !!r.notice;
    const box = reduced ? 1 : easeDraw(clamp01(local / ROW.draw));
    const boxIn = reduced ? clamp01(local / 150) : 1;
    const boxOut = 1 - clamp01((local - ROW.boxFadeAt) / ROW.boxFadeMs);
    const tagSpring = springAt((local - ROW.tagAt) / 1000, SPRING_SNAPPY);
    rows.push({
      index: i,
      row: r.row,
      page: r.page,
      box,
      boxOpacity: boxIn * boxOut,
      fill: (reduced ? boxIn : clamp01(local / ROW.fillIn)) * boxOut,
      cells: Array.from({ length: 8 }, (_, c) => (reduced ? boxIn : clamp01((local - ROW.cellsAt - c * ROW.cellStagger) / ROW.cellFade)) * boxOut),
      tag: reduced ? { opacity: 0, y: 0 } : { opacity: clamp01((local - ROW.tagAt) / 100) * boxOut, y: -6 * (1 - tagSpring) },
      veil: 0.8 * clamp01((local - ROW.veilAt) / (reduced ? 200 : ROW.veilMs)),
      check: { opacity: clamp01((local - ROW.checkAt) / 120), scale: reduced ? 1 : 0.6 + 0.4 * springAt((local - ROW.checkAt) / 1000, SPRING_SNAPPY) },
    });
    if (local >= ROW.landAt) processed++;

    if (!r.notice) return;
    if (flies && local >= ROW.liftAt && local < ROW.landAt + ROW.trailFadeMs) {
      const ghost = local < ROW.landAt;
      const flightAt = (ms: number) => springAt(((ms - ROW.flightAt) / 1000) * ROW.flightClock, SPRING_FLIGHT);
      const progress = ghost ? flightAt(local) : 1;
      const echoFade = 1 - clamp01((local - 700) / 160);
      flights.push({
        index: i,
        row: r.row,
        ghost,
        ghostOpacity: 1 - clamp01((local - (ROW.landAt - ROW.ghostFadeMs)) / ROW.ghostFadeMs),
        lift: clamp01((local - ROW.liftAt) / ROW.liftMs),
        progress,
        echoes:
          ghost && inFlight < 2
            ? ROW.echoLags.map((lag, e) => ({ progress: flightAt(local - lag), opacity: (e === 0 ? 0.38 : 0.18) * echoFade }))
            : [],
        trailOpacity: ghost ? 1 : 1 - clamp01((local - ROW.landAt) / ROW.trailFadeMs),
        notice: r.notice,
        cells: r.cells ?? [],
      });
    }
    if (flies && local >= ROW.liftAt && local < ROW.landAt) {
      const words = r.notice.product.split(" ");
      slots.push({
        index: i,
        row: r.row,
        label: `Landing: ${words.slice(0, 3).join(" ")}…`,
        open: springAt((local - ROW.liftAt) / 1000, SPRING_SNAPPY),
      });
    }
    if (local >= ROW.landAt) {
      const since = local - ROW.landAt;
      landed.push({
        index: i,
        row: r.row,
        notice: r.notice,
        agoMs: since,
        opacity: flies ? 1 : clamp01(since / (reduced ? 200 : 160)),
        scale: flies ? 1.02 - 0.02 * springAt(since / 1000, SPRING_SETTLE) : 1,
        diff: r.notice.diff ?? (run.diff.existing === 0 && run.diff.updated === 0 ? "new" : run.diff.new === 0 && run.diff.updated === 0 ? "unchanged" : "new"),
        diffChip: 0,
      });
    }
  });
  landed.sort((a, b) => a.agoMs - b.agoMs || b.index - a.index);
  slots.sort((a, b) => b.index - a.index);
  const diffOut = 1 - clamp01((tt - s.publish[0]) / 200);
  landed.forEach((l, k) => {
    if (k < 20) l.diffChip = clamp01((tt - s.diff[0] - k * 30) / 160) * diffOut;
  });

  /* stages and steps */
  const stageOf = (): IngestFrame["stage"] => {
    if (failedAt) return "failed";
    if (tt < s.fetch[1]) return "fetch";
    if (tt < s.extract[1]) return "extract";
    if (tt < s.normalise[1]) return "normalise";
    if (tt < s.diff[1]) return "diff";
    if (tt < s.publish[1]) return "publish";
    return "done";
  };
  const stage = stageOf();
  const bounds: Record<IngestStepKey, [number, number]> = { fetch: s.fetch, extract: s.extract, normalise: s.normalise, diff: s.diff, publish: s.publish };
  const pageNow = Math.min(run.pages, Math.max(1, Math.floor((tt - s.extract[0]) / STAGE.extractPageMs) + 1));
  const rowsIn = run.rows_in;

  const steps: StepFrame[] = ORDER.map((key) => {
    const [a, b] = bounds[key];
    let status: StepStatus = tt < a ? "pending" : tt < b ? "running" : "done";
    if (failedAt) {
      const fi = ORDER.indexOf(failedAt.step), ki = ORDER.indexOf(key);
      status = ki < fi ? "done" : ki === fi ? "failed" : "pending";
    }
    const sec = fmtSec(ms(key));
    const subs: Record<IngestStepKey, Record<"running" | "done", string>> = {
      fetch: { running: run.pdf_kb ? `Downloading · ${run.pdf_kb} KB` : "Downloading", done: `${sec} s · ${run.pages} pages` },
      extract: { running: `Textract TABLES · page ${pageNow} of ${run.pages}`, done: `${sec} s · Textract TABLES · ${rowsIn} rows` },
      normalise: {
        running: `${fmtSec((processed / rowsIn) * ms("normalise"))} s · row ${Math.min(rowsIn, processed + 1)} of ${rowsIn}`,
        done: `${sec} s · ${run.notices_out} notices from ${rowsIn} rows`,
      },
      diff: { running: `Comparing ${run.notices_out} notices`, done: `${run.diff.new} new · ${run.diff.updated} changed · ${run.diff.existing} unchanged` },
      publish: { running: "Writing to the feed", done: run.diff.new + run.diff.updated > 0 ? `${sec} s · ${run.diff.new + run.diff.updated} new in the feed` : "Nothing new to publish" },
    };
    const sub =
      status === "pending" ? "Waiting" : status === "failed" ? (run.error?.reason ? `Stopped: ${run.error.reason}` : "Stopped") : subs[key][status];
    const doneFor = tt - b;
    const announceExtra = key === "extract" ? `, ${rowsIn} rows` : key === "normalise" ? `, ${run.notices_out} notices` : "";
    return {
      key,
      label: label(key),
      status,
      sub,
      pop: status === "done" ? (reduced ? 1 : springAt(doneFor / 1000, SPRING_SNAPPY)) : 0,
      connector: status === "done" ? (reduced ? 1 : easeDraw(clamp01(doneFor / 300))) : 0,
      announce: status === "done" ? `${label(key)} done${announceExtra}` : status === "failed" ? `${label(key)} stopped` : "",
    };
  });

  /* desk focus, scan line, pips */
  let focus: IngestFrame["focus"] = { page: 1, rowIndex: null };
  let scan: IngestFrame["scan"] = null;
  if (stage === "extract" || (failedAt && failedAt.step === "extract")) {
    focus = { page: pageNow, rowIndex: null };
    if (!failedAt) scan = { page: pageNow, y: clamp01(((tt - s.extract[0]) % STAGE.extractPageMs) / STAGE.extractPageMs) };
  } else if (stage !== "fetch") {
    let fi = 0;
    run.rows.forEach((_, i) => {
      if (s.rowStart[i] - 360 <= tt) fi = i;
    });
    focus = { page: run.rows[fi]?.page ?? 1, rowIndex: fi };
  }
  let pagesDone = 0;
  for (let p = 1; p <= run.pages; p++) {
    const onPage = run.rows.map((r, i) => (r.page === p ? i : -1)).filter((i) => i >= 0);
    if (onPage.length && onPage.every((i) => tt - s.rowStart[i] >= ROW.landAt)) pagesDone = p;
    else break;
  }
  const rowsRead =
    tt >= s.extract[1]
      ? rowsIn
      : tt < s.extract[0]
        ? 0
        : run.rows.filter((r) => r.page < Math.floor((tt - s.extract[0]) / STAGE.extractPageMs) + 1).length;

  return {
    t,
    stage,
    steps,
    focus,
    pagesDone,
    scan,
    rowsRead,
    rows,
    flights,
    slots,
    landed,
    count: landed.length,
    processed,
    done: stage === "done",
  };
}

/** Total recorded time, e.g. 27.1 s end to end. */
export const recordedTotalMs = (run: IngestRun): number => run.steps.reduce((a, s) => a + s.ms, 0);
