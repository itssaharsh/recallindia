"use client";
import * as React from "react";
import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import { cn } from "../ui";
import { ApprovalGate } from "./ApprovalGate";
import { BatchVsList } from "./BatchVsList";
import { CaseCrumbs } from "./CaseCrumbs";
import { CaseHeader, CaseHeaderSkeleton } from "./CaseHeader";
import { CaseToast, useCaseToast } from "./CaseToast";
import { SR_ONLY } from "./classes";
import { EvidenceBand, bandSealFor } from "./EvidenceBand";
import {
  SOURCE_SHORT, STEP_LABEL, dayMonYear, deriveHighlight, failedStep, hex, istTime, matchFacts, noticeNoun, pipelineTotalMs, secs1,
} from "./format";
import { scrollPageTo, useElapsed, useLastUserScroll, useLive, useVisibleRatio } from "./hooks";
import { EASE_IN_OUT } from "./motion";
import { NoticeAsPublished } from "./NoticeAsPublished";
import { PipelineAside } from "./PipelineAside";
import { PipelineErrorCard, ReceiptPill, type ReceiptKind } from "./ReceiptPill";
import { ShowWork } from "./ShowWork";
import type { CaseUiState, CaseViewProps, TamperResult } from "./types";

/**
 * /case/?id= — the claim, sealed. Composes every case component from one typed props object.
 * Presentational: no fetching. The page owns polling (GET /cases/{id} every 600 ms), passes the result in,
 * and runs `useCasePhase()` so each beat keeps its minimum dwell (spec §4).
 *
 * Mockups: case-1536.png (verified), case-waiting-1536.png, case-invalid-1536.png, case-390.png,
 * case-full-1536.png, case-full-390.png.
 */

const RUNNING: CaseUiState[] = ["approving", "sealing", "writing", "verifying"];
const GATE: CaseUiState[] = ["waiting", "readonly"];

/** The case file and crumb chip change a beat after the band (B3 t=400 ms, X4 X1+300 ms). */
function chromeDelay(from: CaseUiState | undefined, to: CaseUiState): number {
  if (to === "writing" && (from === "sealing" || from === "approving")) return 400;
  if (to === "invalid" && from === "verified") return 300;
  return 0;
}

function useChromeState(state: CaseUiState, live: boolean, reduce: boolean): CaseUiState {
  const [shown, setShown] = React.useState(state);
  const last = React.useRef(state);
  React.useEffect(() => {
    const from = last.current;
    last.current = state;
    const d = live && !reduce ? chromeDelay(from, state) : 0;
    if (!d) { setShown(state); return; }
    const t = setTimeout(() => setShown(state), d);
    return () => clearTimeout(t);
  }, [state, live, reduce]);
  return shown;
}

function announcement(from: CaseUiState | undefined, to: CaseUiState, tamper: TamperResult | null | undefined, failedLabel: string | null): string | null {
  if (from === to) return null;
  if (to === "approving" && from && GATE.includes(from)) return "Approved. Sealing your claim.";
  if (to === "sealing") return "Step 2 of 4, sealing evidence";
  if (to === "writing") return "Evidence sealed.";
  if (to === "verifying") return "Letter written.";
  if (to === "verified" && from === "invalid") return "Verified again. The sealed copy matches the signed digest.";
  if (to === "verified" && from && RUNNING.includes(from)) return "Signature verified. Your claim letter is ready.";
  if (to === "invalid" && tamper) {
    return `Tamper test: byte ${tamper.flipped_byte_index} changed from ${hex(tamper.byte_before)} to ${hex(tamper.byte_after)}. The signature does not match.`;
  }
  if (to === "rejected") return "Match dismissed. Nothing was sealed.";
  if (to === "expired") return "This approval expired. Nothing was sealed.";
  if (to === "failed" && failedLabel) return `${failedLabel} failed. Nothing was sent to anyone.`;
  return null;
}

export function CaseView(props: CaseViewProps) {
  const {
    state, caseRecord, notice, item, household, nearMiss, verify, tamper, verifiedAgainAt, claimPdfUrl, timedOut = false,
    pending = {}, elapsedMs, clientAudit = [], showWorkOpen = false, animateOnMount = true, bandInView: bandInViewProp,
    sharedLayout = false, backHref = "/mine", highlight, retentionDays = 30, on = {},
  } = props;

  const live = useLive();
  const reduce = useReducedMotion() ?? false;
  const chrome = useChromeState(state, live, reduce);
  const ratio = useVisibleRatio("evidence", bandInViewProp === undefined && state !== "loading");
  const bandInView = bandInViewProp ?? ratio >= 0.3;
  const running = RUNNING.includes(state);
  const elapsed = useElapsed(running, elapsedMs);
  const { toast, show: showToast, dismiss } = useCaseToast();
  const receiptRef = React.useRef<HTMLDivElement>(null);
  const lastUserScroll = useLastUserScroll();
  const autoScrolled = React.useRef(false);
  const [announce, setAnnounce] = React.useState("");
  const [approvedFallback] = React.useState(() => new Date().toISOString());
  const failure = failedStep(caseRecord);

  /* ---------------------------------------------------------------- beats driven by state changes */
  const lastChrome = React.useRef(chrome);
  React.useEffect(() => {
    const from = lastChrome.current;
    lastChrome.current = chrome;
    if (!live || from === chrome) return;
    const msg = announcement(from, chrome, tamper, failure ? STEP_LABEL[failure.key] : null);
    if (msg) setAnnounce(msg);
  }, [chrome, live, tamper, failure]);

  // beat timers must survive the next state change (a 400 ms dwell can land before B1b's 450 ms), so they are
  // kept in a ref and cleared only on unmount
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  const lastState = React.useRef(state);
  React.useEffect(() => {
    const from = lastState.current;
    lastState.current = state;
    if (!live || from === state) return;

    // B1: focus moves to the receipt (no scroll: B1b owns scrolling)
    if (GATE.includes(from) && RUNNING.includes(state)) {
      requestAnimationFrame(() => receiptRef.current?.focus({ preventScroll: true }));
      autoScrolled.current = false;
    }

    // B1b: bring the band into view once per run, unless the user is scrolling or reduced motion is on
    if (GATE.includes(from) && state === "approving" && !reduce && !autoScrolled.current) {
      later(450, () => {
        const band = document.getElementById("evidence");
        if (!band || performance.now() - (lastUserScroll.current ?? -Infinity) < 1500) return;
        const r = band.getBoundingClientRect();
        const visible = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)) / Math.max(1, r.height);
        if (visible >= 0.6) return;
        autoScrolled.current = true;
        scrollPageTo(window.scrollY + r.top - 80, 700, EASE_IN_OUT);
      });
    }

    // B6: toast 300 ms after the verify flip
    if (from === "verifying" && state === "verified") {
      later(300, () => showToast("Claim letter ready · evidence sealed and verified", { label: "Download PDF", onClick: download }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, live, reduce]);

  /* ---------------------------------------------------------------- handlers */
  const download = React.useCallback(() => {
    if (claimPdfUrl) {
      const a = document.createElement("a");
      a.href = claimPdfUrl;
      a.download = `${caseRecord?.case_id ?? "claim"}.pdf`;
      a.click();
    } else on.onDownload?.();
  }, [claimPdfUrl, caseRecord?.case_id, on]);

  const copyLetter = React.useCallback(async () => {
    try {
      if (on.onCopyLetter) await on.onCopyLetter();
      else await navigator.clipboard?.writeText(caseRecord?.claim_text ?? "");
      showToast("Letter copied");
      setAnnounce("Letter copied");
    } catch { /* the clipboard can refuse; nothing to show */ }
  }, [on, caseRecord?.claim_text, showToast]);

  const copyJson = React.useCallback(async () => {
    try {
      if (on.onCopyCaseJson) await on.onCopyCaseJson();
      else await navigator.clipboard?.writeText(JSON.stringify(caseRecord, null, 2));
      showToast("Case JSON copied");
      setAnnounce("Case JSON copied");
    } catch { /* ignore */ }
  }, [on, caseRecord, showToast]);

  const seeCertificate = React.useCallback(() => {
    document.getElementById("evidence")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [reduce]);

  /* ---------------------------------------------------------------- loading */
  if (state === "loading" || !caseRecord || !notice || !item) {
    return (
      <div aria-busy className="mx-auto w-full max-w-[1536px] px-8 max-lg:px-6 max-md:px-4">
        <CaseCrumbs state="loading" itemName={null} caseId={null} createdAt={null} backHref={backHref} />
        <CaseHeaderSkeleton />
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_400px] items-start gap-7 max-[1440px]:grid-cols-1">
          <div className="grid gap-6">
            <div className="h-14 rounded-pill bg-surface-2 motion-safe:animate-skeleton" />
            <div className="h-[420px] rounded-md bg-surface-2 motion-safe:animate-skeleton" />
          </div>
          <PipelineAside state="loading" caseRecord={null} notice={null} item={null} household={household} elapsedMs={0} bandInView={false} live={false} className="md:max-[1440px]:hidden" />
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- derived */
  const ev = caseRecord.evidence;
  const noun = noticeNoun(notice);
  const hl = highlight === undefined ? deriveHighlight(notice) : highlight;
  const snapshotBytes = ev?.snapshot_bytes ?? caseRecord.pending_snapshot_bytes ?? null;
  const facts = matchFacts(caseRecord.reasoning);
  const total = pipelineTotalMs(caseRecord);
  const approvedAt = caseRecord.approval.approved_at ?? caseRecord.steps.approve.finished_at ?? approvedFallback;
  const gateMode = state === "waiting" || state === "readonly" ? state : null;
  const receipt: { kind: ReceiptKind; at: string } | null =
    state === "verified" || state === "invalid" ? { kind: "done", at: approvedAt }
    : RUNNING.includes(state) ? { kind: "running", at: approvedAt }
    : state === "failed" ? { kind: "approved", at: approvedAt }
    : state === "rejected" ? { kind: "rejected", at: caseRecord.approval.rejected_at ?? approvedFallback }
    : state === "expired" ? { kind: "expired", at: caseRecord.approval.expired_at ?? approvedFallback }
    : null;
  const audit = [...caseRecord.audit, ...clientAudit];
  const showBatch = item.kind !== "vehicle" && !!caseRecord.range_check;
  const asideProps = {
    state: chrome, caseRecord, notice, item, household, tamper, elapsedMs: elapsed, bandInView, claimPdfUrl,
    verifying: pending.verify, live, onDownload: download, onVerifyAgain: on.onVerifyAgain, onSeeCertificate: seeCertificate,
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto w-full max-w-[1536px] px-8 max-lg:px-6 max-md:px-4">
        <CaseCrumbs
          state={chrome}
          itemName={item.name}
          caseId={caseRecord.case_id}
          createdAt={caseRecord.created_at}
          verifiedAgainAt={verifiedAgainAt}
          backHref={backHref}
        />

        <CaseHeader notice={notice} item={item} soldAfterNotice={caseRecord.sold_after_notice} animate={animateOnMount} morph={sharedLayout} />

        <motion.div
          initial={animateOnMount && !reduce ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.24 }}
        >
          {/* 768–1439: the case file becomes a one-row pipeline strip between the header and the main column */}
          <PipelineAside {...asideProps} layout="strip" className="mt-6 hidden md:max-[1440px]:block" />

          <div className={cn(
            "mt-6 grid grid-cols-[minmax(0,1fr)_400px] items-start gap-7",
            "max-[1440px]:grid-cols-1",
            "max-md:mt-4 max-md:flex max-md:flex-col max-md:items-stretch max-md:gap-4",
          )}>
            <div className="flex min-w-0 flex-col gap-6 max-md:contents">
              {gateMode ? (
                <ApprovalGate
                  mode={gateMode}
                  approving={pending.approve}
                  dismissing={pending.dismiss}
                  noticeNoun={noun}
                  sourceShort={SOURCE_SHORT[notice.source]}
                  addressee={caseRecord.claim_addressee}
                  thingNoun={item.kind === "medicine" ? "strip" : item.kind === "vehicle" ? "vehicle" : "thing"}
                  retentionDays={retentionDays}
                  onApprove={on.onApprove}
                  onDismiss={on.onDismiss}
                  onMakeCopy={on.onMakeCopy}
                  className="max-md:order-1"
                />
              ) : receipt ? (
                <ReceiptPill
                  ref={receiptRef}
                  kind={receipt.kind}
                  demo={household.demo}
                  time={istTime(receipt.at)}
                  date={dayMonYear(receipt.at)}
                  totalSecs={total != null ? secs1(total).toFixed(1) : null}
                  showJump={reduce}
                  animateIn={live}
                  onCheckAgain={on.onCheckAgain}
                  className="max-md:order-1"
                />
              ) : null}

              {(state === "failed" || timedOut) && (
                <PipelineErrorCard
                  stepLabel={failure ? STEP_LABEL[failure.key] : undefined}
                  error={failure?.error}
                  timedOut={timedOut && state !== "failed"}
                  onCheckStatus={on.onCheckStatus}
                />
              )}

              <NoticeAsPublished
                notice={notice}
                quoted={caseRecord.quoted_sentence || notice.raw_excerpt}
                batch={caseRecord.range_check?.listed ?? null}
                highlight={hl}
                sealed={!!ev && ["sealed", "verified", "invalid"].includes(bandSealFor(state, true))}
                snapshotBytes={snapshotBytes}
                className="max-md:order-3"
              />

              {showBatch && caseRecord.range_check && (
                <BatchVsList
                  yours={caseRecord.range_check.yours}
                  listed={caseRecord.range_check.listed}
                  listedLabel={notice.source === "cdsco_nsq" ? `${SOURCE_SHORT[notice.source]}, row ${notice.row_ref?.row ?? "?"}` : `${SOURCE_SHORT[notice.source]} notice`}
                  productName={item.name}
                  maker={item.brand}
                  mfg={item.mfg_date}
                  exp={item.exp_date}
                  sameProduct={facts.sameProduct}
                  sameMaker={facts.sameMaker}
                  kind={item.kind === "vehicle" ? "other" : item.kind}
                  nearMissBatch={nearMiss?.batch ?? null}
                  nearMissStatus={nearMiss?.status}
                  animate={animateOnMount}
                  className="max-md:order-4"
                />
              )}

              <EvidenceBand
                state={state}
                caseRecord={caseRecord}
                notice={notice}
                verify={verify}
                tamper={tamper}
                verifiedAgainAt={verifiedAgainAt}
                claimPdfUrl={claimPdfUrl}
                pending={pending}
                snapshotBytes={snapshotBytes}
                retentionDays={retentionDays}
                keyAlias={ev?.key_alias}
                signingAlgorithm={ev?.signing_algorithm}
                live={live}
                onDownload={download}
                onCopyLetter={copyLetter}
                onRunTamperTest={on.onRunTamperTest}
                onVerifyAgain={on.onVerifyAgain}
                className="max-md:order-5"
              />
            </div>

            <PipelineAside
              {...asideProps}
              layout="column"
              className="min-[1440px]:sticky min-[1440px]:top-[84px] md:max-[1440px]:hidden max-md:order-2"
            />
          </div>

          <ShowWork
            reasoning={caseRecord.reasoning}
            verifier={caseRecord.verifier}
            confidence={caseRecord.confidence}
            audit={audit}
            evidence={ev}
            caseId={caseRecord.case_id}
            kind={item.kind}
            defaultOpen={showWorkOpen}
            onCopyCaseJson={copyJson}
          />
        </motion.div>

        {/* one polite live region for every beat (spec C3, C8, §4, §5); it lives here so it survives the strip layout */}
        <div role="status" aria-live="polite" aria-atomic="true" className={SR_ONLY}>{announce}</div>
        <CaseToast toast={toast} onDismiss={dismiss} />
      </div>
    </MotionConfig>
  );
}
