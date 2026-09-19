# ADR-007 — Evidence is an Object Lock snapshot signed with KMS, not a hash in the database

(The brief asked for this as ADR-006; that number already records the Decide / "clear" decision,
so this one is ADR-007.)

## Context
A claim letter says "your shop sold me a batch that was on this notice." Weeks later the seller,
a consumer forum or the user may need proof of what the notice said on the day. Government pages
change: CDSCO re-pulls and edits the current month's portal list, archive PDFs move, and US
recall pages are revised. The claim needs a copy of the source that nobody can quietly change,
including the people who run RecallIndia.

The obvious shortcut is to store a SHA-256 of the notice in the `cases` table. That proves
nothing: anyone with write access to the table can change the hash along with the file. A hash
only means something if the bytes it covers cannot be replaced, and if the hash itself carries a
signature that only a key outside the database can produce.

## Decision
- **Snapshot the source, not our summary of it.** The snapshot is the source's own bytes:
  - A CDSCO archive notice: the alert PDF.
  - A CDSCO portal notice: its row of the month's portal JSON, re-fetched and matched through the
    same mapping Normalise uses.
  - NHTSA, CPSC and openFDA: the recall record as their APIs serve it.
  - If the source cannot be fetched, the notice as ingested is used instead, labelled
    `stored_notice`, and the audit records why.
- **Write-once storage.** The snapshot goes to the evidence bucket with S3 Object Lock in
  GOVERNANCE mode, retained for 30 days (`ObjectLockMode` and `ObjectLockRetainUntilDate` are set
  on the PUT, and the bucket's default rule says the same). Nobody can overwrite or delete that
  object version before the date. The one exception is a principal holding
  `s3:BypassGovernanceRetention` who sends the bypass header explicitly; no role in this stack has
  that permission.
- **Signed, not just hashed.**
  - The SHA-256 of those exact bytes is signed by an AWS KMS asymmetric key (RSA_2048,
    `RSASSA_PKCS1_V1_5_SHA_256`, `MessageType=DIGEST`).
  - The private half never leaves KMS. `kms:Sign` is granted only to the Evidence Lambda;
    `kms:Verify` to the Evidence Lambda and the API.
  - The case stores `{sha256, kms_key_id, signature_b64, object_lock_retain_until,
    snapshot_s3_key, snapshot_version_id, signed_at}`.
- **Verification is a live re-check.** `GET /cases/{id}/verify-evidence` reads the exact object
  version back, hashes it again, and asks KMS `Verify`. `?tamper=1` flips one byte of the
  downloaded copy in memory before hashing, and the response labels it as a demo control. It
  shows that a one-byte change breaks the signature; nothing stored changes.

## Consequences
- **Cost.** One KMS key (about $1 a month), one Sign per approved claim and one Verify per check.
  Object Lock needs versioning, so the evidence bucket keeps every version, and CloudFormation
  retains the bucket on stack delete, because a locked bucket cannot be emptied.
- **GOVERNANCE, not COMPLIANCE.** GOVERNANCE lets an administrator with the bypass permission
  clean up a hackathon account. COMPLIANCE would not let even the root user delete an object
  before its date. Going to production would mean COMPLIANCE and a longer retention.
- **Demo mode.** DEMO_MODE has no KMS. It signs with an HMAC under the key id `demo-local-hmac`,
  so a demo signature can never be mistaken for a KMS one, and it writes a `.retention.json`
  sidecar in place of a real lock.
- **What the evidence proves.** It proves what the source served when RecallIndia sealed it,
  after the case was approved. It does not prove what the source showed on the day the item was
  bought. The notice's own `published_at` and the ingest history cover that.
