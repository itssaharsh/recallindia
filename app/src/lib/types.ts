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
  /** when the poller first saw it (a new row on the feed is new by this, not by published_at) */
  first_seen_at?: string | null;
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

export interface CdscoLatest {
  month: string;
  count: number;
  published_at?: string;
  complete?: boolean;
}

export interface Stats {
  total: number;
  /** the newest CDSCO NSQ month and how many samples failed in it (the feed's callout) */
  cdsco_latest?: CdscoLatest | null;
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

export type ApprovalStatus = "waiting" | "approved" | "rejected" | "expired";

/** The case's own state machine (UI-SPEC §7). "invalid" is never stored: a tamper test is a
 *  client-side question about a stored signature. */
export type CaseStatus =
  | "matching"
  | "waiting_approval"
  | "approving"
  | "sealing"
  | "writing_letter"
  | "verifying"
  | "verified"
  | "rejected"
  | "expired"
  | "error"
  | "needs_you"
  | "near_miss"
  | "clear";

/** The four steps after the human gate, as the server records them. */
export type PipelineStepName = "approve" | "seal_evidence" | "write_letter" | "verify";

export interface StepRecord {
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
}

export type CaseSteps = Record<PipelineStepName, StepRecord>;

/** The human gate (the task token itself never leaves the API). */
export interface Approval {
  status: ApprovalStatus;
  token_issued_at: string;
  approved_at?: string | null;
  rejected_at?: string | null;
  expired_at?: string | null;
  approver?: string | null;
  reason?: string | null;
}

export interface Evidence {
  sha256: string;
  kms_key_id: string;
  key_alias?: string | null;
  signature_b64: string;
  signing_algorithm?: string;
  object_lock_mode?: string;
  object_lock_retain_until: string;
  snapshot_s3_key: string;
  snapshot_version_id?: string | null;
  snapshot_bytes?: number | null;
  content_type?: string | null;
  snapshot_kind?: "pdf" | "portal_row" | "source_json" | "stored_notice" | null;
  source_url?: string | null;
  signed_at?: string | null;
}

export interface AuditEvent {
  ts: string;
  event: string;
  detail?: Record<string, unknown> | null;
}

export interface Case {
  case_id: string;
  item_id: string;
  household_id?: string;
  status?: CaseStatus;
  steps?: CaseSteps;
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
  execution_arn?: string | null;
  approval?: Approval | null;
  claim_pdf_s3_key?: string | null;
  claim_text?: string | null;
  claim_addressee?: "pharmacy" | "dealer" | "retailer" | null;
  claim_created_at?: string | null;
  evidence?: Evidence | null;
  audit?: AuditEvent[];
}

/** GET /cases/{id}/verify-evidence[?tamper=1] */
export interface VerifyResult {
  case_id: string;
  valid: boolean;
  /** the hash the signature covers (what was sealed) */
  sha256: string;
  /** the hash of the copy just read back */
  recomputed_sha256: string;
  flipped_byte_index: number | null;
  byte_before: number | null;
  byte_after: number | null;
  signed_at: string | null;
  key_id: string;
  key_alias?: string | null;
  algorithm?: string | null;
  retain_until?: string | null;
  snapshot_s3_key?: string | null;
  tampered: boolean;
  demo_control: string | null;
  checked_at: string;
}

/** GET /cases/{id}/claim */
export interface ClaimLink {
  case_id: string;
  key: string;
  /** open in a tab */
  view: string;
  /** the same object with Content-Disposition: attachment */
  download: string;
  /** kept so a recorded fixture with one link still opens */
  url?: string;
  expires_in: number;
  created_at?: string | null;
  addressee?: string | null;
  /** the letter's first two paragraphs, for the preview (C-18) */
  paragraphs?: string[];
}

export interface Item {
  pk: string;
  item_id: string;
  household_id?: string;
  copied_from?: string | null;
  bought_from?: string | null;
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
export type ApprovalStepName = "WaitForApproval" | "Claim" | "Evidence";
export type StepState = "pending" | "running" | "done" | "failed" | "skipped";

export interface CheckStep {
  name: StepName;
  state: StepState;
  started_at?: string | null;
  ended_at?: string | null;
  summary?: Record<string, unknown>;
}

export interface ApprovalStep {
  name: ApprovalStepName;
  state: StepState;
  started_at?: string | null;
  ended_at?: string | null;
  summary?: Record<string, unknown>;
}

export interface CheckStatus {
  item_id: string;
  execution_arn: string;
  /** WAITING_FOR_APPROVAL: the check is over and an alert waits for the human */
  status: "RUNNING" | "WAITING_FOR_APPROVAL" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "ABORTED" | string;
  steps: CheckStep[];
  approval_steps?: ApprovalStep[];
  approval?: Approval | null;
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

/** One line Textract read, with the geometry the UI draws on the photo (fractions of the image). */
export interface OcrWord {
  text: string;
  confidence: number;
  box: { left: number; top: number; width: number; height: number };
  is_batch: boolean;
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
  words?: OcrWord[];
  batch_candidates?: OcrWord[];
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
