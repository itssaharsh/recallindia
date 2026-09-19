// The /ingest page's data: API shapes (backend/api/ingest_api.py) and the one "play state" the
// page renders, derived either from a live run's status polls or from a stored run replayed on a
// clock. Live and replay go through the same components, so a replay looks like the run did.

import type { StepState } from "./types";

export type IngestStepName = "Fetch" | "Extract" | "Normalise" | "Diff" | "Publish";
export const INGEST_STEPS: IngestStepName[] = ["Fetch", "Extract", "Normalise", "Diff", "Publish"];
export const STEP_LABEL: Record<IngestStepName, string> = {
  Fetch: "Fetch PDF",
  Extract: "Extract tables",
  Normalise: "Normalise",
  Diff: "Diff vs last run",
  Publish: "Publish",
};

/** The small per-step fields the API keeps (SUMMARY_KEYS in ingest_api.py). */
export interface StepSummary {
  adapter?: string;
  month?: string;
  pdf_url?: string;
  pdf_s3_key?: string;
  pages?: number;
  rows_in?: number;
  method?: string;
  notices_out?: number;
  counts?: Record<string, number>;
  new?: number;
  updated?: number;
  existing?: number;
  total?: number;
  published?: boolean;
  degraded?: boolean;
  error?: string;
  took_ms?: number;
}

export interface TimedStep {
  name: IngestStepName;
  state: StepState;
  start_ms: number | null;
  end_ms: number | null;
  summary: StepSummary;
}

export interface TextractPoll {
  poll: number;
  at_ms: number | null;
  elapsed_s: number | null;
  status: string | null;
}

export interface TextractTimeline {
  job_id?: string | null;
  pages: number | null;
  status: string | null;
  polls_count: number;
  elapsed_s: number;
  started_ms: number | null;
  polls: TextractPoll[];
  /** true when the poll times were rebuilt from the backoff schedule (older runs) */
  estimated: boolean;
}

export interface BBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RowNotice {
  pk: string;
  notice_id: string;
  product: string;
  batch: string | null;
  batches: number;
  maker: string;
  test: string;
  lab?: string | null;
}

export interface IngestRow {
  page: number;
  row: number;
  bbox: BBox | null;
  notice: RowNotice | null;
  /** a continuation line Normalise merged into the notice of this row */
  merged_into: number | null;
}

export interface RunSummary {
  run_id: string;
  execution_arn: string | null;
  status: string;
  adapter: string | null;
  month: string | null;
  title: string | null;
  method: string | null;
  pages: number | null;
  rows_in: number | null;
  notices_out: number | null;
  new: number | null;
  pdf_s3_key: string | null;
  started_at: string | null;
  stopped_at: string | null;
  duration_ms: number | null;
}

export interface RunView extends RunSummary {
  pdf_url: string | null;
  counts: Record<string, number> | null;
  diff: Record<string, number> | null;
  error: string | null;
  steps: TimedStep[];
  textract: TextractTimeline | null;
  rows_ready: boolean;
  rows_source: "run" | "pdf" | null;
  header: string[];
  rows: IngestRow[];
  mapped_notices?: number;
}

export interface RunsList {
  runs: RunSummary[];
  count: number;
}

/** GET /ingest/status/{arn} (live polling). */
export interface StatusBody {
  execution_arn: string;
  run_id: string;
  status: string;
  started_at: string | null;
  stopped_at: string | null;
  steps: {
    name: IngestStepName;
    state: StepState;
    started_at?: string | null;
    ended_at?: string | null;
    summary?: StepSummary;
  }[];
  textract: { polls?: number; elapsed_s?: number; pages?: number | null; status?: string; history?: unknown[] } | null;
  method: string | null;
  rows_in: number | null;
  notices_out: number | null;
  counts: Record<string, number> | null;
  diff: Record<string, number> | null;
  pdf: { pdf_s3_key: string | null; pdf_url: string | null; month: string | null; pages: number | null };
  error: string | null;
}

export interface StartBody {
  execution_arn: string;
  run_id: string;
  status: string;
}

// --- the play state -----------------------------------------------------------------------------

export interface StepView {
  name: IngestStepName;
  state: StepState;
  /** how long it took (done) or has taken so far (running) */
  ms: number | null;
  summary: StepSummary;
}

export interface TextractNow {
  pages: number | null;
  poll: number;
  elapsedS: number;
  estimated: boolean;
}

export interface PlayState {
  status: string;
  steps: StepView[];
  textract: TextractNow | null;
  method: string | null;
  month: string | null;
  pages: number | null;
  rowsIn: number | null;
  noticesOut: number | null;
  counts: Record<string, number> | null;
  newSinceLast: number | null;
  existing: number | null;
  pdfKey: string | null;
  rowsReady: boolean;
  error: string | null;
}

/**
 * The play state lives outside React state: it changes 10 times a second while a step runs (its
 * clock), and only the checklist needs that. The page subscribes to `coarse` instead, so it
 * re-renders a handful of times per run, not 10 times a second during the dissolve.
 */
export class PlayStore {
  private state: PlayState;
  private key: string;
  private listeners = new Set<() => void>();

  constructor(initial: PlayState) {
    this.state = initial;
    this.key = JSON.stringify(initial);
  }

  get = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  set(next: PlayState) {
    const key = JSON.stringify(next);
    if (key === this.key) return;
    this.state = next;
    this.key = key;
    this.listeners.forEach((fn) => fn());
  }
}

/** Everything the page layout depends on: step states and results, not the running clocks. */
export function coarse(s: PlayState): string {
  return JSON.stringify([
    s.status,
    s.steps.map((step) => step.state),
    s.method,
    s.month,
    s.rowsIn,
    s.noticesOut,
    s.newSinceLast,
    s.rowsReady,
    s.error,
  ]);
}

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "ABORTED"]);
export const isTerminal = (status: string) => TERMINAL.has(status);

export const IDLE_STATE: PlayState = {
  status: "IDLE",
  steps: INGEST_STEPS.map((name) => ({ name, state: "pending", ms: null, summary: {} })),
  textract: null,
  method: null,
  month: null,
  pages: null,
  rowsIn: null,
  noticesOut: null,
  counts: null,
  newSinceLast: null,
  existing: null,
  pdfKey: null,
  rowsReady: false,
  error: null,
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A stored run at `t` ms after it started (replay). Steps flip exactly at their recorded times. */
export function stateAt(view: RunView, t: number): PlayState {
  const end = Math.max(0, ...view.steps.map((s) => s.end_ms ?? 0));
  const steps: StepView[] = view.steps.map((s) => {
    const start = s.start_ms;
    if (start === null || s.state === "skipped") {
      return { name: s.name, state: t >= end ? s.state : "pending", ms: null, summary: t >= end ? s.summary : {} };
    }
    if (t < start) return { name: s.name, state: "pending", ms: null, summary: {} };
    if (s.end_ms === null || t < s.end_ms) return { name: s.name, state: "running", ms: t - start, summary: {} };
    return { name: s.name, state: s.state, ms: s.end_ms - start, summary: s.summary };
  });
  const at = (name: IngestStepName) => steps.find((s) => s.name === name)!;
  const extract = at("Extract");
  let textract: TextractNow | null = null;
  const tx = view.textract;
  if (tx && extract.state !== "pending") {
    const seen = tx.polls.filter((p) => p.at_ms !== null && p.at_ms <= t);
    const started = tx.started_ms ?? view.steps.find((s) => s.name === "Extract")?.start_ms ?? 0;
    textract = {
      pages: seen.length ? tx.pages : null,
      poll: seen.length,
      elapsedS: extract.state === "running" ? Math.max(0, (t - started) / 1000) : tx.elapsed_s,
      estimated: tx.estimated,
    };
  }
  const extractDone = extract.state === "done";
  const normaliseDone = at("Normalise").state === "done";
  const diffDone = at("Diff").state === "done";
  const finished = t >= end;
  return {
    status: finished ? view.status : "RUNNING",
    steps,
    textract,
    method: extractDone ? view.method : null,
    month: view.month,
    pages: at("Fetch").state === "done" || extractDone ? view.pages : null,
    rowsIn: extractDone ? view.rows_in : null,
    noticesOut: normaliseDone ? view.notices_out : null,
    counts: normaliseDone ? view.counts : null,
    newSinceLast: diffDone ? num(view.diff?.new) : null,
    existing: diffDone ? num(view.diff?.existing) : null,
    pdfKey: view.pdf_s3_key,
    rowsReady: extractDone && view.rows_ready,
    error: finished ? view.error : null,
  };
}

const ms = (a?: string | null, b?: string | null) => {
  const start = a ? Date.parse(a) : NaN;
  const stop = b ? Date.parse(b) : NaN;
  return Number.isFinite(start) && Number.isFinite(stop) ? stop - start : null;
};

/** A live run from its latest status poll; `sinceMs` = time since that poll arrived. */
export function stateFromStatus(body: StatusBody, sinceMs: number): PlayState {
  const running = body.status === "RUNNING";
  const steps: StepView[] = INGEST_STEPS.map((name) => {
    const s = body.steps.find((x) => x.name === name);
    const state = (s?.state ?? "pending") as StepState;
    const took = s?.summary?.took_ms;
    const elapsed = state === "running" && s?.started_at ? Date.now() - Date.parse(s.started_at) : ms(s?.started_at, s?.ended_at);
    return { name, state, ms: typeof took === "number" && state !== "running" ? took : elapsed, summary: s?.summary ?? {} };
  });
  const extract = steps.find((s) => s.name === "Extract")!;
  const tx = body.textract;
  const textract: TextractNow | null =
    tx && extract.state !== "pending"
      ? {
          pages: num(tx.pages),
          poll: num(tx.polls) ?? 0,
          // the record is written every ~2 s; between polls the clock keeps running locally
          elapsedS: (num(tx.elapsed_s) ?? 0) + (extract.state === "running" && running ? sinceMs / 1000 : 0),
          estimated: false,
        }
      : null;
  const extractDone = extract.state === "done";
  return {
    status: body.status,
    steps,
    textract,
    method: extractDone ? body.method : null,
    month: body.pdf?.month ?? null,
    pages: body.pdf?.pages ?? null,
    rowsIn: extractDone ? body.rows_in : null,
    noticesOut: steps[2].state === "done" ? body.notices_out : null,
    counts: steps[2].state === "done" ? body.counts : null,
    newSinceLast: steps[3].state === "done" ? num(body.diff?.new) : null,
    existing: steps[3].state === "done" ? num(body.diff?.existing) : null,
    pdfKey: body.pdf?.pdf_s3_key ?? null,
    rowsReady: extractDone,
    error: body.error,
  };
}

// --- words -------------------------------------------------------------------------------------

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "JUN-2025" -> "June 2025". */
export function monthLabel(month?: string | null): string {
  const m = /^([A-Z]{3})-(\d{4})$/.exec((month ?? "").toUpperCase());
  if (!m) return month ?? "";
  const i = MONTHS.findIndex((name) => name.slice(0, 3).toUpperCase() === m[1]);
  return i < 0 ? (month ?? "") : `${MONTHS[i]} ${m[2]}`;
}

export const fileName = (key?: string | null) => (key ? (key.split("/").pop() ?? key) : "");
export const methodLabel = (method?: string | null) =>
  method === "textract" ? "Textract" : method === "pdfplumber" ? "pdfplumber" : (method ?? "");

const n = (v: number | null | undefined) => (typeof v === "number" ? v : "…");
const plural = (count: number | null | undefined, word: string) => `${n(count)} ${word}${count === 1 ? "" : "s"}`;

/** R25 microcopy: the action, the specific thing, and the rule, from the step's real results. */
export function stepCopy(step: StepView, play: PlayState): string {
  const s = step.summary;
  const month = monthLabel(play.month ?? s.month);
  switch (step.name) {
    case "Fetch":
      if (step.state === "running") return `Fetching the ${month || "latest"} alert PDF from cdsco.gov.in`;
      if (step.state === "done") return `${fileName(s.pdf_s3_key ?? play.pdfKey)} from cdsco.gov.in`;
      if (step.state === "failed") return s.error ?? "The alert PDF could not be fetched";
      return "The CDSCO NSQ alert PDF, archived to S3";
    case "Extract": {
      const tx = play.textract;
      if (step.state === "running") {
        if (tx && tx.poll > 0)
          return `Textract reading ${tx.pages ? plural(tx.pages, "page") : "the PDF"} · poll ${tx.poll} · ${tx.elapsedS.toFixed(1)} s`;
        return "Starting Textract table analysis";
      }
      if (step.state === "done")
        return `${plural(s.rows_in ?? play.rowsIn, "table row")} from ${plural(s.pages ?? play.pages, "page")}`;
      if (step.state === "failed") return s.error ?? "No rows could be read";
      return "Textract TABLES; pdfplumber if Textract fails";
    }
    case "Normalise": {
      const c = play.counts ?? (s.counts as Record<string, number> | undefined) ?? null;
      if (step.state === "running") return `Mapping ${plural(play.rowsIn, "row")} to notices, no LLM`;
      if (step.state === "done") {
        const parts = [`Normalised ${plural(s.notices_out ?? play.noticesOut, "row")}`, `${n(c?.created)} new`];
        if (c?.updated) parts.push(`${c.updated} updated`);
        parts.push(`${n(c?.unchanged)} unchanged`);
        return parts.join(" · ");
      }
      if (step.state === "failed") return s.error ?? "Rows could not be mapped";
      return "Deterministic column mapping, one notice per row";
    }
    case "Diff":
      if (step.state === "running") return "Comparing with the last run of this alert";
      if (step.state === "done")
        return `${n(s.new ?? play.newSinceLast)} new since the last run · ${n(s.existing ?? play.existing)} already there`;
      if (step.state === "failed") return s.error ?? "Could not compare with the last run";
      return "New and changed rows since the last run";
    case "Publish":
      if (step.state === "running") return "Publishing to the feed and the public API";
      if (step.state === "done") return `${plural(play.noticesOut, "notice")} on the feed and /v1/notices`;
      if (step.state === "failed") return s.error ?? "Nothing was published";
      return "The feed and /v1/notices";
  }
}

export const fmtSeconds = (value: number | null) => (value === null ? "" : `${(value / 1000).toFixed(1)} s`);
