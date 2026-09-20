/**
 * Types for /feed, /ingest and /api. Field names mirror the public API
 * (https://ilbmeuwrt7.execute-api.ap-south-1.amazonaws.com, read 20 Sep 2026) and the
 * recorded ingest bundle, so a response can be passed straight through.
 */

/* ------------------------------------------------------------------ API */

export type SourceId = "cdsco_nsq" | "cpsc" | "nhtsa" | "openfda";

/** `row_ref`: CDSCO portal rows carry month + row; CDSCO PDF rows carry page + row; US sources null. */
export interface RowRef {
  month: string | null; // "JUL-2026"
  row: number | null;
  page: number | null;
}

/** NHTSA `vehicles[]` (lower-case make/model as returned). */
export interface VehicleRange {
  make: string;
  model: string;
  year_from: number;
  year_to: number;
}

/** GET /v1/notices → notices[] and GET /v1/notices/{id}. */
export interface Notice {
  pk: string; // "cdsco_nsq#JUL-2026-cdsco_portal-005f85bb4ee1"
  source: SourceId;
  notice_id: string;
  title?: string;
  product: string;
  brand: string | null;
  batches: string[];
  model: string | null;
  vehicles: VehicleRange[];
  row_ref: RowRef | null;
  hazard_or_failed_test: string | null;
  /** US sources end with "; Repair" | "; Refund" | "; Replace" when CPSC states the remedy type. */
  remedy: string | null;
  published_at: string; // "2026-07-01"
  first_seen_at: string; // ISO UTC
  url: string | null;
  /** CDSCO: the published row joined with " | " (drug, batch, mfg, exp, manufacturer, result, drawn by, tested by, month). US: the notice text. */
  raw_excerpt?: string | null;
  mfg_date?: string | null;
  exp_date?: string | null;
  lab?: string | null;
  serial_ranges?: unknown[];
  units?: string | number | null;
  adapter?: string | null;
  pdf_s3_key?: string | null;
  source_confidence?: string;
  updated_at?: string;
}

export interface NoticesPage {
  notices: Notice[];
  count: number;
  next_cursor: string | null;
  source?: SourceId | null;
  since?: string | null;
  q?: string | null;
  limit?: number;
}

/** `health` is "healthy" today; "degraded"/"slow" and "down" are the other states the UI draws. */
export type SourceHealth = "healthy" | "slow" | "degraded" | "down";

export interface PollerStats {
  name: string; // "cdsco_portal" | "cdsco_pdf" | "cpsc" | …
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  degraded: boolean;
  last_counts: Partial<Record<"fetched" | "created" | "updated" | "unchanged" | "upserted" | "skipped" | "rows_in" | "notices_out", number>>;
}

export interface SourceStats {
  source: SourceId;
  label: string;
  count: number;
  health: SourceHealth;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  polls_every: string; // "1 day" | "15 min"
  pollers: PollerStats[];
}

/** GET /v1/stats */
export interface Stats {
  total: number;
  sources_count: number;
  sources: SourceStats[];
  cdsco_latest?: { month: string; count: number; published_at: string; complete: boolean };
  last_poll_at: string;
  generated_at: string;
}

/** public/data/cdsco-months.json (prebuild script; see README). Oldest first. */
export interface CdscoMonth {
  month: string; // "SEP-2025"
  count: number;
}

/* ------------------------------------------------------------ household */

export type ThingKind = "medicine" | "vehicle" | "appliance" | "other";

/** The fields of a /mine item that the feed needs. */
export interface HouseholdItem {
  item_id: string;
  kind: ThingKind;
  name: string;
  brand?: string | null;
  batch?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  purchase_date?: string | null;
  case_id?: string | null;
  /** Optional short label for the banner pill ("Paracetamol"). Derived when absent. */
  label?: string;
}

export interface HouseholdMatch {
  item: HouseholdItem;
  notice: Pick<Notice, "pk" | "source" | "notice_id" | "row_ref">;
}

/** The /mine household check, as the feed reads it. */
export interface HouseholdCheck {
  /** "the demo household" | "your household" */
  name: string;
  as_of: string; // ISO; shown as HH:MM IST
  matches: HouseholdMatch[];
  /** Medicines in the household that were checked by batch (sheet copy). */
  medicines_checked: number;
}

/* ---------------------------------------------------------------- feed */

export interface FeedFilters {
  source: SourceId | null;
  /** YYYY-MM-DD or null for "Any time" */
  since: string | null;
  q: string;
}

export type SinceOption = "any" | "7d" | "30d" | "custom";

export interface NoticeGroup {
  /** YYYY-MM-DD (IST date of published_at) */
  date: string;
  /** Rows shown now (5 when the group is collapsed). */
  notices: Notice[];
  /** Rows loaded for this date (never a total the API didn't return). */
  loaded: number;
  /** Loaded rows per source for the header sub-line. */
  bySource: Partial<Record<SourceId, number>>;
}

export interface PinnedAlert {
  month: string; // "JUL-2026"
  published_at: string; // "2026-07-01"
  first_seen_at: string; // ISO
  count: number; // rows in the alert (239)
  notices: Notice[]; // first 3, in row order
}

/* -------------------------------------------------------------- ingest */

/** bbox as fractions (0–1) of the page, from Textract. */
export interface IngestBBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** rows[].notice in the recorded bundle. */
export interface IngestRowNotice {
  pk: string;
  notice_id: string;
  product: string;
  batch: string | null;
  test: string;
  maker?: string;
  lab?: string;
  /** Diff result for this notice; when absent it is derived from run.diff (all new / all unchanged). */
  diff?: "new" | "changed" | "unchanged";
}

export interface IngestRow {
  page: number;
  row: number;
  bbox?: IngestBBox;
  /** Textract CELL boxes (page fractions), left to right. Backend addition; the dashed cell boxes are skipped without it. */
  cell_bboxes?: IngestBBox[];
  /** The 8 cell texts, for the ghost's table snapshot and the stand-in page. */
  cells?: string[];
  notice: IngestRowNotice | null;
  /** A continuation row merged into row n (57 rows → 55 notices). */
  merged_into: number | null;
}

export type IngestStepKey = "fetch" | "extract" | "normalise" | "diff" | "publish";

export interface IngestStepRecord {
  key: IngestStepKey;
  label: string;
  /** Recorded real duration, always shown on the step label. */
  ms: number;
}

export interface IngestRun {
  run_id: string;
  month: string; // "JUN-2025"
  title: string;
  method: "textract";
  pages: number;
  rows_in: number;
  notices_out: number;
  started_at: string;
  pdf_url: string;
  /** Display name in the viewer toolbar. */
  file_name: string;
  pdf_kb?: number | null;
  header: string[];
  steps: IngestStepRecord[];
  rows: IngestRow[];
  diff: { new: number; updated: number; existing: number; total: number };
  error?: { step: IngestStepKey; reason: string } | null;
}

export type IngestSpeed = 1 | 2 | 4;

/* ----------------------------------------------------------------- api */

export type Endpoint = "/v1/notices" | "/v1/notices/{id}" | "/v1/stats" | "/v1/sources";

export interface TryItRequest {
  endpoint: Endpoint;
  source: SourceId | "";
  since: string;
  q: string;
  limit: string;
  id: string;
  cursor?: string;
}

export interface TryItResponse {
  status: number;
  ms: number;
  body: unknown;
  count?: number | null;
  next_cursor?: string | null;
}

export type TryItResult =
  | { state: "idle" }
  | { state: "loading"; previous?: TryItResponse }
  | { state: "done"; response: TryItResponse }
  | { state: "network-error"; message?: string };

export interface ApiExample {
  key: string;
  label: string;
  request: TryItRequest;
}
