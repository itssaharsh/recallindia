"use client";

import { ArrowLeft, ArrowUpRight, CloudOff, Scale, SearchX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { RangeBar } from "@/components/common/range-bar";
import { SourceChip } from "@/components/common/source-chip";
import { FoilChip } from "@/components/common/foil-chip";
import { SourceExcerpt } from "@/components/common/source-excerpt";
import { useAppState } from "@/components/shell/app-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, DEMO_HOUSEHOLD, apiGet, apiPost } from "@/lib/api";
import {
  CASE_CHIP,
  IN_FLIGHT,
  citation,
  datesLine,
  outcomeLine,
  outcomeSubLine,
  pipelineState,
  snapshotNoun,
} from "@/lib/case";
import { fmtDay, riskSentence, sourceLabel } from "@/lib/format";
import type { Case, CheckStatus, Item, Notice } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

import { ApprovalGate } from "./approval-gate";
import { ClaimLetterPreview } from "./claim-letter-preview";
import { CertificatePlaceholder, EvidenceCertificate } from "./evidence-certificate";
import { PipelineSteps } from "./pipeline-steps";
import { ShowWork } from "./show-work";

const enc = encodeURIComponent;
const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A static export has no /case/[id] pages to pre-render, so the id comes from ?id= or, behind
 *  the Amplify rewrite /case/<id> -> /case/, from the path itself. */
function caseIdFromLocation(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get("id");
  if (fromQuery) return fromQuery;
  const match = window.location.pathname.match(/^\/case\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

const TONE: Record<"hold" | "clear" | "muted", string> = {
  hold: "text-warning",
  clear: "text-success",
  muted: "text-muted",
};

function StatusChip({ c }: { c: Case }) {
  const chip = CASE_CHIP[c.status ?? "matching"];
  if (!chip) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-medium tracking-[0.08em] uppercase ${TONE[chip.tone]}`}
    >
      {c.status === "waiting_approval" && (
        <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-warning" />
      )}
      {chip.label}
    </span>
  );
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-line py-2 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className={`min-w-0 text-ink ${mono ? "font-mono text-[12.5px]" : ""}`}>{children}</dd>
    </div>
  );
}

/**
 * S4 `/case/?id=<case>`: one match, start to finish. The outcome in display type (C-15), the
 * regulator's own row with our highlight (C-13), where your unit falls (C-12), the human gate
 * (C-16), the pipeline as the server records it (C-17), the letter (C-18), the signed evidence
 * with its tamper test (C-19), and the audit behind "Show work" (C-20).
 */
export function CaseView() {
  const { demo, ready, href, household, makeCopy } = useAppState();
  const [id, setId] = useState<string | null | undefined>(undefined);
  const [kase, setCase] = useState<Case | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [status, setStatus] = useState<CheckStatus | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const certificate = useRef<HTMLDivElement>(null);

  useEffect(() => setId(caseIdFromLocation()), []);

  useEffect(() => {
    if (!ready || !id) return;
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      try {
        const c = await apiGet<Case>(`/cases/${enc(id)}`, demo, signal);
        setCase(c);
        const [it, n, st] = await Promise.all([
          apiGet<Item>(`/items/${enc(c.item_id)}`, demo, signal).catch(() => null),
          c.notice_id ? apiGet<Notice>(`/v1/notices/${enc(c.notice_id)}`, demo, signal).catch(() => null) : null,
          apiGet<CheckStatus>(`/items/${enc(c.item_id)}/check-status`, demo, signal).catch(() => null),
        ]);
        if (signal.aborted) return;
        setItem(it);
        setNotice(n);
        setStatus(st);
      } catch (err) {
        if (!signal.aborted) setLoadError(err instanceof Error ? err : new Error(String(err)));
      }
    })();
    return () => controller.abort();
  }, [ready, id, demo, household]);

  // while the pipeline runs, the case itself is the truth: poll it once a second (UI-SPEC S4)
  const running = Boolean(kase?.status && IN_FLIGHT.has(kase.status));
  usePoll(
    async (signal) => {
      if (!kase) return;
      const fresh = await apiGet<Case>(`/cases/${enc(kase.case_id)}`, demo, signal);
      if (!signal.aborted) setCase(fresh);
    },
    1_000,
    running,
  );

  useEffect(() => {
    if (item?.name) document.title = `${item.name} · Case · RecallIndia`;
  }, [item?.name]);

  // the seal is the point of the page: when the last step starts, scroll it into view so the
  // stamp lands where the viewer is looking (never under reduced motion)
  useEffect(() => {
    if (kase?.status !== "verifying") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    certificate.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [kase?.status]);

  const answer = useCallback(
    async (approve: boolean) => {
      if (!kase) return;
      setAnswerError(null);
      setBusy(approve ? "approve" : "reject");
      try {
        const body = await apiPost<{ case: Case | null }>(
          `/cases/${enc(kase.case_id)}/${approve ? "approve" : "reject"}`,
          undefined,
          demo,
        );
        if (body.case) setCase(body.case);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // a 409 is not an error to the reader: somebody already answered, so show what is true
        if (err instanceof ApiError && err.status === 409) {
          try {
            setCase(await apiGet<Case>(`/cases/${enc(kase.case_id)}`, demo));
          } catch {
            setAnswerError(`Couldn't reach the approval step (${message}). Try again.`);
          }
        } else {
          setAnswerError(`Couldn't reach the approval step (${message}). Try again.`);
        }
      } finally {
        setBusy(null);
      }
    },
    [kase, demo],
  );

  const steps = useMemo(() => (kase ? pipelineState(kase) : []), [kase]);

  if (id === undefined || (id && !kase && !loadError)) return <CaseSkeleton />;

  const back = (
    <Link
      href={href("/mine/")}
      className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface-1 px-3 text-sm font-medium text-ink hover:bg-surface-2"
    >
      Back to my things
    </Link>
  );
  if (!id) {
    return (
      <EmptyState
        icon={Scale}
        what="No case chosen"
        why="A case opens from an item that is on a notice."
        action={back}
      />
    );
  }
  if (loadError || !kase) {
    const missing = loadError instanceof ApiError && loadError.status === 404;
    return (
      <EmptyState
        icon={missing ? SearchX : CloudOff}
        tone={missing ? "neutral" : "error"}
        what={missing ? "That case isn't in this household" : "Couldn't load this case"}
        why={
          missing
            ? "The link may belong to another household, or the item was checked again and this case was replaced."
            : `The API didn't answer (${loadError?.message ?? "no answer"}). Your household is unchanged.`
        }
        action={back}
      />
    );
  }

  const c = kase;
  const dates = datesLine(item, notice);
  const excerpt = notice?.raw_excerpt || c.quoted_sentence || "";
  const unit = item?.batch ? "batch" : item?.serial ? "serial" : item?.kind === "vehicle" ? "model year" : "unit";
  const subLine = outcomeSubLine(c, item, notice);
  const isAlert = c.decision === "alert";
  // the signature visual: the code on the strip, or the model year for a vehicle
  const chipCode = item?.batch || item?.serial || (item?.kind === "vehicle" && item.year ? String(item.year) : "");
  // the demo household's case is readable by anyone and answerable by nobody
  const readOnly = demo || (c.household_id ?? DEMO_HOUSEHOLD) === DEMO_HOUSEHOLD;

  return (
    <article aria-labelledby="case-title" className="mx-auto max-w-[1200px] px-5 py-5 md:py-7">
      <nav aria-label="Case" className="mb-5 flex items-center justify-between gap-3">
        <Link
          href={href("/mine/")}
          className="inline-flex items-center gap-1 rounded-sm text-[13px] text-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-3.5" /> My things
          {item?.name ? <span className="text-muted"> / {item.name}</span> : null}
        </Link>
        <StatusChip c={c} />
      </nav>

      <header className="space-y-3 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {notice && <SourceChip notice={notice} />}
          {c.created_at && <span className="text-xs text-muted">case opened {fmtDay(c.created_at)}</span>}
          <span className="font-mono text-[11px] break-all text-muted">{c.case_id}</span>
        </div>
        <h1
          id="case-title"
          className="max-w-4xl font-display text-[32px] leading-[1.06] font-semibold text-balance text-ink md:text-[40px]"
        >
          {outcomeLine(c, item, notice)}
        </h1>
        {subLine && <p className="max-w-2xl text-[15px] text-muted">{subLine}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {chipCode && <FoilChip code={chipCode} size="lg" />}
          {dates && (
            <p className="font-mono text-[13px] text-ink">
              {dates}
              {c.sold_after_notice && (
                <>
                  <span className="text-muted"> → </span>
                  <strong className="font-bold text-ink">sold after notice</strong>
                </>
              )}
            </p>
          )}
        </div>
      </header>

      <div className="grid gap-8 py-6 xl:grid-cols-[minmax(0,760px)_360px] xl:gap-10">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="notice-heading" className="min-w-0 space-y-4">
            <div className="space-y-1">
              <h2 id="notice-heading" className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">
                The notice
              </h2>
              {notice && (
                <p className="font-display text-lg leading-snug font-semibold text-ink">{sentence(citation(notice))}</p>
              )}
            </div>
            {excerpt && (
              <SourceExcerpt
                excerpt={excerpt}
                quote={c.quoted_sentence}
                caption={
                  notice ? (
                    <>
                      {sourceLabel(notice.source)}&apos;s own words, published {fmtDay(notice.published_at)}
                      {notice.url && (
                        <>
                          {" · "}
                          <a
                            href={notice.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-primary hover:underline"
                          >
                            open the regulator&apos;s page <ArrowUpRight aria-hidden className="size-3" />
                          </a>
                        </>
                      )}
                    </>
                  ) : (
                    "The sentence the verifier matched"
                  )
                }
              />
            )}
            {notice && (
              <dl>
                {notice.source === "cdsco_nsq"
                  ? notice.hazard_or_failed_test && <Field label="Failed test">{notice.hazard_or_failed_test}</Field>
                  : riskSentence(notice) && <Field label="Hazard">{riskSentence(notice)}</Field>}
                {notice.lab && <Field label="Tested by">{notice.lab}</Field>}
                <Field label="Remedy">
                  {notice.remedy || (
                    <span className="text-muted">
                      Not stated by the source: the letter asks for a refund or a replacement
                    </span>
                  )}
                </Field>
                {(notice.mfg_date || notice.exp_date) && (
                  <Field label="Mfg · Exp" mono>
                    {notice.mfg_date ?? "—"} · {notice.exp_date ?? "—"}
                  </Field>
                )}
              </dl>
            )}
            {c.range_check && (
              <div className="space-y-2">
                <h3 className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">
                  Your {unit} against the list
                </h3>
                <RangeBar check={c.range_check} />
              </div>
            )}
          </section>

          {isAlert && (
            <ApprovalGate
              c={c}
              item={item}
              notice={notice}
              busy={busy}
              error={answerError}
              demoReadOnly={readOnly}
              onApprove={() => answer(true)}
              onReject={() => answer(false)}
              onMakeCopy={() => makeCopy()}
            />
          )}

          {isAlert && (c.claim_pdf_s3_key || c.status === "writing_letter") && (
            <ClaimLetterPreview c={c} item={item} demo={demo} writing={!c.claim_pdf_s3_key} />
          )}

          {isAlert && (
            <div ref={certificate} className="scroll-mt-6">
              {c.evidence ? (
                <EvidenceCertificate caseId={c.case_id} evidence={c.evidence} demo={demo} />
              ) : (
                <CertificatePlaceholder
                  why={
                    c.status === "sealing"
                      ? `Sealing ${snapshotNoun(notice)} now: a write-once copy in S3, its SHA-256, and a KMS signature over it.`
                      : c.status === "rejected" || c.status === "expired"
                        ? `Nothing was sealed: this case was ${c.status}.`
                        : `Sealed after you approve: a write-once copy of ${snapshotNoun(notice)}, its SHA-256, and a KMS signature over it.`
                  }
                />
              )}
            </div>
          )}

          {!isAlert && (
            <div className="space-y-2 rounded-md border border-line bg-surface-1 p-4 md:p-5">
              <p className="text-[14px] leading-relaxed text-ink">
                {c.decision === "dismiss" ? "Dismissed" : "On hold"}: {c.reason}.
              </p>
              <p className="text-[13px] leading-relaxed text-muted">
                {c.decision === "dismiss"
                  ? `The notice is about the same product, but it does not list your ${unit}. There is nothing to approve.`
                  : "A rule needs one more detail before it can decide. Add it on My things and check the item again."}
              </p>
            </div>
          )}
        </div>

        {isAlert && (
          <aside aria-labelledby="case-file" className="min-w-0 xl:sticky xl:top-6 xl:self-start">
            <div className="space-y-4 rounded-md border border-line bg-surface-1 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 id="case-file" className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">
                  Case file
                </h2>
                <StatusChip c={c} />
              </div>
              <PipelineSteps steps={steps} />
              <dl className="space-y-1.5 border-t border-line pt-3 text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Item</dt>
                  <dd className="min-w-0 truncate text-ink">{item?.name ?? c.item_id}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Notice</dt>
                  <dd className="min-w-0 truncate font-mono text-ink">{notice?.notice_id ?? c.notice_id}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Source</dt>
                  <dd className="text-ink">{notice ? sourceLabel(notice.source) : "—"}</dd>
                </div>
              </dl>
            </div>
          </aside>
        )}
      </div>

      <ShowWork c={c} item={item} notice={notice} steps={status?.steps ?? null} />
    </article>
  );
}

function CaseSkeleton() {
  return (
    <div
      aria-busy
      className="mx-auto max-w-6xl space-y-6 px-5 py-5 md:py-7"
      role="status"
      aria-label="Loading the case"
    >
      <Skeleton className="h-4 w-24" />
      <div className="space-y-3 border-b border-line pb-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,760px)_360px]">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
