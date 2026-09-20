/**
 * /mine types. Field names mirror the API (spec/mine.md §1 "Data"), so the page container can pass
 * responses straight through. Nothing in this folder fetches: the route owns fetching and polling.
 */

/* ------------------------------------------------------------------ items */

export type ItemKind = "medicine" | "vehicle" | "appliance" | "other";

/** One thing in a household, as the v2 `/mine` items call returns it (path unchanged in v3). */
export interface HouseholdItem {
  item_id: string;
  kind: ItemKind;
  /** Display name. For vehicles v2 stores "{Make} {Model}"; the year is appended on the card. */
  name: string;
  /** Maker or brand ("Forgo Pharmaceuticals", "Bajaj"). */
  brand?: string | null;
  batch?: string | null;
  /** Vehicles only. v2 stores make and model lower-cased; the card shows `name`. */
  make?: string | null;
  model?: string | null;
  year?: number | null;
  mfg_date?: string | null;
  /** As printed ("09/2027") or ISO. */
  exp_date?: string | null;
  /** ISO date, "2026-07-12". */
  purchase_date?: string | null;
  status?: "alert" | "hold" | null;
  case?: { decision?: "dismiss" | "approve" | null } | null;
  notice_id?: string | null;
  case_id?: string | null;
  reason?: string | null;
  /** ISO timestamp of the last completed check. */
  last_checked_at?: string | null;
}

/** The card face, derived from an item (and a running check). */
export type Face = "alert" | "needs-you" | "near-miss" | "checking" | "clear" | "unchecked";

/* ---------------------------------------------------------------- sources */

/** Source keys as `/v1/stats` and `/v1/notices` return them. */
export type SourceKey = "cdsco_nsq" | "cpsc" | "nhtsa" | "openfda";

/** `GET /v1/stats` → `sources[]` (the fields /mine reads). */
export interface StatsSource {
  source: SourceKey;
  /** "CDSCO", "CPSC", "NHTSA", "openFDA". */
  label: string;
  count?: number;
  health?: "healthy" | "degraded" | "down";
  /** ISO. */
  last_run_at: string;
  /** "15 min" or "1 day". */
  polls_every: string;
}

/** `GET /v1/stats` (the fields /mine reads). */
export interface MineStats {
  /** 4868 */
  total: number;
  /** 4 */
  sources_count: number;
  sources: StatsSource[];
  /** Optional: when the backend adds it, the sub line uses it instead of computing it. */
  next_poll_at?: string | null;
}

/* ---------------------------------------------------------------- notices */

/**
 * The notice fields an alert, needs-you or near-miss face reads (`GET /v1/notices/{notice_id}`).
 * Names follow spec/mine.md; `noticeFromApi()` in adapters.ts maps the live /v1 shape onto them.
 */
export interface NoticeView {
  notice_id: string;
  source: SourceKey;
  title: string;
  /** ISO date. */
  published_at: string;
  /** CDSCO: the listed batch this item matched ("FT5427"). */
  batch?: string | null;
  /** CDSCO: "JUL-2026". */
  month?: string | null;
  /** CDSCO: 12. */
  row?: number | null;
  /** CDSCO: the failed-test text exactly as published. */
  reason?: string | null;
  /** CDSCO: "DTL Bikaner". */
  lab?: string | null;
  /** CDSCO: "State Lab". */
  lab_type?: string | null;
  maker?: string | null;
  /** NHTSA: "24V436000". */
  campaign?: string | null;
  /** NHTSA / CPSC / openFDA: the hazard text as published. */
  summary?: string | null;
  /** NHTSA: [2021, 2023]. */
  model_years?: [number, number] | null;
  /** CPSC: recall number ("10984"). */
  number?: string | null;
  /** openFDA: recall_number. */
  recall_number?: string | null;
}

/* ----------------------------------------------------------------- checks */

export type SourceStepState = "waiting" | "running" | "done";

/** One row of the checking face. See README "Backend": check-status needs per-source rows. */
export interface SourceStep {
  source: SourceKey;
  state: SourceStepState;
  /** Set when state is "done". */
  result?: "no_match" | "match" | null;
}

/** v2 pipeline step, kept so the v2 response still type-checks. */
export interface PipelineStep {
  name: string;
  state: "pending" | "running" | "done" | "failed" | "skipped";
  summary?: Record<string, unknown> | null;
}

/** `GET /items/{id}/check-status`, polled every 2 s while `status === "RUNNING"`. */
export interface CheckStatus {
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  /** v3: one entry per source, in any order. */
  sources?: SourceStep[];
  /** v2: pipeline steps (Candidates, Verify, RangeCheck, Decide). */
  steps?: PipelineStep[];
}

/* ------------------------------------------------------------- household */

export type HouseholdMode = "demo" | "own";

/** HouseholdBanner states (spec §2.1). `own-confirm-reset` is also reachable from inside the banner. */
export type BannerState = "demo" | "copying" | "own" | "own-confirm-reset" | "error";

/* --------------------------------------------------------------- filters */

export type StatusFilter = "all" | "alert" | "needs-you" | "near-miss" | "clear";
export interface MineFilter {
  show: StatusFilter;
  kind: ItemKind | null;
}

/* ------------------------------------------------------------------- scan */

/** A point as a fraction of the photo (Textract `Geometry.Polygon`). */
export type FracPoint = [number, number];

/** One Textract WORD block (`POST /items/ocr` → `words[]`). */
export interface OcrWord {
  text: string;
  /** Fractions of the photo (Textract `Geometry.BoundingBox`). */
  box: { left: number; top: number; width: number; height: number };
  /** v3: the four `Geometry.Polygon` points as fractions, so boxes follow rotated print. */
  poly?: [FracPoint, FracPoint, FracPoint, FracPoint] | null;
  is_batch?: boolean;
  /** v3 (optional): which read-back field this word belongs to, for the numbered tags. */
  field?: "name" | "batch" | "exp_date" | null;
}

/** `POST /items/ocr {key}` response. */
export interface OcrResult {
  fields: {
    name?: string | null;
    brand?: string | null;
    batch?: string | null;
    mfg_date?: string | null;
    exp_date?: string | null;
  };
  words: OcrWord[];
  /** e.g. ["main", "edge stamp"]; more than one pass shows "Read the edge stamp separately". */
  passes?: string[];
  /** Field names Textract was unsure of (v2). */
  uncertain?: string[];
}

/** The photo the user took, as shown in ScanConfirm. */
export interface ScanPhoto {
  /** Object URL of the local file (or /demo/strip-photo.png in the kit). */
  src: string;
  /** Natural size in px. */
  width: number;
  height: number;
  /**
   * Optional crop in image px. The demo photo uses {x:102,y:108,w:1100,h:825} to stand in for a user
   * who framed closer (spec §2.12). The app does no automatic zoom: leave it unset for real photos.
   */
  crop?: { x: number; y: number; w: number; h: number } | null;
}

/** What the scan step is doing (spec §2.12 states table). */
export type ScanPhase =
  | { phase: "idle" }
  | { phase: "manual" }
  | { phase: "uploading"; progress: number }
  | { phase: "reading"; words: OcrWord[]; passes?: string[] }
  | { phase: "result"; ocr: OcrResult }
  | { phase: "upload-error"; status: number }
  | { phase: "textract-error"; message: string };

/** `POST /items` body for a medicine (v2 field names). */
export interface NewMedicineItem {
  kind: "medicine";
  name: string;
  brand: string | null;
  batch: string | null;
  mfg_date: string | null;
  exp_date: string | null;
  /** ISO date or null. */
  purchase_date: string | null;
  photo_s3_key: string | null;
}

/** `POST /items` body for a vehicle (v2 lower-cases make and model). */
export interface NewVehicleItem {
  kind: "vehicle";
  name: string;
  brand: string;
  make: string;
  model: string;
  year: number;
  reg_no: string | null;
}

/** `POST /items` body for an appliance or other thing. */
export interface NewModelItem {
  kind: "appliance" | "other";
  name: string;
  brand: string;
  model: string;
}

export type NewItem = NewMedicineItem | NewVehicleItem | NewModelItem;

export type AddKind = "medicine" | "vehicle" | "appliance";
export type SheetStep = "scan" | "checking" | "added";

/** Choices for the vehicle form (the route supplies them). */
export interface VehicleOptions {
  makes: string[];
  models: Record<string, string[]>;
  years: number[];
}

/** A toast the view asks the host to show (sonner in the repo; a local fallback otherwise). */
export interface MineToast {
  id: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}
