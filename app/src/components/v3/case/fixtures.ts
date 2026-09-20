/**
 * Demo data for /kit and the video. Values are the brief's real demo case (case_demo_ft5427): CDSCO JUL-2026
 * alert row 12, batch FT5427 bought 12 Jul 2026, the example evidence (SHA-256 56237b4d…4b9c29a7, signed
 * 2026-09-19 23:58 UTC, locked until 19 Oct 2026), step timings 1.0 / 6.9 / 1.1 s, and the live API's real
 * tamper result. The claim letter is the live `claim_text` template filled with those values.
 *
 * `caseFixture(state)` returns a complete CaseViewProps for every `?state=` value.
 */
import type { AuditEntry, CaseRecord, CaseUiState, CaseViewProps, Household, Item, NearMiss, Notice, TamperResult, VerifyResult } from "./types";

export const SHA256 = "56237b4d612cf0bcd7e97aa1d6ddb88ebdb31f3f23708a6028ac10ab4b9c29a7";
export const RECOMPUTED_SHA256 = "92d76ff5b3b22264d42e93382054e2a3db3031feef60693d52286c0fd3c90654";
export const CASE_ID = "case_demo_ft5427";
export const RAW_ROW =
  "Paracetamol Tablets IP 650mg | FT5427 | Oct-2025 | Sep-2027 | Forgo Pharmaceuticals, 27, DIC Ind Area, Barotiwala, Teh: Baddi, Distt. Solan (HP) 174103 | The sample does not conforms to the I.P. with respect to Dissolution Test. | State Lab | DTL Bikaner | JUL-2026";

export const DEMO_HOUSEHOLD: Household = { id: "demo", demo: true, name: "Demo household", thing_count: 15 };
export const OWN_HOUSEHOLD: Household = { id: "hh_a41c", demo: false, name: "My household", thing_count: 15 };

export const DEMO_ITEM: Item = {
  item_id: "demo-alert",
  kind: "medicine",
  name: "Paracetamol Tablets IP 650mg",
  brand: "Forgo Pharmaceuticals",
  batch: "FT5427",
  mfg_date: "2025-10",
  exp_date: "2027-09",
  purchase_date: "2026-07-12",
};

export const DEMO_NOTICE: Notice = {
  notice_id: "JUL-2026-cdsco_portal-b75cfffe3713",
  pk: "cdsco_nsq#JUL-2026-cdsco_portal-b75cfffe3713",
  source: "cdsco_nsq",
  title: "Paracetamol Tablets IP 650mg — failed CDSCO quality test, JUL-2026 alert, row 12",
  product: "Paracetamol Tablets IP 650mg",
  brand: "Forgo Pharmaceuticals",
  batches: ["FT5427"],
  mfg_date: "Oct-2025",
  exp_date: "Sep-2027",
  hazard_or_failed_test: "The sample does not conforms to the I.P. with respect to Dissolution Test.",
  lab: "DTL Bikaner",
  row_ref: { page: null, row: 12, month: "JUL-2026" },
  published_at: "2026-07-01",
  url: "https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug",
  raw_excerpt: RAW_ROW,
  remedy: null,
  model: null,
  manufacturer: "Forgo Pharmaceuticals, 27, DIC Ind Area, Barotiwala, Teh: Baddi, Distt. Solan (HP) 174103",
  lab_type: "State Lab",
};

export const NEAR_MISS: NearMiss = { item_id: "demo-near-miss", batch: "FT5428", status: "dismissed" };

export const CLAIM_TEXT = `20 September 2026

To: The Pharmacist-in-charge
The pharmacy that sold this medicine

Subject: Refund or replacement: Paracetamol Tablets IP 650mg, batch FT5427, failed CDSCO quality test (July 2026 alert, row 12)

Dear Sir or Madam,

I bought Paracetamol Tablets IP 650mg, made by Forgo Pharmaceuticals (batch FT5427), on 12 July 2026.

This batch is listed in the CDSCO Not of Standard Quality alert for July 2026, row 12, published on 1 July 2026 by the Central Drugs Standard Control Organisation (CDSCO): its list of drugs that failed a quality test. The listed result reads: "The sample does not conforms to the I.P. with respect to Dissolution Test" (tested by DTL Bikaner). The notice is published at https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug.

I bought it on 12 July 2026, 11 days after the notice was published on 1 July 2026. Selling goods after they have been publicly identified as not of standard quality may amount to a deficiency in service or an unfair trade practice under the Consumer Protection Act, 2019.

I request a refund or a replacement. Please reply in writing within 15 days of receiving this letter.

A copy of the notice as published is kept by RecallIndia under reference ${CASE_ID}: SHA-256 ${SHA256}, signed with an AWS KMS key on 20 September 2026 and held in write-once storage until 19 October 2026. It can be produced on request.

Yours faithfully,

The purchaser
Prepared with RecallIndia, reference ${CASE_ID}
`;

const REASONING = "brand 'Forgo Pharmaceuticals' matches; product 'Paracetamol Tablets IP 650mg' fuzzy 100; batch FT5427 in listed [FT5427]";
const REASON = "failed CDSCO quality test, JUL-2026 alert, row 12; batch FT5427 in listed batches [FT5427]";
const KMS_KEY = "arn:aws:kms:ap-south-1:277025716889:key/e0712497-03c9-4f41-af7d-eaf3c4b3ab7f";
const S3_KEY = `evidence/${CASE_ID}/${SHA256}.bin`;
const RETAIN = "2026-10-19T23:58:31Z";

const AUDIT: AuditEntry[] = [
  { ts: "2026-09-19T23:58:24Z", event: "case.created", detail: { decision: "alert", seed: true } },
  { ts: "2026-09-19T23:58:24Z", event: "decision.alert", detail: { reason: REASON } },
  { ts: "2026-09-19T23:58:31Z", event: "approval.approved", detail: { note: "seeded, not a task token", approver: "seed:demo-household" } },
  { ts: "2026-09-19T23:58:32Z", event: "evidence.signed", detail: { kind: "portal_row", retain_until: RETAIN, sha256: SHA256, kms_key_id: KMS_KEY, snapshot_s3_key: S3_KEY, bytes: 671 } },
  { ts: "2026-09-19T23:58:39Z", event: "claim.drafted", detail: { sold_after_notice: true, template: "claim_letter.txt.j2", pdf_s3_key: `${CASE_ID}.pdf`, bytes: 3082, addressee: "pharmacy" } },
  { ts: "2026-09-19T23:58:40Z", event: "evidence.verified", detail: { valid: true, sha256: SHA256, key_id: KMS_KEY } },
];

/** The verified demo case (`case-1536.png`). */
export const DEMO_CASE: CaseRecord = {
  case_id: CASE_ID,
  status: "verified",
  created_at: "2026-09-19T23:58:24Z",
  item_id: DEMO_ITEM.item_id,
  notice_id: DEMO_NOTICE.pk,
  household_id: "demo",
  decision: "alert",
  approval: {
    status: "approved", approved_at: "2026-09-19T23:58:31Z", rejected_at: null, expired_at: null,
    approver: "seed:demo-household", reason: null, token_issued_at: "2026-09-19T23:58:24Z",
  },
  steps: {
    approve: { started_at: "2026-09-19T23:58:24Z", finished_at: "2026-09-19T23:58:31.000Z", error: null },
    seal_evidence: { started_at: "2026-09-19T23:58:31.000Z", finished_at: "2026-09-19T23:58:32.000Z", error: null },
    write_letter: { started_at: "2026-09-19T23:58:32.000Z", finished_at: "2026-09-19T23:58:38.900Z", error: null },
    verify: { started_at: "2026-09-19T23:58:38.900Z", finished_at: "2026-09-19T23:58:40.000Z", error: null },
  },
  evidence: {
    sha256: SHA256,
    signed_at: "2026-09-19T23:58:32Z",
    key_alias: "alias/recallindia-signing",
    signing_algorithm: "RSASSA_PKCS1_V1_5_SHA_256",
    object_lock_mode: "GOVERNANCE",
    object_lock_retain_until: RETAIN,
    snapshot_bytes: 671,
    snapshot_kind: "portal_row",
    snapshot_s3_key: S3_KEY,
    snapshot_version_id: "hvQf0.DVG4EYgpWsa2eB4x7HUe_jQohZ",
    source_url: "https://cdscoonline.gov.in/CDSCO/filteredNsqDrugTable?month=JUL-2026&source=All&tab=nsq",
    kms_key_id: KMS_KEY,
    content_type: "application/json",
  },
  claim_text: CLAIM_TEXT,
  claim_pdf_s3_key: `${CASE_ID}.pdf`,
  claim_created_at: "2026-09-19T23:58:39Z",
  claim_addressee: "pharmacy",
  quoted_sentence: RAW_ROW,
  range_check: { yours: "FT5427", listed: "FT5427", inside: true },
  reasoning: REASONING,
  reason: REASON,
  verifier: "deterministic",
  confidence: 0.95,
  sold_after_notice: true,
  audit: AUDIT,
  pending_snapshot_bytes: 671,
};

/** Page-load re-verify: "Last checked 15:08 IST". */
export const VERIFY_OK: VerifyResult = { valid: true, sha256: SHA256, recomputed_sha256: SHA256, checked_at: "2026-09-20T09:38:00Z", duration_ms: 1100 };

/** The live API's real tamper result (spec §9): byte 335, 0x6e → 0x6f, "Tested 15:09 IST". */
export const TAMPER: TamperResult = {
  valid: false, tampered: true, flipped_byte_index: 335, byte_before: 0x6e, byte_after: 0x6f,
  sha256: SHA256, recomputed_sha256: RECOMPUTED_SHA256, checked_at: "2026-09-20T09:39:12Z", demo_control: true, duration_ms: 900,
};

export const TAMPER_AUDIT: AuditEntry = {
  ts: TAMPER.checked_at, event: "evidence.tamper_test",
  detail: { flipped_byte_index: 335, byte_before: 0x6e, byte_after: 0x6f, valid: false, demo_control: true },
};

/** Jeep Compass 2022 on NHTSA 24V436000 — the vehicle variant of the header (CaseHeader kit row). */
export const JEEP_ITEM: Item = { item_id: "demo-jeep", kind: "vehicle", name: "Jeep Compass 2022", brand: "Jeep", make: "Jeep", model: "Compass", year: 2022, purchase_date: null };
export const JEEP_NOTICE: Notice = {
  notice_id: "24V436000", pk: "nhtsa#24V436000", source: "nhtsa",
  title: "Jeep/Chrysler rearview camera", product: "Jeep Compass", brand: "Chrysler (FCA US, LLC)", batches: [],
  mfg_date: null, exp_date: null, hazard_or_failed_test: "The radio software may prevent the rearview image from displaying.",
  lab: null, row_ref: null, published_at: "2024-06-13", url: "https://www.nhtsa.gov/recalls?nhtsaId=24V436000",
  raw_excerpt: "", remedy: null, model: "Compass", campaign: "24V436000", component: "BACK OVER PREVENTION", model_years: [2021, 2023],
};

/* ------------------------------------------------------------------ one builder per ?state= */

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Own-household case paused at the gate (`case-waiting-1536.png`). */
function waitingCase(): CaseRecord {
  const c = clone(DEMO_CASE);
  c.status = "waiting_approval";
  c.household_id = OWN_HOUSEHOLD.id;
  c.created_at = "2026-09-20T09:36:40Z";
  c.approval = { status: "pending", approved_at: null, rejected_at: null, expired_at: null, approver: null, reason: null, token_issued_at: "2026-09-20T09:36:40Z" };
  c.steps = { approve: { started_at: "2026-09-20T09:36:40Z", finished_at: null, error: null }, seal_evidence: none(), write_letter: none(), verify: none() };
  c.evidence = null;
  c.claim_text = null;
  c.claim_pdf_s3_key = null;
  c.claim_created_at = null;
  c.audit = [
    { ts: "2026-09-20T09:36:40Z", event: "case.created", detail: { decision: "alert" } },
    { ts: "2026-09-20T09:36:40Z", event: "decision.alert", detail: { reason: REASON } },
  ];
  return c;
}
function none() { return { started_at: null, finished_at: null, error: null }; }

/** Own household, mid-pipeline: approved 15:10:05 IST, the same 1.0 / 6.9 / 1.1 s timings. */
function runningCase(upTo: "approving" | "sealing" | "writing" | "verifying" | "verified"): CaseRecord {
  const c = waitingCase();
  const t = (s: number) => new Date(Date.parse("2026-09-20T09:40:05Z") + s * 1000).toISOString();
  c.approval = { ...c.approval, status: "approved", approved_at: t(0), approver: "user:hh_a41c" };
  c.steps.approve = { started_at: "2026-09-20T09:36:40Z", finished_at: t(0), error: null };
  c.status = upTo === "writing" ? "writing_letter" : upTo;
  c.audit.push({ ts: t(0), event: "approval.approved", detail: { approver: "user:hh_a41c" } });
  if (upTo === "approving") return c;
  c.steps.seal_evidence = { started_at: t(0), finished_at: null, error: null };
  if (upTo === "sealing") return c;
  c.steps.seal_evidence.finished_at = t(1);
  c.evidence = { ...clone(DEMO_CASE.evidence!), signed_at: t(1), object_lock_retain_until: new Date(Date.parse(t(0)) + 30 * 86_400_000).toISOString() };
  c.audit.push({ ts: t(1), event: "evidence.signed", detail: { kind: "portal_row", retain_until: c.evidence.object_lock_retain_until, sha256: SHA256, bytes: 671 } });
  c.steps.write_letter = { started_at: t(1), finished_at: null, error: null };
  if (upTo === "writing") return c;
  c.steps.write_letter.finished_at = t(7.9);
  c.claim_text = CLAIM_TEXT;
  c.claim_pdf_s3_key = `${CASE_ID}.pdf`;
  c.audit.push({ ts: t(7.9), event: "claim.drafted", detail: { pdf_s3_key: `${CASE_ID}.pdf`, bytes: 3082, addressee: "pharmacy" } });
  c.steps.verify = { started_at: t(7.9), finished_at: null, error: null };
  if (upTo === "verifying") return c;
  c.steps.verify.finished_at = t(9);
  c.audit.push({ ts: t(9), event: "evidence.verified", detail: { valid: true, sha256: SHA256 } });
  return c;
}

export function caseFixture(state: CaseUiState): CaseViewProps {
  const base: CaseViewProps = {
    state, caseRecord: DEMO_CASE, notice: DEMO_NOTICE, item: DEMO_ITEM, household: DEMO_HOUSEHOLD,
    nearMiss: NEAR_MISS, verify: VERIFY_OK, tamper: null, claimPdfUrl: null,
  };
  switch (state) {
    case "loading":
      return { ...base, caseRecord: null, notice: null, item: null };
    case "verified":
      return base;
    case "invalid":
      return { ...base, tamper: TAMPER, clientAudit: [TAMPER_AUDIT], bandInView: true };
    case "readonly":
      return { ...base, caseRecord: waitingCase(), verify: null };
    case "waiting":
      return { ...base, caseRecord: waitingCase(), household: OWN_HOUSEHOLD, verify: null };
    case "approving":
    case "sealing":
    case "writing":
    case "verifying":
      return { ...base, caseRecord: runningCase(state), household: OWN_HOUSEHOLD, verify: null, elapsedMs: { approving: 300, sealing: 900, writing: 4200, verifying: 8200 }[state] };
    case "rejected": {
      const c = waitingCase();
      c.status = "rejected";
      c.approval = { ...c.approval, status: "rejected", rejected_at: "2026-09-20T09:41:30Z" };
      c.audit.push({ ts: "2026-09-20T09:41:30Z", event: "approval.rejected", detail: { approver: "user:hh_a41c" } });
      return { ...base, caseRecord: c, household: OWN_HOUSEHOLD, verify: null };
    }
    case "expired": {
      const c = waitingCase();
      c.status = "expired";
      c.approval = { ...c.approval, status: "expired", expired_at: "2026-09-21T09:36:40Z" };
      return { ...base, caseRecord: c, household: OWN_HOUSEHOLD, verify: null };
    }
    case "failed": {
      const c = runningCase("writing");
      c.steps.write_letter.error = "PDF render timed out after 15 s";
      return { ...base, caseRecord: c, household: OWN_HOUSEHOLD, verify: null };
    }
  }
}

/** The verified own-household run (what `verifying` resolves to in the video). */
export const OWN_VERIFIED_CASE = runningCase("verified");
