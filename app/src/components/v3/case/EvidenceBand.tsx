"use client";
import * as React from "react";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "framer-motion";
import { Activity, Copy, Download, FileText, Key, Lock, Stamp, TriangleAlert, X } from "lucide-react";
import { Button, cn } from "../ui";
import { FIELD_LABEL } from "./classes";
import {
  SOURCE_SHORT, hashGroups, istStamp, istTime, lockDate, noticeNoun, parseLetter, shortHash, shortKey, utcStamp, bytesLabel,
  type LetterModel,
} from "./format";
import { scrollPageTo } from "./hooks";
import { LogoMark } from "./illustrations";
import { EASE_DRAW, EASE_IN, EASE_IN_OUT, EASE_OUT, EASE_PRESS, S, SPRING_FLIP, SPRING_SETTLE } from "./motion";
import { CHECK_PATH, SEAL_LABEL, SealBase, SealCentre, type SealVariant } from "./Seal";
import { TamperDiff } from "./TamperDiff";
import type { CasePending, CaseRecord, CaseUiState, Notice, TamperResult, VerifyResult } from "./types";

/**
 * C6 · OutcomeBand = ClaimLetterPaper + EvidenceCertificate, with the C7 seal and the §4 B3 stamp,
 * B4 letter, B5 verify flip and §5 tamper beats. Matches the band in `case-full-1536.png` (verified),
 * `case-waiting-1536.png` (slot) and `case-invalid-1536.png` (invalid).
 *
 * Every state renders its final frame declaratively; the choreography only layers transient motion on top
 * when the state changes after mount, so a page that loads in any state (or a /kit render) is correct.
 */

export type BandSeal = "slot" | "sealing" | "closed" | SealVariant;

/** Which seal the band shows for a page state. */
export function bandSealFor(state: CaseUiState, hasEvidence: boolean): BandSeal {
  switch (state) {
    case "sealing": return "sealing";
    case "writing":
    case "verifying": return "sealed";
    case "verified": return "verified";
    case "invalid": return "invalid";
    case "rejected":
    case "expired": return "closed";
    case "failed": return hasEvidence ? "sealed" : "slot";
    default: return "slot";
  }
}
const isSeal = (s: BandSeal): s is SealVariant => s === "sealed" || s === "verified" || s === "invalid";

export interface EvidenceBandProps {
  state: CaseUiState;
  caseRecord: CaseRecord | null;
  notice: Notice;
  verify?: VerifyResult | null;
  tamper?: TamperResult | null;
  verifiedAgainAt?: string | null;
  claimPdfUrl?: string | null;
  pending?: CasePending;
  /** evidence.snapshot_bytes, or case.pending_snapshot_bytes before sealing */
  snapshotBytes: number | null;
  retentionDays?: number;
  /** KMS key shown before sealing (evidence.key_alias once sealed) */
  keyAlias?: string;
  signingAlgorithm?: string;
  /** transitions after mount animate; false = always final frames */
  live: boolean;
  onDownload?: () => void;
  onCopyLetter?: () => void;
  onRunTamperTest?: () => void;
  onVerifyAgain?: () => void;
  className?: string;
}

const STAMP_REST = "drop-shadow(0 12px 20px rgba(0,18,64,0.4))";
const STAMP_HIGH = "drop-shadow(0 40px 40px rgba(0,18,64,0.25))";
const PAPER_SHADOW = "0 2px 4px rgba(0,20,60,0.18), 0 34px 60px -26px rgba(0,16,60,0.7)";
const GHOST_SHADOW = "0 1px 2px rgba(11,27,51,0.08), 0 0px 0px 0px rgba(0,16,60,0)";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function EvidenceBand(props: EvidenceBandProps) {
  const {
    state, caseRecord, notice, verify, tamper, verifiedAgainAt, claimPdfUrl, pending = {}, snapshotBytes,
    retentionDays = 30, keyAlias = "alias/recallindia-signing", signingAlgorithm = "RSASSA_PKCS1_V1_5_SHA_256",
    live, onDownload, onCopyLetter, onRunTamperTest, onVerifyAgain, className,
  } = props;
  const reduce = useReducedMotion() ?? false;
  const ev = caseRecord?.evidence ?? null;
  const seal = bandSealFor(state, !!ev);
  const cobalt = isSeal(seal);
  const letter = React.useMemo(() => (caseRecord?.claim_text ? parseLetter(caseRecord.claim_text) : null), [caseRecord?.claim_text]);
  const written = !!letter && (state === "verifying" || state === "verified" || state === "invalid" || (state === "failed" && !!caseRecord?.claim_pdf_s3_key));
  const noun = noticeNoun(notice);

  /* ---------------------------------------------------------------- choreography state */
  const [scope, animate] = useAnimate<HTMLElement>();
  const sealRef = React.useRef<HTMLDivElement>(null);
  const sealBoxRef = React.useRef<HTMLDivElement>(null);
  const centreRef = React.useRef<HTMLDivElement>(null);
  const ring1Ref = React.useRef<HTMLSpanElement>(null);
  const ring2Ref = React.useRef<HTMLSpanElement>(null);
  const staticRingsRef = React.useRef<HTMLSpanElement>(null);
  const diffRef = React.useRef<HTMLDivElement>(null);
  const resultRef = React.useRef<HTMLDivElement>(null);
  const focusNext = React.useRef(false);

  const [holdSlotBg, setHoldSlotBg] = React.useState(false);
  const [holdInk, setHoldInk] = React.useState(false);
  const [flood, setFlood] = React.useState<{ x: number; y: number; r: number } | null>(null);
  const [sealOverride, setSealOverride] = React.useState<SealVariant | null>(null);
  const [centreOverride, setCentreOverride] = React.useState<SealVariant | null>(null);
  const [drawCheck, setDrawCheck] = React.useState(false);
  const [kvReveal, setKvReveal] = React.useState(0);
  const [letterIn, setLetterIn] = React.useState(false);

  const lastSeal = React.useRef(seal);
  const lastWritten = React.useRef(written);
  const run = React.useRef(0);

  const impact = React.useCallback((rings: boolean) => {
    if (scope.current) animate(scope.current, { y: [0, 2, 0] }, { duration: 0.12, times: [0, 0.33, 1], ease: "easeOut" });
    if (rings) {
      if (ring1Ref.current) animate(ring1Ref.current, { scale: [1, 1.45], opacity: [0.55, 0] }, { duration: 0.46, ease: EASE_DRAW });
      if (ring2Ref.current) animate(ring2Ref.current, { scale: [1, 1.8], opacity: [0.3, 0] }, { duration: 0.46, ease: EASE_DRAW, delay: 0.08 });
    }
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) navigator.vibrate?.(12);
  }, [animate, scope]);

  React.useLayoutEffect(() => {
    const from = lastSeal.current;
    lastSeal.current = seal;
    if (!live || from === seal) return;
    const id = ++run.current;
    const alive = () => run.current === id;
    const el = sealRef.current;

    // "Run tamper test" and "Verify again" replace each other: keep keyboard focus on the one that appears
    if ((from === "verified" && seal === "invalid") || (from === "invalid" && seal === "verified")) {
      focusNext.current = !!resultRef.current?.contains(document.activeElement);
    }

    // ---- B3: slot → sealed/verified/invalid (the stamp, the reward)
    if ((from === "slot" || from === "sealing") && isSeal(seal)) {
      setKvReveal((k) => k + 1);
      if (reduce) {
        if (el) animate(el, { opacity: [0, 1] }, { duration: 0.15 });
        return;
      }
      const band = scope.current;
      const box = sealBoxRef.current;
      if (band && box) {
        const b = band.getBoundingClientRect();
        const s = box.getBoundingClientRect();
        const x = s.left + s.width / 2 - b.left;
        const y = s.top + s.height / 2 - b.top;
        const r = Math.hypot(Math.max(x, b.width - x), Math.max(y, b.height - y)) + 8;
        setFlood({ x, y, r });
        setHoldSlotBg(true);
        setHoldInk(true);
      }
      if (el) { el.style.opacity = "0"; el.style.transform = "rotate(-24deg) scale(1.8)"; el.style.filter = STAMP_HIGH; }
      if (staticRingsRef.current) staticRingsRef.current.style.opacity = "0";
      void (async () => {
        setTimeout(() => alive() && setHoldInk(false), 200);
        setTimeout(() => alive() && setHoldSlotBg(false), 560);
        setTimeout(() => alive() && setFlood(null), 760);
        await sleep(120);
        if (!alive() || !el) return;
        await animate(el, { scale: [1.8, 0.94], rotate: [-24, -8], opacity: [0, 1], filter: [STAMP_HIGH, STAMP_REST] }, { duration: 0.22, ease: EASE_PRESS });
        if (!alive()) return;
        impact(true);
        if (staticRingsRef.current) animate(staticRingsRef.current, { opacity: [0, 1] }, { duration: 0.2 });
        await animate(el, { scale: 1 }, SPRING_SETTLE);
      })();
      return;
    }

    // ---- B5: sealed → verified (the centre flips, the check draws)
    if (from === "sealed" && seal === "verified") {
      if (reduce) { if (centreRef.current) animate(centreRef.current, { opacity: [0, 1] }, { duration: 0.15 }); return; }
      setCentreOverride("sealed");
      void (async () => {
        const c = centreRef.current;
        if (!c) return;
        await animate(c, { rotateY: [0, 90] }, { duration: 0.14, ease: EASE_IN });
        if (!alive()) return;
        setCentreOverride(null);
        setDrawCheck(true);
        await animate(c, { rotateY: [90, 0] }, SPRING_FLIP);
      })();
      return;
    }

    // ---- X1: verified → invalid (the denial; no impact rings)
    if (from === "verified" && seal === "invalid") {
      if (reduce) { if (el) animate(el, { opacity: [0, 1] }, { duration: 0.15 }); return; }
      setSealOverride("verified");
      void (async () => {
        if (!el) return;
        await animate(el, { scale: [1, 1.06], rotate: [-8, -4] }, { duration: 0.12, ease: EASE_OUT });
        if (!alive()) return;
        setSealOverride(null);
        setDrawCheck(false);
        await animate(el, { scale: [1.25, 0.96], rotate: [-4, -8] }, { duration: 0.2, ease: EASE_PRESS });
        if (!alive()) return;
        impact(false);
        animate(el, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.36, ease: "easeInOut" });
        await animate(el, { scale: 1 }, SPRING_SETTLE);
        // X5: keep the diff card in view (minimum scroll)
        await sleep(160);
        const d = diffRef.current?.getBoundingClientRect();
        if (alive() && d && d.bottom > window.innerHeight) scrollPageTo(window.scrollY + d.bottom - window.innerHeight + 16, 400, EASE_IN_OUT);
      })();
      return;
    }

    // ---- V1: invalid → verified (re-stamp at 0.8× distance, rings on)
    if (from === "invalid" && seal === "verified") {
      setDrawCheck(false);
      if (reduce) { if (el) animate(el, { opacity: [0, 1] }, { duration: 0.15 }); return; }
      if (el) { el.style.opacity = "0"; }
      void (async () => {
        if (!el) return;
        await animate(el, { scale: [1.5, 0.95], rotate: [-18, -8], opacity: [0, 1], filter: [STAMP_HIGH, STAMP_REST] }, { duration: 0.18, ease: EASE_PRESS });
        if (!alive()) return;
        impact(true);
        await animate(el, { scale: 1 }, { duration: 0.12, ease: EASE_OUT });
      })();
    }
  }, [seal, live, reduce, animate, scope, impact]);

  // B4: the ghost paper becomes the written paper
  React.useEffect(() => {
    const was = lastWritten.current;
    lastWritten.current = written;
    if (live && !was && written && !reduce) setLetterIn(true);
  }, [written, live, reduce]);

  const shown: BandSeal = sealOverride ?? seal;
  const centreShown: SealVariant | null = isSeal(shown) ? centreOverride ?? shown : null;
  const onBlue = cobalt && !holdInk;
  const bgCobalt = cobalt && !holdSlotBg;

  /* ---------------------------------------------------------------- copy */
  const closed = seal === "closed";
  const h2 = cobalt ? "Your claim, sealed" : closed ? "Nothing was sealed" : "Your claim appears here";
  const lede = cobalt
    ? `The letter cites ${noun}. The copy of ${noun} is locked for ${retentionDays} days and signed, so the ${caseRecord?.claim_addressee ?? "seller"} can check it for itself.`
    : closed
      ? state === "expired" ? "This approval expired, so no letter was written." : "This case was dismissed, so no letter was written."
      : `Approve above and RecallIndia seals ${noun}, writes the letter and checks the signature. It takes about 9 seconds.`;

  return (
    <section
      ref={scope}
      id="evidence"
      aria-labelledby="band-h"
      className={cn(
        "relative scroll-mt-20 overflow-hidden rounded-lg p-7 transition-colors duration-150 max-md:px-4 max-md:py-5",
        bgCobalt ? "bg-cobalt" : "bg-surface-2 shadow-[inset_0_0_0_2px_#C6D2E4]",
        className,
      )}
    >
      {flood && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cobalt"
          initial={{ clipPath: `circle(0px at ${flood.x}px ${flood.y}px)` }}
          animate={{ clipPath: `circle(${flood.r}px at ${flood.x}px ${flood.y}px)` }}
          transition={{ duration: 0.56, ease: EASE_DRAW }}
        />
      )}

      <div className="relative">
        <header className="mb-6 flex items-end gap-5 max-md:mb-[18px] max-md:flex-col max-md:items-stretch max-md:gap-3.5">
          <div className="min-w-0">
            <h2 id="band-h" className={cn("font-display text-[34px] leading-[1.05] font-extrabold tracking-[-.03em] transition-colors duration-[240ms] max-md:text-[28px]", onBlue ? "text-white" : "text-ink")}>
              {h2}
            </h2>
            <p className={cn("mt-2.5 max-w-[560px] text-[15.5px] leading-[1.5] transition-colors duration-[240ms]", onBlue ? "text-on-cobalt-muted" : "text-ink-muted")}>{lede}</p>
          </div>
          <span className="flex-1" />
          <AnimatePresence initial={false}>
            {written && (
              <motion.div
                key="acts"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                className="flex flex-none gap-2.5 max-md:flex-col"
              >
                <DownloadButton url={claimPdfUrl} caseId={caseRecord?.case_id} onDownload={onDownload} variant="onBlue" />
                <Button
                  variant="outlineOnBlue"
                  onClick={onCopyLetter}
                  icon={<Copy aria-hidden className="size-[18px]" strokeWidth={1.9} />}
                  className="border-white/55! max-md:w-full"
                >
                  Copy letter text
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        <div className={cn(
          "grid grid-cols-[500px_minmax(0,1fr)] items-start gap-8",
          "lg:max-[1440px]:grid-cols-[minmax(0,1fr)_420px]",
          "max-lg:grid-cols-1 max-md:gap-[22px]",
        )}>
          <div className="min-w-0 max-lg:order-2 max-lg:mx-auto max-lg:w-full md:max-lg:max-w-[560px]">
            <AnimatePresence initial={false} mode="wait">
              {written && letter ? (
                <ClaimLetterPaper
                  key="paper"
                  letter={letter}
                  caseId={caseRecord?.case_id ?? ""}
                  sha256={ev?.sha256 ?? null}
                  lockedUntil={ev ? lockDate(ev.object_lock_retain_until) : null}
                  noticeNoun={noun}
                  bad={shown === "invalid"}
                  animateIn={letterIn}
                />
              ) : (
                <GhostPaper key="ghost" noticeNoun={noun} closed={closed} />
              )}
            </AnimatePresence>
          </div>

          <div aria-labelledby="cert-h" className="min-w-0 max-lg:order-1">
            <div className="flex items-center gap-[34px] pl-3.5 max-md:flex-col max-md:items-start max-md:gap-3.5 max-md:pl-3">
              <div ref={sealBoxRef} className="relative grid flex-none place-items-center">
                {isSeal(shown) && (
                  <span ref={staticRingsRef} aria-hidden className="pointer-events-none absolute inset-0">
                    <span className="absolute -inset-3 rounded-full border-[1.5px] border-white/28" />
                    <span className="absolute -inset-[26px] rounded-full border border-white/12 max-md:hidden" />
                  </span>
                )}
                <span ref={ring1Ref} aria-hidden className="pointer-events-none absolute inset-0 rounded-full border-2 border-white opacity-0" />
                <span ref={ring2Ref} aria-hidden className="pointer-events-none absolute inset-0 rounded-full border border-white opacity-0" />
                {isSeal(shown) ? (
                  <div
                    ref={sealRef}
                    role="img"
                    aria-label={SEAL_LABEL[shown]}
                    className="relative size-[176px] max-md:size-[132px]"
                    style={{ transform: "rotate(-8deg)", filter: STAMP_REST, perspective: 600 }}
                  >
                    <AnimatePresence initial={false}>
                      <motion.div key={shown} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        <SealBase variant={shown} flippedByte={tamper?.flipped_byte_index} />
                      </motion.div>
                    </AnimatePresence>
                    <div ref={centreRef} className="absolute inset-0">
                      {centreShown && (
                        <SealCentre
                          variant={centreShown}
                          glyph={centreShown === "verified" && drawCheck ? (
                            <motion.path
                              d={CHECK_PATH} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"
                              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.24, ease: EASE_OUT }}
                            />
                          ) : undefined}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <SealSlot sealing={shown === "sealing"} closed={closed} noticeNoun={noun} />
                )}
              </div>

              <div ref={resultRef} className="min-w-0">
                <div id="cert-h" className={cn(FIELD_LABEL, "mb-2.5 opacity-80 transition-colors duration-[240ms]", onBlue ? "text-white!" : "text-ink!")}>
                  Evidence certificate
                </div>
                <AnimatePresence initial={false} mode="wait">
                  <motion.div key={resultKey(shown, state)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
                    <CertificateResult
                      focusNext={focusNext}
                      seal={shown}
                      state={state}
                      onBlue={onBlue}
                      noticeNoun={noun}
                      lockedUntil={ev ? lockDate(ev.object_lock_retain_until) : null}
                      checkedAt={verifiedAgainAt ?? verify?.checked_at ?? null}
                      testedAt={tamper?.checked_at ?? null}
                      pending={pending}
                      onRunTamperTest={onRunTamperTest}
                      onVerifyAgain={onVerifyAgain}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {shown === "invalid" && tamper && ev && (
                <motion.div
                  key="diff"
                  initial={{ height: 0, opacity: 0, overflow: "hidden" }}
                  animate={{
                    height: "auto", opacity: 1, transitionEnd: { overflow: "visible" },
                    transition: { height: { ...S.layout, delay: 0.12 }, opacity: { duration: 0.2, delay: 0.12 } },
                  }}
                  exit={{ height: 0, opacity: 0, overflow: "hidden", transition: { opacity: { duration: 0.16 }, height: { duration: 0.26, ease: EASE_IN } } }}
                >
                  <div ref={diffRef} className="pt-5">
                    <TamperDiff
                      flippedByteIndex={tamper.flipped_byte_index}
                      byteBefore={tamper.byte_before}
                      byteAfter={tamper.byte_after}
                      snapshotBytes={ev.snapshot_bytes}
                      signedSha256={ev.sha256}
                      recomputedSha256={tamper.recomputed_sha256}
                      demoControl={tamper.demo_control}
                      animate={live}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!closed && (
              <CertificateList
                key={kvReveal}
                reveal={kvReveal > 0 && live && !reduce}
                seal={shown}
                onBlue={onBlue}
                evidence={ev}
                notice={notice}
                snapshotBytes={snapshotBytes}
                retentionDays={retentionDays}
                keyAlias={keyAlias}
                signingAlgorithm={signingAlgorithm}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const resultKey = (s: BandSeal, state: CaseUiState) => (s === "sealed" ? `sealed-${state}` : s);

/* ------------------------------------------------------------------ download (shared with the case file) */

export function DownloadButton({
  url, caseId, onDownload, variant, className,
}: { url?: string | null; caseId?: string; onDownload?: () => void; variant: "onBlue" | "primary" | "secondary"; className?: string }) {
  const icon = <Download aria-hidden className="size-[18px]" strokeWidth={2.1} />;
  const cls = cn("max-md:w-full", className);
  return url ? (
    <Button href={url} download={`${caseId ?? "claim"}.pdf`} variant={variant} icon={icon} data-action="download" className={cls}>
      Download claim letter (PDF)
    </Button>
  ) : (
    <Button variant={variant} icon={icon} onClick={onDownload} data-action="download" className={cls}>
      Download claim letter (PDF)
    </Button>
  );
}

/* ------------------------------------------------------------------ certificate */

function CertificateResult({
  focusNext, seal, state, onBlue, noticeNoun: noun, lockedUntil, checkedAt, testedAt, pending, onRunTamperTest, onVerifyAgain,
}: {
  focusNext: React.RefObject<boolean>;
  seal: BandSeal; state: CaseUiState; onBlue: boolean; noticeNoun: string; lockedUntil: string | null;
  checkedAt: string | null; testedAt: string | null; pending: CasePending;
  onRunTamperTest?: () => void; onVerifyAgain?: () => void;
}) {
  const h3 = cn("font-display text-[30px] leading-[1.05] font-extrabold tracking-[-.03em] transition-colors duration-[240ms]", onBlue ? "text-white" : "text-ink");
  const p = cn("mt-2 text-[15px] leading-[1.5] transition-colors duration-[240ms]", onBlue ? "text-on-cobalt-muted" : "text-ink-muted");
  const chk = "mt-2 text-[13px] leading-none font-medium text-on-cobalt-muted tabular-nums";
  const box = React.useRef<HTMLDivElement>(null);
  // mounted as the replacement block: take over focus from the button that just left
  React.useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    box.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, [focusNext]);

  if (seal === "verified") {
    return (
      <div ref={box}>
        <h3 className={h3}>Verified</h3>
        <p className={p}>AWS KMS confirms the sealed copy still hashes to the signed digest.</p>
        {checkedAt && <div className={chk}>Last checked {istTime(checkedAt)} IST</div>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="outlineOnBlue"
            loading={pending.tamper}
            aria-disabled={pending.tamper || undefined}
            onClick={() => { if (!pending.tamper) onRunTamperTest?.(); }}
            icon={<Activity aria-hidden className="size-[18px]" strokeWidth={1.9} />}
            className="h-10! pointer-coarse:h-11! border-white/55! px-3.5! text-[14px]!"
          >
            {pending.tamper ? "Testing…" : "Run tamper test"}
          </Button>
          <span className="max-w-[190px] text-[12.5px] leading-[1.4] text-on-cobalt-muted">Flips one byte of a downloaded copy. Nothing stored changes.</span>
        </div>
      </div>
    );
  }
  if (seal === "invalid") {
    return (
      <div ref={box}>
        <h3 className={h3}>Does not match</h3>
        <p className={p}>One byte of the copy changed, so its hash no longer matches the signed digest.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="onBlue"
            loading={pending.verify}
            aria-disabled={pending.verify || undefined}
            onClick={() => { if (!pending.verify) onVerifyAgain?.(); }}
            icon={<Key aria-hidden className="size-[18px]" strokeWidth={1.9} />}
            data-action="verify-again"
            className="h-10! pointer-coarse:h-11! px-3.5! text-[14px]!"
          >
            {pending.verify ? "Verifying…" : "Verify again"}
          </Button>
          {testedAt && <span className={cn(chk, "mt-0")}>Tested {istTime(testedAt)} IST</span>}
        </div>
      </div>
    );
  }
  if (seal === "sealed") {
    return (
      <>
        <h3 className={h3}>Sealed</h3>
        <p className={p}>
          {state === "verifying" ? "Asking AWS KMS to verify the signature…" : `${cap(noun)} is locked until ${lockedUntil ?? "…"}. Checking the signature next.`}
        </p>
      </>
    );
  }
  if (seal === "closed") {
    return (
      <>
        <h3 className={h3}>Not sealed</h3>
        <p className={p}>{state === "expired" ? "Nothing was sealed: this approval expired." : "Nothing was sealed: this case was dismissed."}</p>
      </>
    );
  }
  return (
    <>
      <h3 className={h3}>Not sealed yet</h3>
      <p className={p}>{cap(noun)} is locked and signed the moment you approve.</p>
    </>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface KvRow { k: string; v: React.ReactNode; small?: React.ReactNode; mono?: "hash" | "code"; smallMono?: boolean }

function CertificateList({
  reveal, seal, onBlue, evidence: ev, notice, snapshotBytes, retentionDays, keyAlias, signingAlgorithm,
}: {
  reveal: boolean; seal: BandSeal; onBlue: boolean; evidence: CaseRecord["evidence"]; notice: Notice;
  snapshotBytes: number | null; retentionDays: number; keyAlias: string; signingAlgorithm: string;
}) {
  const src = SOURCE_SHORT[notice.source];
  const what = notice.source === "cdsco_nsq" && notice.row_ref?.row != null ? `Row ${notice.row_ref.row} from ${src}'s portal` : `Notice JSON from ${src}`;
  const bytes = snapshotBytes != null ? ` · ${bytesLabel(snapshotBytes)} bytes` : "";
  const sealedRows = isSeal(seal) && ev;
  const lockedDays = ev ? Math.round((new Date(ev.object_lock_retain_until).getTime() - new Date(ev.signed_at).getTime()) / 86_400_000) : retentionDays;
  let rows: KvRow[];
  if (sealedRows) {
    const [g1, g2] = hashGroups(ev.sha256);
    const signed: KvRow = { k: "Signed", v: utcStamp(ev.signed_at), small: istStamp(ev.signed_at) };
    const key: KvRow = { k: "Key", v: ev.key_alias, small: ev.signing_algorithm, mono: "code" };
    const lock: KvRow = { k: "Locked until", v: lockDate(ev.object_lock_retain_until), small: `S3 Object Lock, ${ev.object_lock_mode.toLowerCase()} mode, ${lockedDays} days` };
    rows = seal === "invalid"
      ? [signed, key, lock]
      : [
          { k: "SHA-256", v: <>{g1}<br />{g2}</>, mono: "hash" },
          signed, key, lock,
          { k: "Snapshot", v: `${what} · ${bytesLabel(ev.snapshot_bytes)} bytes`, small: shortKey(ev.snapshot_s3_key), smallMono: true },
        ];
  } else {
    const later = "Appears when sealed";
    rows = [
      { k: "SHA-256", v: seal === "sealing" ? "Writing to S3 Object Lock…" : later },
      { k: "Signed", v: later },
      { k: "Key", v: keyAlias, small: signingAlgorithm, mono: "code" },
      { k: "Locked until", v: `${retentionDays} days after you approve` },
      { k: "Snapshot", v: `${what}${bytes}` },
    ];
  }

  const line = onBlue ? "border-white/20" : "border-[#CFD9E8]";
  const dt = cn("m-0 border-t py-3 text-[13px] leading-[1.45] font-semibold transition-colors duration-[240ms] max-md:pb-1", line, onBlue ? "text-on-cobalt-muted" : "text-ink-muted");
  const dd = cn(
    "m-0 border-t py-3 text-[14.5px] leading-[1.45] transition-colors duration-[240ms] max-md:border-t-0 max-md:pt-0", line,
    onBlue ? "font-medium text-white" : "font-normal text-ink-muted",
  );
  const small = cn("block text-[13px] leading-[1.4] font-normal", onBlue ? "text-on-cobalt-muted" : "text-ink-muted");

  return (
    <dl className="mt-[22px] grid grid-cols-[118px_minmax(0,1fr)] max-md:grid-cols-1">
      {rows.map((r, i) => {
        const anim = reveal
          ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, ease: EASE_OUT, delay: 0.38 + i * 0.05 } }
          : {};
        return (
          <React.Fragment key={r.k}>
            <motion.dt {...anim} className={dt}>{r.k}</motion.dt>
            <motion.dd
              {...anim}
              className={cn(dd, r.mono === "hash" && "font-mono text-[13.5px]! leading-[1.55]! font-normal! tracking-[.01em]", r.mono === "code" && "font-mono text-[13px]! leading-[1.5]! font-normal!")}
            >
              {r.v}
              {r.small && <small className={cn(small, r.smallMono ? "font-mono text-[12px] leading-[1.5]" : "font-sans")}>{r.small}</small>}
            </motion.dd>
          </React.Fragment>
        );
      })}
    </dl>
  );
}

/* ------------------------------------------------------------------ the slot (C7 "slot" variant) */

function SealSlot({ sealing, closed, noticeNoun: noun }: { sealing: boolean; closed: boolean; noticeNoun: string }) {
  return (
    <div className="relative grid size-[176px] place-items-center rounded-full bg-white/55 text-center text-[13px] leading-[1.3] font-semibold text-ink-muted max-md:size-[132px]">
      <svg viewBox="0 0 176 176" aria-hidden className="absolute inset-0 size-full">
        <motion.circle
          cx="88" cy="88" r="86.75" fill="none" stroke="#9AA9BF" strokeWidth="2.5" strokeDasharray="7 6"
          animate={sealing ? { strokeDashoffset: [0, -26] } : { strokeDashoffset: 0 }}
          transition={sealing ? { duration: 1.6, ease: "linear", repeat: Infinity } : { duration: 0 }}
        />
      </svg>
      <span className="relative" aria-live="off">
        {closed ? <X aria-hidden className="mx-auto mb-1.5 block size-7 text-[#8C9AB0]" strokeWidth={1.9} /> : <Stamp aria-hidden className="mx-auto mb-1.5 block size-7 text-[#8C9AB0]" strokeWidth={1.9} />}
        {closed ? <>Nothing<br />sealed</> : sealing ? <>Sealing<br />{noun}…</> : <>The seal<br />lands here</>}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ papers */

export interface ClaimLetterPaperProps {
  letter: LetterModel;
  caseId: string;
  sha256: string | null;
  lockedUntil: string | null;
  noticeNoun: string;
  /** invalid: the attachment chip turns to its bad variant */
  bad?: boolean;
  /** B4: lift + blocks one at a time */
  animateIn?: boolean;
}

export function ClaimLetterPaper({ letter, caseId, sha256, lockedUntil, noticeNoun: noun, bad = false, animateIn = false }: ClaimLetterPaperProps) {
  let i = 0;
  const block = () => {
    const d = (i++) * 0.07;
    return animateIn ? { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: EASE_OUT, delay: d } } : {};
  };
  const hashLine = sha256 ? `SHA-256 ${shortHash(sha256)}${lockedUntil ? ` · locked until ${lockedUntil}` : ""}` : null;
  return (
    <motion.article
      aria-label="Claim letter preview"
      initial={animateIn ? { y: 12, boxShadow: GHOST_SHADOW } : false}
      animate={{ y: 0, boxShadow: PAPER_SHADOW }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={S.lift}
      className="relative rounded-[6px] bg-white px-[34px] pt-[30px] text-[14px] leading-[1.62] text-ink [overflow-wrap:anywhere] max-md:px-5 max-md:pt-[22px] max-md:text-[13.5px]"
    >
      <motion.div {...block()} className="mb-[18px] flex items-center gap-2.5 border-b border-line pb-4">
        <LogoMark size={24} />
        <b className="font-display text-[15px] leading-none font-extrabold tracking-[-.02em]">Claim letter</b>
        <span className="font-mono text-[12.5px] leading-none text-ink-muted max-md:hidden">{caseId}</span>
        <span className="ml-auto text-[13px] leading-none font-medium text-ink max-md:text-[12.5px]">{letter.date}</span>
      </motion.div>
      {letter.to.length > 0 && (
        <motion.p {...block()} className="mb-3">
          {letter.to.map((l, k) => <React.Fragment key={k}>{k > 0 && <br />}{l}</React.Fragment>)}
        </motion.p>
      )}
      {letter.subject && <motion.p {...block()} className="mb-3 font-semibold">{letter.subject}</motion.p>}
      {letter.greeting && <motion.p {...block()} className="mb-3">{letter.greeting}</motion.p>}
      {letter.body.map((b, k) => <motion.p key={k} {...block()} className="mb-3">{b}</motion.p>)}
      <motion.div {...block()} className="-mx-[34px] mt-1 grid gap-2.5 rounded-b-[6px] border-t border-line bg-surface-2 px-[34px] pt-3.5 pb-4 max-md:-mx-5 max-md:px-5 max-md:pt-3 max-md:pb-3.5">
        <span className="text-[13px] leading-[1.45] text-ink-muted">The PDF goes on to ask for a refund or a replacement and a written reply within 15 days.</span>
        <div className="flex items-center gap-2.5 rounded-[10px] border border-line bg-white px-3 py-[9px] text-[13px] leading-[1.45] text-ink-muted">
          {bad
            ? <TriangleAlert aria-hidden className="size-[18px] flex-none text-danger" strokeWidth={2.1} />
            : <Lock aria-hidden className="size-[18px] flex-none text-success" strokeWidth={1.9} />}
          <span className="min-w-0">
            {bad ? "The copy under test no longer matches this hash" : `Cites the sealed copy of ${noun}`}
            {hashLine && <code className="block font-mono text-[12px] leading-[1.4] font-normal break-words text-ink-muted">{hashLine}</code>}
          </span>
        </div>
      </motion.div>
    </motion.article>
  );
}

export function GhostPaper({ noticeNoun: noun, closed = false }: { noticeNoun: string; closed?: boolean }) {
  const bar = (w: string, mb?: string) => <i aria-hidden className={cn("mb-2.5 block h-2.5 rounded-[5px] bg-surface-2", mb)} style={{ width: w }} />;
  return (
    <motion.article
      aria-label="Claim letter, not written yet"
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      className="relative rounded-[6px] bg-white px-[34px] pt-[30px] pb-px text-ink shadow-[0_1px_2px_rgb(11_27_51/.08)] outline-[1.5px] -outline-offset-1 outline-[#C6D2E4] outline-dashed max-md:px-5 max-md:pt-[22px]"
    >
      <div className="mb-[18px] flex items-center gap-2.5 border-b border-line pb-4">
        <LogoMark size={24} />
        <b className="font-display text-[15px] leading-none font-extrabold tracking-[-.02em]">Claim letter</b>
        <span className="text-[13px] leading-none font-medium text-ink-muted">{closed ? "not written" : "not written yet"}</span>
      </div>
      {bar("46%")}{bar("62%")}
      {!closed && (
        <div className="mt-[18px] mb-[22px] flex items-center gap-2.5 rounded-[10px] bg-cobalt-soft px-3.5 py-3 text-[14px] leading-[1.35] font-semibold text-cobalt">
          <FileText aria-hidden className="size-5 flex-none" strokeWidth={1.9} />
          Written the moment you approve, citing {noun} and the sealed copy&apos;s hash.
        </div>
      )}
      {bar("94%")}{bar("88%")}{bar("72%", "mb-[22px]")}
      {bar("96%")}{bar("91%")}{bar("95%")}{bar("60%", "mb-[22px]")}
      {bar("90%")}{bar("48%", "mb-[30px]")}
    </motion.article>
  );
}
