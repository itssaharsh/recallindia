/**
 * Shell types. Field names mirror the public API (`/v1/stats`, `/v1/notices`) and the
 * household store exactly, so a fetch result can be passed straight through.
 * See README.md "Props → API fields".
 */

/** The four app tabs. `/kit`, `/` and 404 have no active tab (`null`). */
export type TabId = "feed" | "ingest" | "mine" | "api";

/** A thing's category. Drives the tile colour and illustration (squares mean category). */
export type Category = "medicine" | "vehicle" | "appliance" | "other";

/** `/v1/stats` → `sources[].source` */
export type SourceId = "cdsco_nsq" | "cpsc" | "nhtsa" | "openfda";

/**
 * `/v1/stats` → `sources[].health`. `healthy` and `degraded` are the known values;
 * anything else is treated as a failure ("down since {HH:MM}").
 */
export type SourceHealth = "healthy" | "degraded" | (string & {});

/** One row of `/v1/stats` → `sources[]`. */
export interface SourceStat {
  source: SourceId;
  label: string;
  count: number;
  health: SourceHealth;
  polls_every?: string;
  /** ISO 8601, UTC. Shown as HH:MM IST. */
  last_success_at?: string;
  last_error?: string | null;
}

/** `GET /v1/stats` (the fields the shell reads). */
export interface StatsSummary {
  total: number;
  sources: SourceStat[];
}

/** `row_ref` on a CDSCO notice: the alert month and the row in the published list. */
export interface RowRef {
  month: string; // "JUL-2026"
  row: number; // 12
  page?: number;
}

/** One `/v1/notices` item (the fields the palette and the kit read). */
export interface NoticeSummary {
  pk: string;
  source: SourceId;
  notice_id: string;
  row_ref?: RowRef | null;
  product: string;
  brand?: string | null;
  batches?: string[];
  model?: string | null;
  hazard_or_failed_test?: string | null;
  remedy?: string | null;
  /** ISO date. Always present in the API; optional here so fixtures never invent one. */
  published_at?: string;
}

/**
 * The face an item card shows. Derived on `/mine` (see mine.md "Face derivation"):
 * alert ← status "alert"; needs-you ← status "hold"; near-miss ← case.decision "dismiss";
 * clear ← last_checked_at set; checking ← check-status RUNNING; unchecked otherwise.
 */
export type ItemFace = "alert" | "needs-you" | "near-miss" | "checking" | "clear" | "unchecked";

/** One household item (the household store; same fields as v2 `/mine`). */
export interface HouseholdItem {
  item_id: string;
  kind: Category;
  name: string;
  brand?: string;
  batch?: string;
  make?: string;
  model?: string;
  year?: number;
  /** ISO date */
  purchase_date?: string;
  status?: "alert" | "hold" | null;
  notice_id?: string | null;
  case_id?: string | null;
  /** For a near miss: the batch on the list ("FT5427"). */
  listed_batch?: string | null;
  /** ISO datetime */
  last_checked_at?: string | null;
  /** Derived client-side, see ItemFace. */
  face: ItemFace;
}

/**
 * Household pill state (spec §6.4).
 * - demo: the shared read-only household (id `demo`, 15 items)
 * - copying: "Make my own copy" is writing items; `copied` ticks 1 → `total`
 * - yours: a private copy saved on this device
 */
export type HouseholdState =
  | { kind: "demo"; household_id: "demo"; count: number }
  | { kind: "copying"; copied: number; total: number }
  | { kind: "yours"; household_id: string; count: number; name?: string };

/** Household menu actions. The shell only reports them; the page performs them. */
export type HouseholdAction = "make-copy" | "explain-demo" | "rename" | "reset" | "delete";

/** Notices group status in the palette. The parent owns the fetch (`GET /v1/notices?q=&limit=5`). */
export type NoticesStatus = "idle" | "loading" | "ready" | "offline";
