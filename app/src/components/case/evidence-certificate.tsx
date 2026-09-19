"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { SNAPSHOT_KIND, fmtBytes, fmtUtc } from "@/lib/case";
import { CROSSFADE, STAMP } from "@/lib/motion";
import type { Evidence, VerifyResult } from "@/lib/types";

const CAPTION = "Snapshot is write-once for 30 days (S3 Object Lock) and signed with an AWS KMS asymmetric key.";
const short = (sha?: string | null) => (sha ? `${sha.slice(0, 12)}…` : "—");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 min-w-0 break-all text-text">{children}</dd>
    </>
  );
}

/** VERIFIED in clear green / SIGNATURE INVALID in alert red. Every new answer presses the stamp
 *  down again (scale 1.15 -> 1, tilted 6°, 300 ms); reduced motion crossfades. */
function Stamp({ result, busy }: { result: VerifyResult | null; busy: boolean }) {
  const reduce = useReducedMotion();
  const label = !result ? "Verifying" : result.valid ? "Verified" : "Signature invalid";
  const tone = !result ? "border-line text-muted" : result.valid ? "border-clear text-clear" : "border-alert text-alert";
  const press = reduce
    ? { initial: { opacity: 0, rotate: 6 }, animate: { opacity: 1, rotate: 6 }, transition: CROSSFADE }
    : { initial: { opacity: 0, scale: 1.15, rotate: 6 }, animate: { opacity: 1, scale: 1, rotate: 6 }, transition: STAMP };
  return (
    <div className={`flex min-h-16 items-center justify-center px-2 transition-opacity ${busy ? "opacity-40" : ""}`} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={result ? `${result.valid}-${result.checked_at}` : "pending"}
          {...press}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          className={`inline-block border-4 border-double px-3.5 py-1.5 font-mono text-[15px] font-semibold tracking-[0.2em] whitespace-nowrap uppercase ${tone}`}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/**
 * The signed proof, as a record (radius 0, mono). The stamp is a live answer: on mount the API
 * re-reads the locked snapshot version, re-hashes it and asks KMS Verify. "Tamper test" asks the
 * same with one byte flipped in memory (a labelled demo control); clicking again re-verifies the
 * original.
 */
export function EvidenceCertificate({ caseId, evidence, demo }: { caseId: string; evidence: Evidence; demo: boolean }) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(
    async (tamper: boolean, signal?: AbortSignal) => {
      setBusy(true);
      setError(null);
      try {
        const path = `/cases/${encodeURIComponent(caseId)}/verify-evidence${tamper ? "?tamper=1" : ""}`;
        setResult(await apiGet<VerifyResult>(path, demo, signal));
      } catch (err) {
        if (!signal?.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [caseId, demo],
  );

  useEffect(() => {
    const controller = new AbortController();
    verify(false, controller.signal);
    return () => controller.abort();
  }, [verify, evidence.sha256]);

  const tampered = result?.tampered === true;
  return (
    <figure className="m-0">
      <section aria-labelledby="certificate-title" className="border border-line bg-surface-1 font-mono">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
          <h2 id="certificate-title" className="m-0 text-[11px] font-medium tracking-[0.14em] text-evidence uppercase">
            Evidence certificate
          </h2>
          <span className="text-[11px] text-muted">{caseId}</span>
        </header>
        <div className="grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_15rem]">
          <dl className="m-0 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[12px] leading-snug sm:grid-cols-[8rem_minmax(0,1fr)]">
            <Row label="SHA-256">{evidence.sha256}</Row>
            <Row label="KMS key">{evidence.kms_key_id}</Row>
            <Row label="Algorithm">{evidence.signing_algorithm ?? "RSASSA_PKCS1_V1_5_SHA_256"}</Row>
            <Row label="Retain until">
              {fmtUtc(evidence.object_lock_retain_until)} · Object Lock {evidence.object_lock_mode ?? "GOVERNANCE"}
            </Row>
            <Row label="Signed at">{fmtUtc(evidence.signed_at)}</Row>
            <Row label="Snapshot">
              {evidence.snapshot_s3_key}
              {evidence.snapshot_bytes ? ` · ${fmtBytes(evidence.snapshot_bytes)}` : ""}
              {evidence.snapshot_kind && (
                <span className="mt-0.5 block font-sans text-[12px] text-muted">{SNAPSHOT_KIND[evidence.snapshot_kind] ?? evidence.snapshot_kind}</span>
              )}
            </Row>
            {evidence.snapshot_version_id && <Row label="Version">{evidence.snapshot_version_id}</Row>}
          </dl>
          <div className="flex flex-col items-stretch gap-3 border-t border-line pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-5">
            <Stamp result={error ? null : result} busy={busy} />
            <p className="m-0 min-h-10 text-center text-[11px] leading-snug text-muted">
              {error
                ? `Could not verify: ${error}`
                : !result
                  ? "Re-reading the locked snapshot and asking KMS Verify…"
                  : result.valid
                    ? `KMS Verify: the snapshot hashes to the signed digest · ${fmtUtc(result.checked_at).slice(11)}${demo ? " (recorded)" : ""}`
                    : `KMS Verify: the copy hashes to ${short(result.sha256)}, the signature covers ${short(result.recorded_sha256)}`}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="font-sans"
              disabled={busy}
              onClick={() => verify(!tampered)}
              title="Demo control: flips one byte of the downloaded copy in memory; nothing stored changes"
            >
              {busy ? "Verifying…" : tampered ? "Verify the original" : "Tamper test"}
            </Button>
          </div>
        </div>
        {tampered && result?.demo_control && (
          <p className="m-0 border-t border-line px-4 py-2 font-sans text-xs text-muted">
            <span className="text-hold">Demo control</span>: {result.demo_control.replace(/^demo control:\s*/i, "")}.
          </p>
        )}
      </section>
      <figcaption className="mt-2 text-xs text-muted">{CAPTION}</figcaption>
    </figure>
  );
}

/** Before the evidence exists: what will be here, and what makes it. */
export function CertificatePlaceholder({ why }: { why: string }) {
  return (
    <figure className="m-0">
      <section aria-label="Evidence certificate" className="border border-dashed border-line px-4 py-3.5 font-mono">
        <p className="m-0 text-[11px] font-medium tracking-[0.14em] text-muted uppercase">Evidence certificate</p>
        <p className="m-0 mt-1.5 font-sans text-[13px] text-muted">{why}</p>
      </section>
      <figcaption className="mt-2 text-xs text-muted">{CAPTION}</figcaption>
    </figure>
  );
}
