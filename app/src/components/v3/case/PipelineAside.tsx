"use client";
import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { Key, TriangleAlert, X } from "lucide-react";
import { Button, Card, cn } from "../ui";
import { PRIMARY_SHADOW, SR_ONLY } from "./classes";
import {
  STEP_LABEL, STEP_ORDER, addresseeLabel, failedStep, istTime, istTimeSec, noticeFact, pipelineTotalMs, secs1, secsLabel, stepMs,
} from "./format";
import { DownloadButton } from "./EvidenceBand";
import { EASE_DRAW, S } from "./motion";
import { Seal, type SealVariant } from "./Seal";
import type { CaseRecord, CaseUiState, Household, Item, Notice, StepKey, TamperResult } from "./types";

/**
 * C8 · CaseFile (the aside). Always-visible progress: the claim's state, the four pipeline steps with
 * real timings, and the one next action. Column layout ≥1440 (sticky) and under 768 (static card after
 * the gate); `layout="strip"` is the 1-row pipeline strip for 768–1439. Matches the right column of
 * `case-1536.png`, `case-waiting-1536.png`, `case-invalid-1536.png`.
 */

type NodeState = "done" | "running" | "paused" | "pending" | "failed" | "skipped";

export interface StepModel {
  key: StepKey;
  n: number;
  label: string;
  detail: string;
  detailTone?: "cobalt" | "danger" | "warning";
  right: string | null;
  node: NodeState;
}

type StatusIcon = { seal: SealVariant; byte?: number | null } | { glyph: "pause" | "spinner" | "x" | "warn" };
export interface StatusModel {
  tone: "cobalt" | "soft" | "white";
  icon: StatusIcon;
  title: string;
  sub: string;
  subDanger?: boolean;
}

export interface PipelineModel {
  status: StatusModel;
  total: { kind: "count"; done: number } | { kind: "clock"; secs: number } | { kind: "total"; secs: number };
  steps: StepModel[];
  actions: "verified" | "invalid" | null;
  note: string | null;
}

const RUNNING: CaseUiState[] = ["approving", "sealing", "writing", "verifying"];

export function pipelineModel(args: {
  state: CaseUiState; caseRecord: CaseRecord | null; household: Household; tamper?: TamperResult | null;
  elapsedMs: number; retentionDays?: number;
}): PipelineModel {
  const { state, caseRecord: c, household, tamper, elapsedMs, retentionDays = 30 } = args;
  const ev = c?.evidence;
  const lockDays = ev ? Math.round((new Date(ev.object_lock_retain_until).getTime() - new Date(ev.signed_at).getTime()) / 86_400_000) : retentionDays;
  const approvedAt = c?.steps.approve.finished_at ?? c?.approval.approved_at ?? null;
  const dur = (k: StepKey) => { const ms = c ? stepMs(c.steps[k]) : null; return ms == null ? null : secsLabel(ms); };
  const base: StepModel[] = [
    { key: "approve", n: 1, label: STEP_LABEL.approve, detail: household.demo ? "Demo household" : household.name, right: approvedAt ? istTimeSec(approvedAt) : null, node: "pending" },
    { key: "seal_evidence", n: 2, label: STEP_LABEL.seal_evidence, detail: `S3 Object Lock · ${lockDays} days`, right: dur("seal_evidence"), node: "pending" },
    { key: "write_letter", n: 3, label: STEP_LABEL.write_letter, detail: `PDF · ${addresseeLabel(c?.claim_addressee ?? "seller")}`, right: dur("write_letter"), node: "pending" },
    { key: "verify", n: 4, label: STEP_LABEL.verify, detail: "AWS KMS", right: dur("verify"), node: "pending" },
  ];
  const upTo = (k: number, active: NodeState) => base.forEach((s, i) => { s.node = i < k ? "done" : i === k ? active : "pending"; if (i >= k) s.right = i === k && active === "running" ? null : s.right; });
  const total = pipelineTotalMs(c);
  const verifiedAt = c?.steps.verify.finished_at ?? null;

  switch (state) {
    case "waiting":
    case "readonly": {
      base.forEach((s) => { s.node = "pending"; s.right = null; });
      Object.assign(base[0], { node: "paused", detail: "Needs you", detailTone: "cobalt", right: "paused" });
      return {
        status: { tone: "soft", icon: { glyph: "pause" }, title: "Paused at step 1", sub: "Nothing is sealed until you approve." },
        total: { kind: "count", done: 0 }, steps: base, actions: null,
        note: "Your letter and the evidence certificate appear on this page as soon as the pipeline finishes.",
      };
    }
    case "approving":
    case "sealing":
    case "writing":
    case "verifying": {
      const k = state === "writing" ? 2 : state === "verifying" ? 3 : 1;
      upTo(k, "running");
      base.slice(k + 1).forEach((s) => { s.right = null; });
      const sealedYet = k >= 2;
      const sub = k === 1 ? "Step 2 of 4 · sealing evidence…" : k === 2 ? "Step 3 of 4 · writing your letter…" : "Step 4 of 4 · verifying the signature…";
      return {
        status: sealedYet
          ? { tone: "cobalt", icon: { seal: "sealed" }, title: "Evidence sealed", sub }
          : { tone: "soft", icon: { glyph: "spinner" }, title: "Sealing your claim", sub },
        total: { kind: "clock", secs: secs1(elapsedMs) }, steps: base, actions: null, note: null,
      };
    }
    case "verified": {
      upTo(4, "done");
      base[3].detail = "AWS KMS · valid";
      return {
        status: { tone: "cobalt", icon: { seal: "verified" }, title: "Claim letter ready", sub: verifiedAt ? `Sealed and verified at ${istTime(verifiedAt)} IST` : "Sealed and verified" },
        total: { kind: "total", secs: secs1(total ?? 0) }, steps: base, actions: "verified", note: null,
      };
    }
    case "invalid": {
      upTo(3, "failed");
      Object.assign(base[3], {
        detail: "Does not match · tamper test", detailTone: "danger",
        right: tamper?.duration_ms != null ? secsLabel(tamper.duration_ms) : dur("verify"),
      });
      return {
        status: { tone: "white", icon: { seal: "invalid", byte: tamper?.flipped_byte_index }, title: "Signature does not match", sub: `Tamper test · byte ${tamper?.flipped_byte_index ?? "?"} changed`, subDanger: true },
        total: { kind: "total", secs: secs1(total ?? 0) }, steps: base, actions: "invalid", note: null,
      };
    }
    case "rejected":
    case "expired": {
      const at = state === "rejected" ? c?.approval.rejected_at : c?.approval.expired_at;
      Object.assign(base[0], { node: "skipped", detail: `${state === "rejected" ? "Dismissed" : "Expired"}${at ? ` at ${istTime(at)} IST` : ""}`, right: null });
      base.slice(1).forEach((s) => Object.assign(s, { node: "skipped", detail: "Skipped", right: null }));
      return {
        status: { tone: "white", icon: { glyph: "x" }, title: state === "rejected" ? "Case dismissed" : "Approval expired", sub: "Nothing was sealed." },
        total: { kind: "count", done: 0 }, steps: base, actions: null, note: null,
      };
    }
    case "failed": {
      const f = failedStep(c);
      const k = f ? STEP_ORDER.indexOf(f.key) : 0;
      upTo(k, "failed");
      Object.assign(base[k], { detail: "Failed", detailTone: "warning", right: null });
      return {
        status: { tone: "white", icon: { glyph: "warn" }, title: `Paused at step ${k + 1}`, sub: `${STEP_LABEL[f?.key ?? "approve"]} failed. Nothing was sent to anyone.` },
        total: { kind: "count", done: k }, steps: base, actions: null, note: null,
      };
    }
    default:
      return { status: { tone: "white", icon: { glyph: "spinner" }, title: "", sub: "" }, total: { kind: "count", done: 0 }, steps: base, actions: null, note: null };
  }
}

/* ------------------------------------------------------------------ component */

export interface PipelineAsideProps {
  state: CaseUiState;
  caseRecord: CaseRecord | null;
  notice: Notice | null;
  item: Item | null;
  household: Household;
  tamper?: TamperResult | null;
  /** ms since approval while running (ticks every 100 ms) */
  elapsedMs: number;
  /** the band is ≥30 % visible: collapse the action block (spec "Actions yield to the band") */
  bandInView: boolean;
  claimPdfUrl?: string | null;
  verifying?: boolean;
  live: boolean;
  layout?: "column" | "strip";
  onDownload?: () => void;
  onVerifyAgain?: () => void;
  onSeeCertificate?: () => void;
  className?: string;
}

export function PipelineAside(props: PipelineAsideProps) {
  const { state, caseRecord, notice, item, household, tamper, elapsedMs, layout = "column", className } = props;
  const model = pipelineModel({ state, caseRecord, household, tamper, elapsedMs });
  if (state === "loading") return <AsideSkeleton layout={layout} className={className} />;
  const id = layout === "strip" ? "case-file-h-strip" : "case-file-h";
  return (
    <aside aria-labelledby={id} className={className}>
      <h2 id={id} className={SR_ONLY}>Case file</h2>
      {layout === "strip"
        ? <PipelineStrip model={model} live={props.live} />
        : <CaseFile {...props} className={undefined} model={model} caseId={caseRecord?.case_id ?? null} noticeLine={notice ? noticeFact(notice) : null} itemName={item?.name ?? null} />}
    </aside>
  );
}

function Total({ total }: { total: PipelineModel["total"] }) {
  if (total.kind === "count") return <span>{total.done} of 4 done</span>;
  // fixed-height box: NumberFlow pads its digits for the spin mask, which would push the steps down
  return (
    <span className="inline-flex h-[13px] items-center leading-none">
    <NumberFlow
      value={total.secs}
      format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
      suffix={total.kind === "total" ? " s end to end" : " s"}
      transformTiming={{ duration: 400, easing: "cubic-bezier(.22,1,.36,1)" }}
      spinTiming={{ duration: 250, easing: "cubic-bezier(.22,1,.36,1)" }}
      className="tabular-nums"
    />
    </span>
  );
}

function StatusGlyph({ icon, size }: { icon: StatusIcon; size: "lg" | "sm" }) {
  if ("seal" in icon) return <Seal variant={icon.seal} flippedByte={icon.byte} size={size === "lg" ? 68 : 40} mini label={false} />;
  const disc = size === "lg" ? "m-1.5 size-14" : "size-10";
  const ico = size === "lg" ? "size-[26px]" : "size-[18px]";
  if (icon.glyph === "pause") {
    return (
      <span className={cn("relative grid flex-none place-items-center rounded-full bg-cobalt text-white", disc)}>
        <svg viewBox="0 0 24 24" aria-hidden className={ico}><path d="M9 6.5v11M15 6.5v11" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
        <span aria-hidden className="absolute -inset-[7px] rounded-full border-2 border-cobalt opacity-[.22]" />
      </span>
    );
  }
  if (icon.glyph === "spinner") {
    return (
      <span className={cn("grid flex-none place-items-center rounded-full bg-cobalt text-white", disc)}>
        <span aria-hidden className={cn("rounded-full border-[2.5px] border-white border-r-transparent motion-safe:animate-spin", size === "lg" ? "size-6" : "size-4")} />
      </span>
    );
  }
  if (icon.glyph === "warn") {
    return <span className={cn("grid flex-none place-items-center rounded-full bg-warning-soft text-warning", disc)}><TriangleAlert aria-hidden className={ico} strokeWidth={2.1} /></span>;
  }
  return <span className={cn("grid flex-none place-items-center rounded-full bg-surface-2 text-ink-muted", disc)}><X aria-hidden className={ico} strokeWidth={2.4} /></span>;
}

/* ------------------------------------------------------------------ column */

function CaseFile({
  model, live, bandInView, claimPdfUrl, caseRecord, verifying, onDownload, onVerifyAgain, onSeeCertificate, className,
  caseId, noticeLine, itemName,
}: PipelineAsideProps & { model: PipelineModel; caseId: string | null; noticeLine: string | null; itemName: string | null }) {
  const reduce = useReducedMotion();
  const { status } = model;
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const collapsed = bandInView && model.actions != null;

  // hand focus to the band's matching button before the block collapses
  React.useEffect(() => {
    if (!collapsed) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && actionsRef.current?.contains(a)) {
      const want = a.getAttribute("data-action") ?? "download";
      document.querySelector<HTMLElement>(`#evidence [data-action="${want}"]`)?.focus({ preventScroll: true });
    }
  }, [collapsed]);

  const bleed = status.tone !== "white";
  return (
    <Card className={cn("p-5", className)}>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={`${status.tone}-${status.title}`}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
          className={cn(
            "flex items-center gap-3.5",
            bleed ? "-mx-5 -mt-5 rounded-t-[13px] px-5 py-[18px]" : "border-b border-line pb-[18px]",
            status.tone === "cobalt" && "bg-cobalt",
            status.tone === "soft" && "bg-cobalt-soft",
          )}
        >
          <StatusGlyph icon={status.icon} size="lg" />
          <div className="min-w-0">
            <h3 className={cn("font-display text-[22px] leading-[1.15] font-bold tracking-[-.02em]", status.tone === "cobalt" ? "text-white" : "text-ink")}>{status.title}</h3>
            <p className={cn("mt-1 text-[14px] leading-[1.4]", status.tone === "cobalt" ? "text-on-cobalt-muted" : status.subDanger ? "text-danger" : "text-ink-muted")}>{status.sub}</p>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-4 flex items-center justify-between text-[12px] leading-none font-semibold tracking-[.06em] text-ink-muted uppercase">
        Pipeline
        <span className="text-[13px] font-semibold tracking-normal text-ink normal-case"><Total total={model.total} /></span>
      </div>

      <ol className="mt-1.5">
        {model.steps.map((s, i) => (
          <StepRow key={s.key} step={s} last={i === model.steps.length - 1} live={live} />
        ))}
      </ol>

      {model.actions && (
        <motion.div
          ref={actionsRef}
          inert={collapsed || undefined}
          initial={false}
          animate={collapsed ? { height: 0, opacity: 0 } : { height: "auto", opacity: 1 }}
          transition={reduce ? { height: { duration: 0 }, opacity: { duration: 0.15 } } : { duration: 0.2, ease: EASE_DRAW }}
          className="overflow-hidden"
        >
          <div className="mt-3.5 grid gap-2.5">
            {model.actions === "verified" ? (
              <>
                <DownloadButton url={claimPdfUrl} caseId={caseRecord?.case_id} onDownload={onDownload} variant="primary" className={cn("w-full", PRIMARY_SHADOW)} />
                <Button variant="secondary" onClick={onSeeCertificate} data-action="download" className="w-full">See the certificate</Button>
              </>
            ) : (
              <>
                <Button
                  loading={verifying}
                  onClick={() => { if (!verifying) onVerifyAgain?.(); }}
                  icon={<Key aria-hidden className="size-[18px]" strokeWidth={1.9} />}
                  data-action="verify-again"
                  className={cn("w-full", PRIMARY_SHADOW)}
                >
                  {verifying ? "Verifying…" : "Verify again"}
                </Button>
                <DownloadButton url={claimPdfUrl} caseId={caseRecord?.case_id} onDownload={onDownload} variant="secondary" className="w-full" />
              </>
            )}
          </div>
        </motion.div>
      )}

      {model.note && <p className="mt-3.5 rounded-[12px] bg-surface-2 px-3.5 py-3 text-[13.5px] leading-[1.45] text-ink-muted">{model.note}</p>}

      <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 border-t border-line pt-1.5 text-[13px] leading-[1.35]">
        {noticeLine && <><dt className="pt-2 text-ink-muted">Notice</dt><dd className="m-0 pt-2 text-right text-ink [overflow-wrap:anywhere]">{noticeLine}</dd></>}
        {itemName && <><dt className="pt-2 text-ink-muted">Item</dt><dd className="m-0 pt-2 text-right text-ink [overflow-wrap:anywhere]">{itemName}</dd></>}
        {caseId && <><dt className="pt-2 text-ink-muted">Case</dt><dd className="m-0 pt-2 text-right font-mono text-[12.5px] text-ink [overflow-wrap:anywhere]">{caseId}</dd></>}
      </dl>
    </Card>
  );
}

function StepRow({ step: s, last, live }: { step: StepModel; last: boolean; live: boolean }) {
  const done = s.node === "done";
  const muted = s.node === "pending" || s.node === "skipped";
  return (
    <li aria-current={s.node === "running" || s.node === "paused" ? "step" : undefined} className="relative grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 py-[11px]">
      {!last && (
        <span aria-hidden className="absolute top-[45px] -bottom-[9px] left-[15px] w-0.5">
          <span className="absolute inset-y-0 left-0 border-l-2 border-dashed border-[#C3CDDB]" />
          <motion.span
            className="absolute inset-0 origin-top rounded-[1px] bg-cobalt"
            initial={false}
            animate={{ scaleY: done ? 1 : 0 }}
            transition={{ duration: 0.28, ease: EASE_DRAW }}
          />
        </span>
      )}
      <Node state={s.node} n={s.n} live={live} />
      <span className="min-w-0 pt-[5px]">
        <b className={cn("block text-[15px] leading-[1.2]", muted ? "font-medium text-ink-muted" : "font-semibold text-ink")}>{s.label}</b>
        <span className={cn(
          "mt-1 block text-[13px] leading-[1.35]",
          s.detailTone === "cobalt" ? "font-semibold text-cobalt" : s.detailTone === "danger" ? "font-semibold text-danger" : s.detailTone === "warning" ? "font-semibold text-warning" : "text-ink-muted",
        )}>
          {s.detail}
        </span>
      </span>
      <span className="pt-1.5 text-[13px] leading-none font-medium whitespace-nowrap text-ink-muted tabular-nums">{s.right}</span>
    </li>
  );
}

function Node({ state, n, live, size = 32 }: { state: NodeState; n: number; live: boolean; size?: number }) {
  return (
    <span className="relative grid" style={{ width: size, height: size }}>
      <AnimatePresence initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.14 } }}
          transition={{ opacity: { duration: 0.14 }, scale: S.node }}
          className={cn(
            "grid rounded-full [grid-area:1/1] place-items-center",
            state === "done" && "bg-cobalt text-white",
            state === "failed" && "bg-danger text-white",
            (state === "running" || state === "paused") && "bg-white shadow-[inset_0_0_0_2.5px_var(--cobalt)]",
            (state === "pending" || state === "skipped") && "bg-white text-[13px] leading-none font-semibold text-ink-muted shadow-[inset_0_0_0_1.5px_#B2BDCC]",
          )}
          style={{ width: size, height: size }}
        >
          {state === "done" && (
            <svg viewBox="0 0 24 24" aria-hidden className="size-4">
              <motion.path
                d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"
                initial={live ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              />
            </svg>
          )}
          {state === "failed" && <X aria-hidden className="size-4" strokeWidth={2.8} />}
          {(state === "running" || state === "paused") && <span aria-hidden className="size-3 rounded-full bg-cobalt" />}
          {state === "running" && (
            <span aria-hidden className="absolute -inset-[3px] rounded-full border-2 border-cobalt border-r-transparent border-b-transparent motion-safe:animate-spin" />
          )}
          {(state === "pending" || state === "skipped") && n}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------------------------------------------ strip (768–1439) */

function PipelineStrip({ model, live, className }: { model: PipelineModel; live: boolean; className?: string }) {
  const { status } = model;
  return (
    <Card className={cn("flex min-h-[76px] items-center gap-4 p-2.5 pr-5", className)}>
      <div className={cn(
        "flex w-[220px] flex-none items-center gap-2.5 rounded-[10px] px-2.5 py-2 max-lg:w-auto",
        status.tone === "cobalt" ? "bg-cobalt" : status.tone === "soft" ? "bg-cobalt-soft" : "bg-surface-2",
      )}>
        <StatusGlyph icon={status.icon} size="sm" />
        <div className="min-w-0">
          <b className={cn("block truncate font-display text-[15px] leading-[1.15] font-bold tracking-[-.01em] max-lg:hidden", status.tone === "cobalt" ? "text-white" : "text-ink")}>{status.title}</b>
          <span className={cn("block truncate text-[12px] leading-[1.35]", status.tone === "cobalt" ? "text-on-cobalt-muted" : status.subDanger ? "text-danger" : "text-ink-muted")}>
            <Total total={model.total} />
          </span>
        </div>
      </div>
      <ol className="flex min-w-0 flex-1 items-center gap-2.5">
        {model.steps.map((s, i) => (
          <React.Fragment key={s.key}>
            <li aria-current={s.node === "running" || s.node === "paused" ? "step" : undefined} className="flex min-w-0 items-center gap-2.5">
              <Node state={s.node} n={s.n} live={live} size={28} />
              <span className="min-w-0">
                <b className={cn("block truncate text-[14px] leading-[1.2]", s.node === "pending" || s.node === "skipped" ? "font-medium text-ink-muted" : "font-semibold text-ink")}>{s.label}</b>
                <span className={cn("block truncate text-[12.5px] leading-[1.3] tabular-nums", s.detailTone === "danger" ? "font-semibold text-danger" : s.detailTone === "cobalt" ? "font-semibold text-cobalt" : "text-ink-muted")}>
                  {s.detailTone ? s.detail : s.right ?? s.detail}
                </span>
              </span>
            </li>
            {i < model.steps.length - 1 && (
              <li aria-hidden className={cn("h-0.5 min-w-4 flex-1", s.node === "done" ? "bg-cobalt" : "border-t-2 border-dashed border-[#C3CDDB]")} />
            )}
          </React.Fragment>
        ))}
      </ol>
    </Card>
  );
}

function AsideSkeleton({ layout, className }: { layout: "column" | "strip"; className?: string }) {
  const bar = "block rounded-sm bg-surface-2 motion-safe:animate-skeleton";
  if (layout === "strip") return <Card aria-hidden className={cn("h-[76px]", className)}><span /></Card>;
  return (
    <Card aria-hidden className={cn("grid gap-4 p-5", className)}>
      <span className="-mx-5 -mt-5 h-[104px] rounded-t-[13px] bg-surface-2" />
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="flex items-center gap-3"><span className="size-8 rounded-full bg-surface-2" /><span className={cn(bar, "h-3 w-40")} /></span>
      ))}
      <span className={cn(bar, "h-11 w-full rounded-pill")} />
    </Card>
  );
}
