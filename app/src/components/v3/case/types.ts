/**
 * /case types. API shapes mirror `GET /cases/{id}`, `GET /v1/notices/{id}`, `GET /items/{id}` and
 * `GET /cases/{id}/verify-evidence[?tamper=1]` field for field (snake_case kept on purpose), so the page
 * can pass responses straight through. View-only props are camelCase.
 */

/* ------------------------------------------------------------------ API: case */

export type CaseStatus =
  | "waiting_approval"
  | "approving"
  | "sealing"
  | "writing_letter"
  | "verifying"
  | "verified"
  | "rejected"
  | "expired";

export type StepKey = "approve" | "seal_evidence" | "write_letter" | "verify";

export interface CaseStep {
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

export type CaseSteps = Record<StepKey, CaseStep>;

export interface CaseApproval {
  status: "pending" | "approved" | "rejected" | "expired";
  approved_at: string | null;
  rejected_at: string | null;
  expired_at: string | null;
  /** "seed:demo-household" for the demo, a user id otherwise */
  approver: string | null;
  reason: string | null;
  token_issued_at?: string | null;
}

export interface CaseEvidence {
  sha256: string;
  signed_at: string;
  key_alias: string;
  signing_algorithm: string;
  object_lock_mode: "GOVERNANCE" | "COMPLIANCE";
  object_lock_retain_until: string;
  snapshot_bytes: number;
  /** "portal_row" (CDSCO) or "notice_json" (CPSC, NHTSA, openFDA) */
  snapshot_kind: "portal_row" | "notice_json" | (string & {});
  snapshot_s3_key: string;
  snapshot_version_id: string;
  source_url: string;
  kms_key_id?: string;
  content_type?: string;
  signature_b64?: string;
}

export interface AuditEntry {
  ts: string;
  event: string;
  detail: Record<string, unknown>;
}

export interface RangeCheck {
  yours: string;
  listed: string;
  inside: boolean;
}

export interface CaseRecord {
  case_id: string;
  status: CaseStatus;
  created_at: string;
  item_id: string;
  notice_id: string;
  household_id: string;
  decision: "alert" | "near_miss" | "clear" | (string & {});
  approval: CaseApproval;
  steps: CaseSteps;
  evidence: CaseEvidence | null;
  claim_text: string | null;
  claim_pdf_s3_key: string | null;
  claim_created_at?: string | null;
  /** "pharmacy" | "dealer" | "seller" … */
  claim_addressee: string;
  /** the raw row / notice excerpt that gets sealed, character for character */
  quoted_sentence: string;
  range_check: RangeCheck | null;
  /** "brand 'X' matches; product 'Y' fuzzy 100; batch Z in listed [Z]" */
  reasoning: string;
  reason?: string;
  verifier: "deterministic" | (string & {});
  confidence: number;
  sold_after_notice: boolean;
  audit: AuditEntry[];
  /** BACKEND ADD (see README): byte size of the snapshot that will be sealed, known before approval */
  pending_snapshot_bytes?: number | null;
}

/* ------------------------------------------------------------------ API: notice */

export type NoticeSource = "cdsco_nsq" | "cpsc" | "nhtsa" | "openfda";

export interface NoticeRowRef {
  page: number | null;
  row: number | null;
  /** "JUL-2026" */
  month: string | null;
}

export interface Notice {
  notice_id: string;
  pk: string;
  source: NoticeSource;
  title: string;
  product: string;
  brand: string | null;
  batches: string[];
  mfg_date: string | null;
  exp_date: string | null;
  hazard_or_failed_test: string | null;
  lab: string | null;
  row_ref: NoticeRowRef | null;
  /** "2026-07-01" */
  published_at: string;
  url: string;
  raw_excerpt: string;
  remedy: string | null;
  model: string | null;
  /** BACKEND ADD: full manufacturer line (CDSCO column 5). Parsed from raw_excerpt when absent. */
  manufacturer?: string | null;
  /** BACKEND ADD: "State Lab" / "Central Lab" (CDSCO column 7). Parsed from raw_excerpt when absent. */
  lab_type?: string | null;
  /** NHTSA: campaign number, e.g. "24V436000" */
  campaign?: string | null;
  /** NHTSA: component, e.g. "BACK OVER PREVENTION" */
  component?: string | null;
  /** NHTSA: listed model years [from, to] */
  model_years?: [number, number] | null;
}

/* ------------------------------------------------------------------ API: item */

export type ItemKind = "medicine" | "vehicle" | "appliance" | "other";

export interface Item {
  item_id: string;
  kind: ItemKind;
  name: string;
  brand: string | null;
  batch?: string | null;
  serial?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  /** "2025-10" or "Oct-2025" */
  mfg_date?: string | null;
  exp_date?: string | null;
  /** "2026-07-12" */
  purchase_date?: string | null;
}

/* ------------------------------------------------------------------ API: verify-evidence */

export interface VerifyResult {
  valid: boolean;
  sha256: string;
  recomputed_sha256: string;
  checked_at: string;
  tampered?: false;
  /** BACKEND ADD (optional): server-side duration of the check, shown on aside step 4 */
  duration_ms?: number;
}

export interface TamperResult {
  valid: false;
  tampered: true;
  flipped_byte_index: number;
  byte_before: number;
  byte_after: number;
  sha256: string;
  recomputed_sha256: string;
  checked_at: string;
  demo_control: boolean;
  duration_ms?: number;
}

/* ------------------------------------------------------------------ view */

/** Every `?state=` value the page accepts (spec §1). */
export type CaseUiState =
  | "loading"
  | "waiting"
  | "readonly"
  | "approving"
  | "sealing"
  | "writing"
  | "verifying"
  | "verified"
  | "invalid"
  | "rejected"
  | "expired"
  | "failed";

export const CASE_UI_STATES: readonly CaseUiState[] = [
  "loading", "waiting", "readonly", "approving", "sealing", "writing",
  "verifying", "verified", "invalid", "rejected", "expired", "failed",
];

export interface Household {
  id: string;
  demo: boolean;
  /** "Demo household" / "My household" */
  name: string;
  thing_count?: number;
}

/** Another item of the household whose near-miss points at this case's notice. */
export interface NearMiss {
  item_id: string;
  batch: string;
  status: "dismissed" | "open";
}

/** Callbacks. Every one is optional so the /kit page can render any state without wiring. */
export interface CaseHandlers {
  /** POST /cases/{id}/approve */
  onApprove?: () => void;
  /** POST /cases/{id}/reject (after the inline confirm) */
  onDismiss?: () => void;
  /** readonly demo: copy the demo household */
  onMakeCopy?: () => void;
  /** GET /cases/{id}/verify-evidence?tamper=1 */
  onRunTamperTest?: () => void;
  /** GET /cases/{id}/verify-evidence */
  onVerifyAgain?: () => void;
  /** used only when `claimPdfUrl` is absent (the PDF link is otherwise a plain <a download>) */
  onDownload?: () => void;
  /** default: copies `claim_text` to the clipboard */
  onCopyLetter?: () => void | Promise<void>;
  /** default: copies the case JSON to the clipboard */
  onCopyCaseJson?: () => void | Promise<void>;
  /** expired: re-run the check for this thing */
  onCheckAgain?: () => void;
  /** failed / timed out: poll GET /cases/{id} once more */
  onCheckStatus?: () => void;
}

export interface CasePending {
  approve?: boolean;
  dismiss?: boolean;
  tamper?: boolean;
  verify?: boolean;
}

export interface CaseViewProps {
  /** The state to show. Use `useCasePhase()` to derive it from polling with the minimum dwells. */
  state: CaseUiState;
  caseRecord: CaseRecord | null;
  notice: Notice | null;
  item: Item | null;
  household: Household;
  nearMiss?: NearMiss | null;
  /** last `verify-evidence` (no tamper): page-load check or "Verify again" */
  verify?: VerifyResult | null;
  /** `verify-evidence?tamper=1` result, shown while `state === "invalid"` */
  tamper?: TamperResult | null;
  /** set after "Verify again" restores VERIFIED (ISO time of that check) */
  verifiedAgainAt?: string | null;
  /** presigned URL for `claim_pdf_s3_key` */
  claimPdfUrl?: string | null;
  /** the 30 s polling budget ran out (spec §4) */
  timedOut?: boolean;
  /** request-in-flight flags (button spinners, aria-busy) */
  pending?: CasePending;
  /** override the running clock on the case file (ms since approval). Default: ticks from when running starts. */
  elapsedMs?: number;
  /** extra audit rows appended client-side (tamper runs) */
  clientAudit?: AuditEntry[];
  /** Show work starts open (the full-page capture shows it open). Default false. */
  showWorkOpen?: boolean;
  /** Play the one load sequence (calendar fill, body fade). Default true; the /kit page passes false. */
  animateOnMount?: boolean;
  /** Force the "band is on screen" flag for static captures (the invalid PNG). Default: IntersectionObserver. */
  bandInView?: boolean;
  /** Give the header band, tile and foil chip their shared-element layoutIds (arrival from My things). Default false. */
  sharedLayout?: boolean;
  /** Where the back pill goes. Default "/mine". */
  backHref?: string;
  /** Text-to-highlight override for the regulator's sentence (default: derived, e.g. "Dissolution Test"). */
  highlight?: string | null;
  /** Retention period copy before sealing. Default 30. */
  retentionDays?: number;
  /** Added to the page wrapper. An app shell whose `<main>` already draws the gutter passes `px-0!`. */
  className?: string;
  on?: CaseHandlers;
}
