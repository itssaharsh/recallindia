// Shapes of the HTTP API responses (backend/api). Kept loose where the API is loose: every
// optional field is optional here too, so a fixture recorded from the live API always fits.

export type SourceId = "cdsco_nsq" | "cpsc" | "nhtsa" | "openfda" | (string & {});
export type Health = "healthy" | "degraded" | "down";
export type ItemStatus = "clear" | "hold" | "alert";
export type Decision = "alert" | "hold" | "dismiss";
export type ItemKind = "medicine" | "vehicle" | "appliance" | "other";

export interface Vehicle {
  make: string;
  model: string;
  year_from: number;
  year_to: number;
}

export interface RowRef {
  page?: number | null;
  row?: number | null;
  month?: string | null;
}

export interface Notice {
  pk: string;
  source: SourceId;
  notice_id: string;
  adapter?: "cdsco_portal" | "cdsco_pdf" | null;
  title: string;
  product: string;
  brand: string;
  brand_lc?: string;
  model?: string | null;
  batches?: string[];
  serial_ranges?: string[];
  vehicles?: Vehicle[];
  hazard_or_failed_test?: string;
  remedy?: string | null;
  published_at: string;
  url: string;
  raw_excerpt?: string;
  pdf_s3_key?: string | null;
  row_ref?: RowRef | null;
  mfg_date?: string | null;
  exp_date?: string | null;
  lab?: string | null;
  source_confidence?: string | null;
}

export interface NoticesPage {
  notices: Notice[];
  count: number;
  next_cursor: string | null;
  limit?: number;
}

export interface SourceStat {
  source: SourceId;
  label: string;
  count: number;
  health: Health;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  polls_every: string;
}

export interface Stats {
  total: number;
  sources_count: number;
  sources: SourceStat[];
  last_poll_at: string | null;
  generated_at: string;
}

export interface RangeCheck {
  listed: string;
  yours: string;
  inside: boolean | null;
  kind?: "batch" | "serial" | "vehicle_year" | "none";
}

export interface Case {
  case_id: string;
  item_id: string;
  notice_id: string;
  decision: Decision;
  reason: string;
  quoted_sentence?: string;
  range_check?: RangeCheck | null;
  sold_after_notice?: boolean;
  verifier?: "bedrock" | "deterministic" | "none" | null;
  confidence?: number | null;
  reasoning?: string | null;
  covers_item?: boolean | null;
  created_at?: string | null;
}

export interface Item {
  pk: string;
  item_id: string;
  kind: ItemKind;
  name: string;
  brand?: string | null;
  model?: string | null;
  batch?: string | null;
  serial?: string | null;
  reg_no?: string | null;
  make?: string | null;
  year?: number | null;
  purchase_date?: string | null;
  mfg_date?: string | null;
  exp_date?: string | null;
  photo_s3_key?: string | null;
  status: ItemStatus;
  last_checked_at?: string | null;
  last_check_at?: string | null;
  last_check_arn?: string | null;
  case_id?: string | null;
  created_at?: string | null;
  case?: Case | null;
}

export type StepName = "Candidates" | "Verify" | "RangeCheck" | "Decide" | "Notify";
export type StepState = "pending" | "running" | "done" | "failed" | "skipped";

export interface CheckStep {
  name: StepName;
  state: StepState;
  started_at?: string | null;
  ended_at?: string | null;
  summary?: Record<string, unknown>;
}

export interface CheckStatus {
  item_id: string;
  execution_arn: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "ABORTED" | string;
  steps: CheckStep[];
  decision?: string | null;
  case_id?: string | null;
}

export interface UploadTicket {
  key: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expires_in: number;
  max_bytes: number;
}

export interface OcrFields {
  kind: ItemKind;
  name: string;
  brand: string | null;
  batch: string | null;
  mfg_date: string | null;
  exp_date: string | null;
}

export interface OcrResult {
  key: string;
  fields: OcrFields;
  confidence: Record<string, number>;
  missing: string[];
  uncertain: string[];
  needs_confirm: boolean;
  passes: string[];
  lines: { text: string; confidence: number; edge?: string | null }[];
}

export interface PasteRow {
  line: string;
  kind: ItemKind;
  name: string;
  brand: string | null;
  model: string | null;
  batch: string | null;
  make: string | null;
  year: number | null;
  reg_no: string | null;
  confidence: number;
  needs_confirm: boolean;
  why: string[];
}

export interface NormaliseResult {
  rows: PasteRow[];
  count: number;
  entities_source: string;
}
