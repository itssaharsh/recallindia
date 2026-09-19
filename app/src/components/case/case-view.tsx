"use client";

import { ArrowLeft, ArrowUpRight, CloudOff, Scale, SearchX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { RangeBar } from "@/components/common/range-bar";
import { SourceChip } from "@/components/common/source-chip";
import { SourceExcerpt } from "@/components/common/source-excerpt";
import { StatusTag, type Tone } from "@/components/common/status-tag";
import { useAppState } from "@/components/shell/app-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiGet, apiHost, apiPost } from "@/lib/api";
import {
  approvalStepsFromCase,
  canReplay,
  citation,
  datesLine,
  mergeSteps,
  outcomeLine,
  replayCase,
  replayTimings,
  sealed,
  snapshotNoun,
  withCurrent,
} from "@/lib/case";
import { fmtDay, riskSentence, sourceLabel } from "@/lib/format";
import type { Approval, Case, CheckStatus, ClaimLink, Item, Notice } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

import { ApprovalPanel } from "./approval-panel";
import { CertificatePlaceholder, EvidenceCertificate } from "./evidence-certificate";
import { ShowWork } from "./show-work";

const enc = encodeURIComponent;
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "ABORTED"]);
const SEAL_LIMIT_MS = 120_000; // Claim + Evidence take ~5 s warm, ~15 s cold
const OPENING_MS = 120_000; // an alert case this young may still be starting WaitForApproval

const TAG: Record<Case["decision"], { tone: Tone; label: string }> = {
  alert: { tone: "alert", label: "Alert" },
  hold: { tone: "hold", label: "Hold" },
  dismiss: { tone: "dismissed", label: "Dismissed" },
};

const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A static export has no /case/[id] pages to pre-render, so the id comes from ?id= or, behind
 *  the Amplify rewrite /case/<id> -> /case/, from the path itself. */
function caseIdFromLocation(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get("id");
  if (fromQuery) return fromQuery;
  const match = window.location.pathname.match(/^\/case\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** The check-status answer is about this case only if it is the same execution. */
const sameRun = (status: CheckStatus | null, c: Case | null) =>
  Boolean(status && c && (c.execution_arn ? status.execution_arn === c.execution_arn : status.case_id === c.case_id));

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-line py-2 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className={`min-w-0 text-text ${mono ? "font-mono text-[12.5px]" : ""}`}>{children}</dd>
    </div>
  );
}

/**
 * /case/?id=<case> (and /case/<case>): one finding, start to finish. The answer in display type;
 * the notice's own words with the matched sentence and the range bar; the human gate (Approve /
 * Reject) that releases the paused Step Functions execution; the claim letter; the signed
 * evidence certificate with its tamper test; and, behind "Show work", the chain and the audit.
 */
export function CaseView() {
  const { demo, ready, href } = useAppState();
  const [id, setId] = useState<string | null | undefined>(undefined);
  const [kase, setCase] = useState<Case | null>(null);
  // demo data: the recorded, sealed case, replayed from the moment it waited (stage 0..3)
  const [recorded, setRecorded] = useState<Case | null>(null);
  const [stage, setStage] = useState(0);
  const [item, setItem] = useState<Item | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [status, setStatus] = useState<CheckStatus | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [busy, setBusy] = useState<"approve" | "reject" | "claim" | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [sealingSince, setSealingSince] = useState<number | null>(null);
  const [openingDone, setOpeningDone] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const resumed = useRef(false);

  useEffect(() => setId(caseIdFromLocation()), []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!ready || !id) return;
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      try {
        const c = await apiGet<Case>(`/cases/${enc(id)}`, demo, signal);
        setRecorded(demo && canReplay(c) ? c : null);
        setCase(c);
        setLoadedAt(Date.now());
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
  }, [ready, id, demo]);

  const shown = useMemo(() => (recorded ? replayCase(recorded, stage) : kase), [recorded, stage, kase]);
  const run = sameRun(status, shown);

  const steps = useMemo(() => {
    if (!shown) return [];
    const fromCase = approvalStepsFromCase(shown);
    if (recorded) return withCurrent(fromCase);
    const merged = mergeSteps(fromCase, run ? status?.approval_steps : null);
    return sealingSince !== null ? withCurrent(merged) : merged;
  }, [shown, recorded, run, status, sealingSince]);

  // opened mid-way (a reload while the letter is drafted): pick the progress up again
  useEffect(() => {
    if (resumed.current || recorded || !kase) return;
    resumed.current = true;
    if (kase.approval?.status === "approved" && !sealed(approvalStepsFromCase(kase))) setSealingSince(Date.now());
  }, [kase, recorded]);

  // after Approve: the real step states from check-status every 1.5 s, and the case as it fills
  usePoll(
    async (signal) => {
      if (!kase) return;
      const [st, fresh] = await Promise.all([
        apiGet<CheckStatus>(`/items/${enc(kase.item_id)}/check-status`, demo, signal).catch(() => null),
        apiGet<Case>(`/cases/${enc(kase.case_id)}`, demo, signal),
      ]);
      if (signal.aborted) return;
      if (st) setStatus(st);
      setCase(fresh);
      const mine = sameRun(st, fresh);
      const over = sealed(mergeSteps(approvalStepsFromCase(fresh), mine ? st?.approval_steps : null));
      if (over || (mine && TERMINAL.has(String(st?.status)))) {
        setSealingSince(null);
      } else if (Date.now() - (sealingSince ?? Date.now()) > SEAL_LIMIT_MS) {
        setSealingSince(null);
        setAnswerError("The letter and the evidence are taking longer than usual. Reload the page in a minute to see them.");
      }
    },
    1_500,
    sealingSince !== null && !recorded,
  );

  // an alert case a moment old: its WaitForApproval task is still storing the token
  const opening =
    !demo &&
    !openingDone &&
    kase?.decision === "alert" &&
    !kase.approval &&
    Boolean(kase.created_at) &&
    loadedAt - Date.parse(kase.created_at ?? "") < OPENING_MS;
  usePoll(
    async (signal) => {
      if (!kase) return;
      const fresh = await apiGet<Case>(`/cases/${enc(kase.case_id)}`, demo, signal);
      if (signal.aborted) return;
      setCase(fresh);
      if (fresh.approval || Date.now() - loadedAt > OPENING_MS) setOpeningDone(true);
    },
    1_500,
    opening,
  );

  useEffect(() => {
    if (item?.name) document.title = `${item.name} · Case · RecallIndia`;
  }, [item?.name]);

  const refresh = useCallback(async () => {
    if (!kase) return;
    try {
      setCase(await apiGet<Case>(`/cases/${enc(kase.case_id)}`, demo));
    } catch {
      // the error line already says what failed
    }
  }, [kase, demo]);

  const answer = useCallback(
    async (approve: boolean) => {
      if (!shown) return;
      setAnswerError(null);
      if (recorded) {
        if (!approve) return; // demo data is read-only: rejecting runs on the live API
        const { claim, evidence } = replayTimings(recorded);
        setStage(1);
        timers.current.push(
          setTimeout(() => setStage(2), claim),
          setTimeout(() => setStage(3), evidence),
        );
        return;
      }
      setBusy(approve ? "approve" : "reject");
      try {
        const body = await apiPost<{ case_id: string; approval: Approval | null; warning?: string }>(
          `/cases/${enc(shown.case_id)}/${approve ? "approve" : "reject"}`,
          undefined,
          demo,
        );
        setCase((prev) => (prev && body.approval ? { ...prev, approval: body.approval } : prev));
        if (approve) setSealingSince(Date.now());
        if (body.warning) setAnswerError(body.warning);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setAnswerError(`Could not ${approve ? "approve" : "reject"}: ${message}`);
        if (err instanceof ApiError && err.status === 409) refresh(); // answered elsewhere: show what is true
      } finally {
        setBusy(null);
      }
    },
    [shown, recorded, demo, refresh],
  );

  const openClaim = useCallback(async () => {
    if (!shown) return;
    setClaimError(null);
    // open the tab inside the click (a tab opened after an await is a blocked pop-up), then
    // point it at a fresh presigned link: the link lives 10 minutes, the page may live longer
    const tab = window.open("", "_blank");
    setBusy("claim");
    try {
      const link = await apiGet<ClaimLink>(`/cases/${enc(shown.case_id)}/claim`, demo);
      const url = new URL(link.url, window.location.href).toString();
      if (tab) {
        tab.opener = null;
        tab.location.replace(url);
      } else {
        window.location.assign(url);
      }
    } catch (err) {
      tab?.close();
      setClaimError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [shown, demo]);

  if (id === undefined || (id && !shown && !loadError)) return <CaseSkeleton />;

  const back = (
    <Link
      href={href("/mine/")}
      className="inline-flex h-8 items-center rounded-sm border border-line px-2.5 text-sm font-medium text-text hover:bg-surface-2"
    >
      Back to my things
    </Link>
  );
  if (!id) {
    return (
      <EmptyState icon={Scale} what="No case chosen" why="A case opens from an item that is on a notice, on My things." action={back} />
    );
  }
  if (loadError || !shown) {
    const missing = loadError instanceof ApiError && loadError.status === 404;
    return (
      <EmptyState
        icon={missing ? SearchX : CloudOff}
        tone={missing ? "neutral" : "error"}
        what={missing ? `There is no case ${id}` : `Couldn't load case ${id}`}
        why={
          missing
            ? "The link is wrong, or the item was checked again and this case was replaced (a reset of the demo items makes new cases)."
            : `${apiHost()} answered: ${loadError?.message ?? "no answer"}.`
        }
        action={back}
      />
    );
  }

  const c = shown;
  const tag = TAG[c.decision] ?? TAG.hold;
  const dates = datesLine(item, notice);
  const excerpt = notice?.raw_excerpt || c.quoted_sentence || "";
  const unit = item?.batch ? "batch" : item?.serial ? "serial" : item?.kind === "vehicle" ? "model year" : "unit";
  const itemLine = item
    ? [
        item.name,
        item.kind !== "vehicle" ? item.brand : null,
        item.batch && `batch ${item.batch}`,
        item.serial && `serial ${item.serial}`,
        item.kind === "vehicle" && item.year ? `model year ${item.year}` : null,
        item.reg_no,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const approval = c.approval?.status;

  return (
    <article aria-labelledby="case-title" className="mx-auto max-w-6xl px-5 py-5 md:py-7">
      <nav aria-label="Case" className="mb-5 flex items-center justify-between gap-3">
        <Link href={href("/mine/")} className="inline-flex items-center gap-1 rounded-sm text-[13px] text-muted hover:text-text">
          <ArrowLeft aria-hidden className="size-3.5" /> My things
        </Link>
        <span className="truncate font-mono text-[11px] text-muted">{c.case_id}</span>
      </nav>

      <header className="space-y-3 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusTag tone={tag.tone} label={tag.label} />
          {notice && <SourceChip notice={notice} />}
          {c.created_at && <span className="text-xs text-muted">case opened {fmtDay(c.created_at)}</span>}
        </div>
        <h1 id="case-title" className="max-w-4xl font-display text-[32px] leading-[1.06] font-semibold text-balance text-text md:text-5xl">
          {outcomeLine(c, item, notice)}
        </h1>
        {dates && (
          <p className="font-mono text-[13px] text-text">
            {dates}
            {c.sold_after_notice && (
              <>
                <span className="text-muted"> → </span>
                <strong className="font-semibold text-alert">sold after notice</strong>
              </>
            )}
          </p>
        )}
        {itemLine && <p className="text-sm text-muted">{itemLine}</p>}
      </header>

      <div className="grid gap-8 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-10">
        <section aria-labelledby="notice-heading" className="min-w-0 space-y-4">
          <div className="space-y-1">
            <h2 id="notice-heading" className="font-mono text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
              The notice
            </h2>
            {notice && <p className="font-display text-lg leading-snug font-semibold text-text">{sentence(citation(notice))}</p>}
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
                          className="inline-flex items-center gap-0.5 text-primary-strong hover:underline"
                        >
                          open at {sourceLabel(notice.source)} <ArrowUpRight aria-hidden className="size-3" />
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
                : riskSentence(notice) && <Field label="Risk">{riskSentence(notice)}</Field>}
              {notice.lab && <Field label="Tested by">{notice.lab}</Field>}
              <Field label="Remedy">
                {notice.remedy || <span className="text-muted">Not stated by the source: the letter asks for a refund or replacement</span>}
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
              <h3 className="font-mono text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
                Your {unit} against the list
              </h3>
              <RangeBar check={c.range_check} />
            </div>
          )}
        </section>

        <section aria-labelledby="answer-heading" className="min-w-0 space-y-2">
          <h2 id="answer-heading" className="font-mono text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            {c.decision === "alert" ? "Your answer" : "Decision"}
          </h2>
          {c.decision === "alert" ? (
            <ApprovalPanel
              c={c}
              item={item}
              notice={notice}
              steps={steps}
              busy={busy}
              error={answerError}
              demo={demo}
              replay={recorded !== null}
              opening={opening}
              onApprove={() => answer(true)}
              onReject={() => answer(false)}
              onOpenClaim={openClaim}
              claimError={claimError}
            />
          ) : (
            <div className="space-y-2 rounded-md border border-line border-l-4 border-l-hold bg-surface-2 p-4 md:p-5">
              <p className="text-[14px] leading-relaxed text-text">
                {c.decision === "dismiss" ? "Dismissed" : "On hold"}: {c.reason}.
              </p>
              <p className="text-[13px] leading-relaxed text-muted">
                {c.decision === "dismiss"
                  ? `The notice is about the same product, but it does not list your ${unit}. There is nothing to approve.`
                  : "A rule needs one more detail before it can decide. Add it on My things and check the item again."}
              </p>
            </div>
          )}
        </section>
      </div>

      {c.decision === "alert" && (
        <div className="pb-6">
          {c.evidence ? (
            <EvidenceCertificate caseId={c.case_id} evidence={c.evidence} demo={demo} />
          ) : (
            <CertificatePlaceholder
              why={
                approval === "approved"
                  ? `Sealing ${snapshotNoun(notice)} now: a write-once copy in S3, its SHA-256, and a KMS signature over it.`
                  : approval === "rejected" || approval === "expired"
                    ? `Nothing was sealed: this case was ${approval}.`
                    : `Sealed after you approve: a write-once copy of ${snapshotNoun(notice)}, its SHA-256, and a KMS signature over it.`
              }
            />
          )}
        </div>
      )}

      <ShowWork c={c} item={item} notice={notice} steps={run ? (status?.steps ?? null) : null} />
    </article>
  );
}

function CaseSkeleton() {
  return (
    <div aria-busy className="mx-auto max-w-6xl space-y-6 px-5 py-5 md:py-7" role="status" aria-label="Loading the case">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-3 border-b border-line pb-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
