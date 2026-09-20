"use client";
/**
 * ScanConfirm (spec/mine.md §2.12): the scan step of the Add sheet. Every word Textract read gets a box on the
 * photo, the batch box turns cobalt, and the batch morphs into a foil chip (layoutId "scan-batch").
 * Matches the sheet body in mockups/mine-add-1536.png (600 × 450 photo + read-back) and mine-add-390.png.
 *
 * States (props.scan): idle · manual · uploading · reading · result (→ confirmed | candidates | failed) ·
 * upload-error · textract-error. The component resolves `result` with the candidate rule in derive.ts.
 *
 * The morph (reading or candidates → confirmed):
 *   1. the batch box stroke goes 1.5 px ink → 3 px cobalt with a white halo (200 ms)
 *   2. +120 ms: a chip with layoutId "scan-batch" leaves the box's rect, rotated to the box angle, text at 30%
 *   3. it springs (300/30, ≈380 ms) to the callout, rotating to 0° and taking on the foil fill
 *   4. the leader draws over 240 ms as the chip lands
 *   5. +100 ms after landing: the Batch field chip fades in (180 ms) and the "2 Batch" tag and field number pulse
 *   Reduced motion: no travel; the box turns cobalt and the callout and field chip fade in (150 ms).
 */
import * as React from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Camera, Check, Pencil } from "lucide-react";
import { Button, FoilChip, cn } from "../ui";
import { fieldWords, parseHumanDate, scanOutcome, type ScanOutcome } from "./derive";
import { IlStrip, Spinner } from "./illustrations";
import { springMorph } from "./motion";
import type { HouseholdMode, NewMedicineItem, OcrResult, OcrWord, ScanPhase, ScanPhoto } from "./types";

export interface ScanDraft {
  name: string;
  batch: string;
  exp: string;
  /** As typed ("12 Jul 2026"). */
  bought: string;
}

export interface ScanConfirmProps {
  scan: ScanPhase;
  /** The photo being read (object URL + natural size). */
  photo?: ScanPhoto | null;
  /** `POST /uploads` → `key`, saved as `photo_s3_key`. */
  photoKey?: string | null;
  household?: HouseholdMode;
  /** "Check this batch" is running (`POST /households` in the demo, then `POST /items`). */
  submitting?: boolean;
  /** Start with the Batch field in edit mode (needs-you → "Fix the batch"). */
  editBatch?: boolean;
  /** Prefill (edit mode). */
  initial?: Partial<ScanDraft>;
  onPhoto?: (file: File) => void;
  onRetake?: () => void;
  onRetry?: () => void;
  onTypeInstead?: () => void;
  onPickCandidate?: (wordIndex: number) => void;
  onSubmit?: (item: NewMedicineItem) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/* --------------------------------------------------------------- geometry */

type Pt = [number, number];
type Crop = { x: number; y: number; w: number; h: number };

function wordPoly(w: OcrWord, W: number, H: number): Pt[] {
  if (w.poly) return w.poly.map(([x, y]) => [x * W, y * H] as Pt);
  const { left, top, width, height } = w.box;
  return [
    [left * W, top * H],
    [(left + width) * W, top * H],
    [(left + width) * W, (top + height) * H],
    [left * W, (top + height) * H],
  ];
}

/** Pad a quad along its own axes (the mock pads the batch box 7 image px at a 1100 px crop). */
function padPoly(p: Pt[], pad: number): { poly: Pt[]; angle: number; w: number; h: number; c: Pt } {
  const cx = p.reduce((a, q) => a + q[0], 0) / 4;
  const cy = p.reduce((a, q) => a + q[1], 0) / 4;
  const ux = p[1]![0] - p[0]![0];
  const uy = p[1]![1] - p[0]![1];
  const ul = Math.hypot(ux, uy) || 1;
  const U: Pt = [ux / ul, uy / ul];
  const V: Pt = [-U[1], U[0]];
  const poly = p.map(([x, y]) => {
    const du = (x - cx) * U[0] + (y - cy) * U[1];
    const dv = (x - cx) * V[0] + (y - cy) * V[1];
    const nu = du + Math.sign(du) * pad;
    const nv = dv + Math.sign(dv) * pad;
    return [cx + nu * U[0] + nv * V[0], cy + nu * U[1] + nv * V[1]] as Pt;
  });
  const w = Math.hypot(poly[1]![0] - poly[0]![0], poly[1]![1] - poly[0]![1]);
  const h = Math.hypot(poly[3]![0] - poly[0]![0], poly[3]![1] - poly[0]![1]);
  return { poly, angle: (Math.atan2(uy, ux) * 180) / Math.PI, w, h, c: [cx, cy] };
}

/** Image px → % of a 4:3 figure, as `preserveAspectRatio="xMidYMid slice"` draws it. */
function toPct(crop: Crop, [x, y]: Pt): Pt {
  const s = Math.max(4 / crop.w, 3 / crop.h);
  const ox = (4 - crop.w * s) / 2;
  const oy = (3 - crop.h * s) / 2;
  return [((ox + (x - crop.x) * s) / 4) * 100, ((oy + (y - crop.y) * s) / 3) * 100];
}
function lenPct(crop: Crop, len: number, axis: "x" | "y"): number {
  const s = Math.max(4 / crop.w, 3 / crop.h);
  return ((len * s) / (axis === "x" ? 4 : 3)) * 100;
}

const pts = (p: Pt[]) => p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ");

/** The word left of a candidate on the same line (for "next to EXP"). */
function neighbour(words: OcrWord[], i: number): string | null {
  const c = (w: OcrWord): Pt => [w.box.left + w.box.width / 2, w.box.top + w.box.height / 2];
  const [cx, cy] = c(words[i]!);
  const h = words[i]!.box.height;
  let best: { d: number; t: string } | null = null;
  words.forEach((w, j) => {
    if (j === i) return;
    const [x, y] = c(w);
    if (x >= cx || Math.abs(y - cy) > h * 2.5) return;
    const d = cx - x + 2 * Math.abs(y - cy);
    if (!best || d < best.d) best = { d, t: w.text };
  });
  return (best as { d: number; t: string } | null)?.t ?? null;
}

/* ------------------------------------------------------------------- bits */

function Tag({ n, label, tone, at, pulse, className }: { n: string; label?: string; tone: "ink" | "cobalt"; at: Pt; pulse?: boolean; className?: string }) {
  return (
    <motion.span
      aria-hidden
      className={cn(
        "absolute inline-flex h-5 items-center gap-[5px] rounded-pill pr-[7px] pl-[3px] font-sans text-[11px]/none font-semibold whitespace-nowrap shadow-[0_1px_2px_rgb(11_27_51/.2)] md:h-6 md:pr-[9px] md:pl-1 md:text-[12px]/none",
        tone === "ink" ? "bg-ink text-white" : "bg-cobalt text-white",
        !label && "pr-[3px] md:pr-1",
        className,
      )}
      style={{ left: `${at[0]}%`, top: `${at[1]}%`, translateX: -2, translateY: "calc(-100% - 5px)" }}
      animate={pulse ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={{ duration: 0.24 }}
    >
      <b className={cn("grid size-3.5 place-items-center rounded-full bg-white text-[10px]/none font-bold md:size-[17px] md:text-[11px]/none", tone === "ink" ? "text-ink" : "text-cobalt")}>{n}</b>
      {label}
    </motion.span>
  );
}

function Corner({ at, className }: { at: "tl" | "bl" | "br"; className?: string }) {
  return (
    <i
      aria-hidden
      className={cn(
        "absolute size-[18px] border-white opacity-90 md:size-[26px]",
        at === "tl" && "top-2.5 left-2.5 rounded-tl-[8px] border-t-[2.5px] border-l-[2.5px] md:top-3.5 md:left-3.5 md:border-t-[3px] md:border-l-[3px]",
        at === "bl" && "bottom-2.5 left-2.5 rounded-bl-[8px] border-b-[2.5px] border-l-[2.5px] md:bottom-3.5 md:left-3.5 md:border-b-[3px] md:border-l-[3px]",
        at === "br" && "right-2.5 bottom-2.5 rounded-br-[8px] border-r-[2.5px] border-b-[2.5px] md:right-3.5 md:bottom-3.5 md:border-r-[3px] md:border-b-[3px]",
        className,
      )}
    />
  );
}

function StatusRow({ state, children }: { state: "done" | "running" | "waiting"; children: React.ReactNode }) {
  return (
    <li className={cn("grid h-[38px] grid-cols-[24px_1fr] items-center gap-2.5 border-t border-line font-sans text-[14px]/none font-medium first:border-t-0", state === "running" && "text-cobalt", state === "waiting" && "text-ink-muted")}>
      {state === "done" ? (
        <span aria-hidden className="grid size-5 place-items-center rounded-full bg-success-soft text-success">
          <Check className="size-[13px]" strokeWidth={2.8} />
        </span>
      ) : state === "running" ? (
        <Spinner className="ml-[3px]" />
      ) : (
        <span aria-hidden className="size-5 rounded-full border-[1.5px] border-dashed border-line-strong" />
      )}
      {children}
    </li>
  );
}

function StateChip({ tone, children }: { tone: "success" | "warning"; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-7 items-center gap-2 self-start rounded-pill pr-3 pl-1.5 font-sans text-[13px]/none font-semibold", tone === "success" ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
      <span aria-hidden className={cn("grid size-[18px] place-items-center rounded-full text-white", tone === "success" ? "bg-success" : "bg-warning")}>
        {tone === "success" ? <Check className="size-3" strokeWidth={3} /> : <b className="text-[11px]/none">!</b>}
      </span>
      {children}
    </span>
  );
}

const inputCls =
  "h-11 w-full min-w-0 rounded-sm border border-line-strong bg-surface-1 px-3 font-sans text-[16px] font-medium text-ink placeholder:font-normal placeholder:text-ink-muted " +
  "focus:border-cobalt focus:shadow-[0_0_0_1px_var(--cobalt),0_0_0_4px_var(--cobalt-soft)] focus:outline-none";

function Field({
  n,
  tone = "ink",
  label,
  hint,
  first = false,
  bordered = true,
  pulse = false,
  htmlFor,
  children,
}: {
  n?: string;
  tone?: "ink" | "cobalt";
  label: string;
  hint?: string;
  first?: boolean;
  bordered?: boolean;
  pulse?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-x-3 gap-y-1.5 py-2 md:py-[11px]", n ? "grid-cols-[28px_1fr]" : "grid-cols-1", bordered && !first && "border-t border-line", first && "pt-1 md:pt-1")}>
      {n ? (
        <motion.span
          aria-hidden
          className={cn("row-span-2 mt-px grid size-6 place-items-center rounded-full font-sans text-[12px]/none font-bold text-white", tone === "cobalt" ? "bg-cobalt" : "bg-ink")}
          animate={pulse ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.24 }}
        >
          {n}
        </motion.span>
      ) : null}
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 font-sans text-[13px]/[1.3] font-semibold text-ink">
        {label}
        {hint ? <span className="font-normal text-ink-muted">{hint}</span> : null}
      </label>
      <div className="flex min-w-0 items-center gap-3">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- morph */

type Morph = "none" | "cobalt" | "flying" | "landed" | "done";

/**
 * Runs the morph when a batch is found. `animate` is read when the batch index changes: true when arriving
 * from reading or a candidate pick, false when the component mounts on a result (kit, reload).
 * Returns the stage and whether this landing is animated (for one-shot entrances and pulses).
 */
function useMorph(batchIndex: number | null, animate: boolean): { stage: Morph; animated: boolean } {
  const reduce = useReducedMotion();
  const [state, setState] = React.useState<{ stage: Morph; animated: boolean }>({ stage: batchIndex !== null && !animate ? "done" : "none", animated: false });
  React.useEffect(() => {
    if (batchIndex === null) {
      setState({ stage: "none", animated: false });
      return;
    }
    if (!animate || reduce) {
      setState({ stage: "done", animated: false });
      return;
    }
    setState({ stage: "cobalt", animated: true });
    const t = [
      window.setTimeout(() => setState({ stage: "flying", animated: true }), 120),
      window.setTimeout(() => setState({ stage: "landed", animated: true }), 120 + 380),
      window.setTimeout(() => setState({ stage: "done", animated: true }), 120 + 380 + 100),
    ];
    return () => t.forEach((x) => window.clearTimeout(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchIndex]);
  return state;
}

/* ---------------------------------------------------------------- the view */

const DEMO_PAD_RATIO = 7 / 1100;

export function ScanConfirm({
  scan,
  photo,
  photoKey = null,
  household = "demo",
  submitting = false,
  editBatch = false,
  initial,
  onPhoto,
  onRetake,
  onRetry,
  onTypeInstead,
  onPickCandidate,
  onSubmit,
  onDirtyChange,
}: ScanConfirmProps) {
  const reduce = useReducedMotion();
  const groupId = React.useId();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const h3Ref = React.useRef<HTMLHeadingElement>(null);
  const figRef = React.useRef<HTMLElement>(null);
  const calloutRef = React.useRef<HTMLSpanElement>(null);
  const fieldIds = { name: React.useId(), batch: React.useId(), exp: React.useId(), bought: React.useId() };

  const ocr: OcrResult | null = scan.phase === "result" ? scan.ocr : null;
  const words: OcrWord[] = scan.phase === "reading" ? scan.words : ocr?.words ?? [];
  const [picked, setPicked] = React.useState<number | null>(null);
  const [typing, setTyping] = React.useState(false);
  React.useEffect(() => {
    setPicked(null);
    setTyping(false);
  }, [ocr]);

  const outcome: ScanOutcome | null = ocr ? (picked !== null ? { kind: "confirmed", index: picked } : scanOutcome(ocr)) : null;
  const batchIndex = outcome?.kind === "confirmed" ? outcome.index : null;

  // Animate the morph only when arriving from reading or a pick; land directly otherwise (kit, reload).
  const prevPhase = React.useRef(scan.phase);
  const arrived = prevPhase.current === "reading" || picked !== null;
  React.useEffect(() => {
    prevPhase.current = scan.phase;
  }, [scan.phase]);
  const { stage, animated } = useMorph(batchIndex, arrived);

  /* draft: filled from the OCR result in render (not an effect), so the first paint already shows the chip */
  // The batch is the code the reader extracted (`fields.batch`), not the text of the box drawn over
  // it: this API boxes whole lines, so the highlighted box reads "B.No. FT5427 EXP 09/2027" while
  // the batch is FT5427. The box still marks where it was found; only the value comes from fields.
  const batchFromOcr = (o: OcrResult): string | null =>
    o.fields.batch ?? (batchIndex !== null ? (o.words[batchIndex]?.text ?? null) : null);
  const fromOcr = (d: ScanDraft): ScanDraft =>
    ocr
      ? { ...d, name: ocr.fields.name ?? d.name, exp: ocr.fields.exp_date ?? d.exp, batch: batchFromOcr(ocr) ?? d.batch }
      : d;
  const [draft, setDraft] = React.useState<ScanDraft>(() => fromOcr({ name: "", batch: "", exp: "", bought: "", ...initial }));
  const [draftSrc, setDraftSrc] = React.useState<{ ocr: OcrResult | null; batchIndex: number | null }>({ ocr, batchIndex });
  if (draftSrc.ocr !== ocr || draftSrc.batchIndex !== batchIndex) {
    setDraftSrc({ ocr, batchIndex });
    setDraft(fromOcr);
  }
  const [editing, setEditing] = React.useState(editBatch);
  const [batchEdit, setBatchEdit] = React.useState(initial?.batch ?? "");
  const dirty = React.useRef(false);
  const markDirty = () => {
    if (!dirty.current) {
      dirty.current = true;
      onDirtyChange?.(true);
    }
  };
  React.useEffect(() => {
    if (photo) markDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  /* focus the read-back heading once reading ends */
  React.useEffect(() => {
    if (scan.phase === "result") h3Ref.current?.focus({ preventScroll: true });
  }, [scan.phase]);

  /* geometry */
  const W = photo?.width ?? 1;
  const H = photo?.height ?? 1;
  const crop: Crop = photo?.crop ?? { x: 0, y: 0, w: W, h: H };
  const pad = crop.w * DEMO_PAD_RATIO;
  const polys = words.map((w) => wordPoly(w, W, H));
  const batchGeo = batchIndex !== null && polys[batchIndex] ? padPoly(polys[batchIndex]!, pad) : null;
  const groups = ocr ? fieldWords(ocr, batchIndex) : { name: [], batch: [], exp: [] };
  const anchor = (i: number | undefined): Pt | null => (i === undefined || !polys[i] ? null : toPct(crop, polys[i]![0]!));

  /* leader end: measured from the callout chip (image units) */
  const [leadEnd, setLeadEnd] = React.useState<Pt | null>(null);
  const [pxPerUnit, setPxPerUnit] = React.useState(1);
  React.useLayoutEffect(() => {
    const fig = figRef.current;
    if (!fig || !batchGeo) return;
    const measure = () => {
      const f = fig.getBoundingClientRect();
      const m = calloutRef.current?.getBoundingClientRect();
      if (!f.width || !m) return;
      const s = Math.max(f.width / crop.w, f.height / crop.h);
      const ox = (f.width - crop.w * s) / 2;
      const oy = (f.height - crop.h * s) / 2;
      setPxPerUnit(s);
      setLeadEnd([crop.x + (m.left + m.width * 0.6 - f.left - ox) / s, crop.y + (m.top - f.top - oy) / s - 6 / s]);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(fig);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchIndex, stage === "none", W, H, crop.x, crop.y, crop.w, crop.h]);

  /* reading: stagger boxes as they arrive */
  const seen = React.useRef(0);
  const arriveFrom = seen.current;
  React.useEffect(() => {
    seen.current = words.length;
  }, [words.length]);

  const showBoxes = scan.phase === "reading" || scan.phase === "result";
  const isCobalt = stage !== "none";
  const calloutOn = stage === "flying" || stage === "landed" || stage === "done";
  const fieldChipOn = stage === "done";
  const candidates = outcome?.kind === "candidates" ? outcome.indices : [];
  const photoDim = scan.phase === "uploading" || scan.phase === "textract-error" || scan.phase === "upload-error";
  const code = batchIndex !== null ? ocr!.words[batchIndex]!.text : null;

  const figLabel =
    "Your photo of the strip." +
    (words.length ? ` Textract read ${words.length} words` : "") +
    (code ? `; the batch ${code} is outlined.` : words.length ? "." : "");

  /* live region */
  const liveText =
    scan.phase === "uploading"
      ? "Uploading the photo"
      : scan.phase === "reading"
        ? "Reading the print with Amazon Textract"
        : scan.phase === "upload-error"
          ? `The upload was refused (HTTP ${scan.status}).`
          : scan.phase === "textract-error"
            ? `Textract couldn't read this photo: ${scan.message}`
            : outcome?.kind === "confirmed" && code
              ? `Found batch ${Array.from(code).join(" ")}`
              : outcome?.kind === "candidates"
                ? `${candidates.length} codes could be the batch`
                : outcome?.kind === "failed"
                  ? "No batch found"
                  : "";

  const submit = () => {
    onSubmit?.({
      kind: "medicine",
      name: draft.name.trim(),
      brand: ocr?.fields.brand ?? null,
      batch: draft.batch.trim().toUpperCase() || null,
      mfg_date: ocr?.fields.mfg_date ?? null,
      exp_date: draft.exp.trim() || null,
      purchase_date: parseHumanDate(draft.bought),
      photo_s3_key: photoKey,
    });
  };

  const boughtBad = draft.bought.trim() !== "" && parseHumanDate(draft.bought) === null;
  const showFields = outcome?.kind === "confirmed" || scan.phase === "manual" || typing || (editBatch && !ocr);
  const canSubmit = showFields && draft.name.trim() !== "" && draft.batch.trim() !== "" && !editing && !boughtBad;

  /* ------------------------------------------------------------ photo side */

  const pickFile = () => fileRef.current?.click();

  const photoSide = (
    <div className="min-w-0">
      <figure
        ref={figRef}
        aria-label={figLabel}
        className={cn("relative m-0 aspect-[4/3] overflow-hidden rounded-[12px] md:rounded-md", photo ? "bg-photo-table" : "bg-surface-1")}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) onPhoto?.(f);
        }}
      >
        {photo ? (
          <svg viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden className="absolute inset-0 block size-full">
            <image href={photo.src} width={W} height={H} opacity={photoDim ? 0.6 : 1} />
            {showBoxes
              ? polys.map((p, i) => {
                  if (i === batchIndex && isCobalt) return null;
                  const cand = candidates.includes(i);
                  return (
                    <motion.polygon
                      key={`${i}-${words[i]!.text}`}
                      points={pts(p)}
                      vectorEffect="non-scaling-stroke"
                      className={cn(cand ? "fill-cobalt/10 stroke-cobalt [stroke-dasharray:5_4] [stroke-width:2]" : "fill-white/20 stroke-ink/55 [stroke-width:1.5]")}
                      style={{ transformBox: "fill-box", transformOrigin: "center" }}
                      initial={i >= arriveFrom && !reduce ? { opacity: 0, scale: 0.96 } : false}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, delay: Math.max(0, i - arriveFrom) * 0.04 }}
                    />
                  );
                })
              : null}
            {batchGeo && isCobalt ? (
              <>
                {calloutOn && leadEnd ? (
                  <>
                    <motion.path
                      d={(() => {
                        const b = batchGeo.poly;
                        const bx = (b[2]![0] + b[3]![0]) / 2;
                        const by = (b[2]![1] + b[3]![1]) / 2;
                        const [ex, ey] = leadEnd;
                        return `M${bx} ${by} C ${bx} ${by + 60}, ${ex} ${ey - 60}, ${ex} ${ey}`;
                      })()}
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                      className="stroke-cobalt [stroke-dasharray:5_5] [stroke-linecap:round] [stroke-width:2]"
                      initial={animated ? { pathLength: 0, opacity: 0 } : false}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.24, delay: 0.14 }}
                    />
                  </>
                ) : null}
                <motion.polygon
                  points={pts(batchGeo.poly)}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-white [stroke-linejoin:round] [stroke-width:7]"
                  initial={animated ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                />
                <polygon points={pts(batchGeo.poly)} vectorEffect="non-scaling-stroke" className="fill-cobalt/[.07] stroke-cobalt [stroke-linejoin:round] [stroke-width:3]" />
                {calloutOn && leadEnd ? (
                  <circle
                    cx={(batchGeo.poly[2]![0] + batchGeo.poly[3]![0]) / 2}
                    cy={(batchGeo.poly[2]![1] + batchGeo.poly[3]![1]) / 2}
                    r={6 / pxPerUnit}
                    vectorEffect="non-scaling-stroke"
                    className="fill-cobalt stroke-white [stroke-width:2.5]"
                  />
                ) : null}
              </>
            ) : null}
          </svg>
        ) : (
          <button
            type="button"
            onClick={pickFile}
            className="absolute inset-0 grid place-content-center justify-items-center gap-3 rounded-[inherit] border-[1.5px] border-dashed border-line-strong font-sans text-[15px] font-medium text-ink-muted"
            style={{ ["--c" as string]: "var(--cat-medicine)", ["--t" as string]: "var(--cat-medicine-tint)" }}
            tabIndex={-1}
            aria-hidden
          >
            <IlStrip className="size-24" />
            Drop a photo here
          </button>
        )}

        {/* upload progress */}
        {scan.phase === "uploading" ? (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-cobalt/15">
            <motion.i className="block h-full bg-cobalt" initial={false} animate={{ width: `${Math.round(scan.progress * 100)}%` }} transition={{ duration: 0.2 }} />
          </div>
        ) : null}

        {/* scan line */}
        {scan.phase === "reading" && !reduce ? (
          <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 h-[26px]" initial={{ top: "-26px" }} animate={{ top: ["-26px", "100%"] }} transition={{ duration: 1.2, ease: "linear", repeat: Infinity }}>
            <div className="h-6 bg-cobalt-soft opacity-50" />
            <div className="h-0.5 bg-cobalt" />
          </motion.div>
        ) : null}

        {photo ? (
          <>
            <Corner at="tl" className="max-md:hidden" />
            <Corner at="bl" className="max-md:hidden" />
            <Corner at="br" />
            {ocr ? (
              <span className="absolute top-3.5 left-2 inline-flex h-8 items-center gap-1.5 rounded-pill bg-surface-1 pr-2.5 pl-1.5 font-sans text-[12px]/none font-semibold text-ink shadow-1 md:hidden">
                <span aria-hidden className="grid size-[18px] place-items-center rounded-full bg-success-soft text-success">
                  <Check className="size-3" strokeWidth={2.8} />
                </span>
                Textract read {ocr.words.length} words
              </span>
            ) : null}
            <button
              type="button"
              onClick={onRetake}
              className="absolute top-2 right-2 inline-flex h-11 items-center gap-[7px] rounded-pill bg-surface-1 px-3.5 font-sans text-[14px]/none font-semibold text-ink shadow-1 hover:bg-surface-2 md:top-3.5 md:right-3.5"
            >
              <Camera className="size-[17px] text-cobalt" strokeWidth={1.9} aria-hidden />
              Retake
            </button>
          </>
        ) : null}

        {/* numbered field tags (confirmed) and candidate letters */}
        {outcome?.kind === "confirmed" && isCobalt ? (
          <>
            {anchor(groups.name[0]) ? <Tag n="1" label="Medicine" tone="ink" at={anchor(groups.name[0])!} className="max-md:hidden" /> : null}
            {batchGeo ? <Tag n="2" label="Batch" tone="cobalt" at={toPct(crop, polys[batchIndex!]![0]!)} pulse={stage === "done" && animated} /> : null}
            {anchor(groups.exp[0]) ? <Tag n="3" label="Expiry" tone="ink" at={anchor(groups.exp[0])!} className="max-md:hidden" /> : null}
          </>
        ) : null}
        {candidates.map((i, k) => (anchor(i) ? <Tag key={i} n={String.fromCharCode(65 + k)} tone="cobalt" at={anchor(i)!} /> : null))}

        {/* the morph: ghost at the box → chip in the callout */}
        {batchGeo && stage === "cobalt" ? (
          <motion.div
            layoutId="scan-batch"
            aria-hidden
            className="absolute grid place-items-center rounded-sm font-foil text-[22px]/none tracking-[.06em] text-ink/30"
            style={{
              left: `${toPct(crop, batchGeo.c)[0] - lenPct(crop, batchGeo.w, "x") / 2}%`,
              top: `${toPct(crop, batchGeo.c)[1] - lenPct(crop, batchGeo.h, "y") / 2}%`,
              width: `${lenPct(crop, batchGeo.w, "x")}%`,
              height: `${lenPct(crop, batchGeo.h, "y")}%`,
              rotate: batchGeo.angle,
            }}
            transition={springMorph}
          >
            {code}
          </motion.div>
        ) : null}
        {batchGeo && code ? (
          // The card face and label fade in; the chip is not under a fading ancestor, so it stays visible in flight.
          <div
            aria-hidden
            className="absolute top-[69%] left-[3.5%] flex flex-col gap-[5px] rounded-[10px] px-[9px] pt-[7px] pb-[9px] md:top-[70.5%] md:left-[4.5%] md:gap-1.5 md:rounded-[12px] md:px-3 md:pt-2.5 md:pb-3"
          >
            <motion.span
              className="absolute inset-0 rounded-[inherit] bg-surface-1 shadow-2"
              initial={false}
              animate={{ opacity: calloutOn ? 1 : 0 }}
              transition={{ duration: reduce ? 0.15 : 0.18 }}
            />
            <motion.span
              className="relative flex items-center gap-1.5 font-sans text-[11px]/none font-medium text-ink-muted md:text-[12px]/none"
              initial={false}
              animate={{ opacity: calloutOn ? 1 : 0 }}
              transition={{ duration: reduce ? 0.15 : 0.18 }}
            >
              <i className="size-[7px] rounded-full bg-cobalt" />
              Batch on your strip
            </motion.span>
            <span ref={calloutRef} className="relative inline-flex">
              {calloutOn ? (
                <motion.span
                  layoutId={reduce ? undefined : "scan-batch"}
                  className="inline-flex rounded-sm"
                  // leaves the box rotated to its angle with the text at 30%, lands upright on full foil
                  initial={animated ? { rotate: batchGeo.angle, opacity: 0.3 } : reduce ? { opacity: 0 } : false}
                  animate={{ rotate: 0, opacity: 1 }}
                  transition={reduce ? { duration: 0.15 } : springMorph}
                >
                  <FoilChip code={code} size="lg" />
                </motion.span>
              ) : (
                <FoilChip code={code} size="lg" className="invisible" />
              )}
            </span>
          </div>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPhoto?.(f);
            e.target.value = "";
          }}
        />
      </figure>

      {ocr ? (
        <div className="mt-3 hidden items-center gap-4 font-sans text-[13px]/[1.3] font-medium text-ink-muted md:flex">
          <span className="inline-flex items-center gap-[7px] text-ink">
            <span aria-hidden className="grid size-5 place-items-center rounded-full bg-success-soft text-success">
              <Check className="size-[13px]" strokeWidth={2.8} />
            </span>
            Amazon Textract read {ocr.words.length} words
          </span>
          <span className="flex-1" />
          {code ? (
            <span className="inline-flex items-center gap-1.5">
              <i aria-hidden className="h-[11px] w-4 rounded-[3px] border-[2.5px] border-cobalt bg-cobalt/15" />
              Batch
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden className="h-[11px] w-4 rounded-[3px] border-[1.5px] border-ink/55 bg-white/60" />
            Other words
          </span>
        </div>
      ) : null}
    </div>
  );

  /* ------------------------------------------------------------ read-back */

  // tabindex=-1 focus target after reading: no ring on a heading that is not a control
  const h3Cls = "m-0 mt-1 font-display text-[24px]/[1.08] font-extrabold tracking-[-0.03em] text-ink outline-none focus-visible:shadow-none md:mt-3 md:text-[30px]/[1.08]";
  const ledeCls = "m-0 mt-2 hidden font-sans text-[15px]/[1.5] text-ink-muted md:block";

  const batchField = (
    <Field n="2" tone="cobalt" label="Batch" hint={batchIndex !== null ? "Next to B.No." : undefined} pulse={stage === "done" && animated} htmlFor={editing ? fieldIds.batch : undefined}>
      {editing ? (
        <input
          id={fieldIds.batch}
          autoFocus
          value={batchEdit}
          onChange={(e) => {
            setBatchEdit(e.target.value.toUpperCase());
            markDirty();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setDraft((d) => ({ ...d, batch: batchEdit.trim() }));
              setEditing(false);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setEditing(false);
            }
          }}
          onBlur={() => {
            if (batchEdit.trim()) setDraft((d) => ({ ...d, batch: batchEdit.trim() }));
            setEditing(false);
          }}
          aria-describedby={`${fieldIds.batch}-h`}
          className="h-11 w-[220px] rounded-sm border border-line-strong bg-surface-1 px-4 font-foil text-[30px]/none font-black tracking-[.06em] text-ink uppercase caret-cobalt focus:border-cobalt focus:shadow-[0_0_0_1px_var(--cobalt),0_0_0_4px_var(--cobalt-soft)] focus:outline-none md:h-[52px] md:text-foil-lg"
          placeholder="FT5427"
          autoComplete="off"
          spellCheck={false}
        />
      ) : draft.batch ? (
        <>
          <motion.span className="inline-flex" initial={false} animate={{ opacity: fieldChipOn || !ocr ? 1 : 0 }} transition={{ duration: reduce ? 0.15 : 0.18 }}>
            <FoilChip code={draft.batch} size="lg" className="shadow-foil-selected! max-md:h-11! max-md:text-[30px]!" />
          </motion.span>
          <button
            type="button"
            onClick={() => {
              setBatchEdit(draft.batch);
              setEditing(true);
            }}
            className="inline-flex h-11 items-center gap-1.5 rounded-pill px-1.5 font-sans text-[14px]/none font-semibold text-cobalt hover:underline"
          >
            <Pencil className="size-4" strokeWidth={1.9} aria-hidden />
            Edit<span className="sr-only"> the batch</span>
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setBatchEdit("");
            setEditing(true);
          }}
          className="inline-flex h-11 items-center gap-1.5 rounded-pill px-1.5 font-sans text-[14px]/none font-semibold text-cobalt hover:underline"
        >
          <Pencil className="size-4" strokeWidth={1.9} aria-hidden />
          Type the batch
        </button>
      )}
      {editing ? (
        <span id={`${fieldIds.batch}-h`} className="sr-only">
          Enter confirms, Escape cancels
        </span>
      ) : null}
    </Field>
  );

  const fields = (
    <div className="mt-1.5 flex flex-col md:mt-3">
      <Field n="1" label="Medicine" hint={groups.name.length ? `${groups.name.length} words on the strip` : undefined} first htmlFor={fieldIds.name}>
        <input
          id={fieldIds.name}
          className={inputCls}
          value={draft.name}
          onChange={(e) => {
            setDraft((d) => ({ ...d, name: e.target.value }));
            markDirty();
          }}
          placeholder="Paracetamol Tablets IP 650mg"
          autoComplete="off"
        />
      </Field>
      {batchField}
      <div className="grid grid-cols-2 gap-3 border-t border-line md:gap-4">
        <Field n="3" label="Expiry" hint={groups.exp.length ? "Next to EXP" : undefined} bordered={false} htmlFor={fieldIds.exp}>
          <input
            id={fieldIds.exp}
            className={inputCls}
            value={draft.exp}
            onChange={(e) => {
              setDraft((d) => ({ ...d, exp: e.target.value }));
              markDirty();
            }}
            placeholder="mm/yyyy"
            inputMode="numeric"
            autoComplete="off"
          />
        </Field>
        <Field label="Bought on" hint="Optional" bordered={false} htmlFor={fieldIds.bought}>
          <input
            id={fieldIds.bought}
            className={cn(inputCls, boughtBad && "border-warning")}
            value={draft.bought}
            onChange={(e) => {
              setDraft((d) => ({ ...d, bought: e.target.value }));
              markDirty();
            }}
            placeholder="dd mmm yyyy"
            aria-invalid={boughtBad || undefined}
            aria-describedby={`${fieldIds.bought}-h`}
            autoComplete="off"
          />
        </Field>
      </div>
      <p id={`${fieldIds.bought}-h`} className={cn("m-0 hidden font-sans text-[13px]/[1.4] md:ml-10 md:block", boughtBad ? "block text-warning" : "text-ink-muted")}>
        {boughtBad ? "Use a date like 12 Jul 2026." : "Add the date to see if it was sold after a notice was out."}
      </p>
    </div>
  );

  const cta = (label: string, enabled: boolean) => (
    <div className="sticky bottom-0 -mx-4 mt-auto border-t border-line bg-surface-1 px-4 pt-3 pb-3.5 md:static md:mx-0 md:border-t-0 md:bg-transparent md:px-0 md:pt-3.5 md:pb-0">
      <Button className="h-[52px]! w-full text-[16px]!" disabled={!enabled || submitting} loading={submitting} onClick={submit}>
        {label}
        <ArrowRight className="size-[18px]" strokeWidth={2.2} aria-hidden />
      </Button>
      <p className="m-0 mt-2 text-center font-sans text-[12px]/[1.4] text-ink-muted md:mt-2.5 md:text-[13px]/[1.4]">
        Checks CDSCO, CPSC, NHTSA and openFDA
        {household === "demo" ? <span className="hidden md:inline"> · saves to your own copy</span> : null}
      </p>
    </div>
  );

  let readBack: React.ReactNode;
  if (scan.phase === "idle") {
    readBack = (
      <>
        <h3 ref={h3Ref} tabIndex={-1} className={h3Cls}>
          Photograph the back of the strip
        </h3>
        <p className="m-0 mt-2 font-sans text-[15px]/[1.5] text-ink-muted">We read the batch, name and expiry with Amazon Textract. You confirm before anything is saved.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button data-autofocus onClick={pickFile} icon={<Camera className="size-[18px]" strokeWidth={1.9} aria-hidden />}>
            Take or choose a photo
          </Button>
          <button type="button" onClick={onTypeInstead} className="inline-flex h-11 items-center px-2 font-sans text-[15px] font-semibold text-cobalt hover:underline">
            Type it in instead
          </button>
        </div>
      </>
    );
  } else if (scan.phase === "uploading" || scan.phase === "reading") {
    readBack = (
      <>
        <h3 ref={h3Ref} tabIndex={-1} className={h3Cls}>
          Reading your photo
        </h3>
        <ul className="m-0 mt-4 list-none p-0">
          <StatusRow state={scan.phase === "uploading" ? "running" : "done"}>Uploading the photo</StatusRow>
          <StatusRow state={scan.phase === "uploading" ? "waiting" : "running"}>Reading the print with Amazon Textract</StatusRow>
          {scan.phase === "reading" && (scan.passes?.length ?? 0) > 1 ? <StatusRow state="done">Read the edge stamp separately ({scan.passes!.length} passes)</StatusRow> : null}
        </ul>
      </>
    );
  } else if (scan.phase === "upload-error" || scan.phase === "textract-error") {
    readBack = (
      <>
        <h3 ref={h3Ref} tabIndex={-1} className={h3Cls}>
          Photograph the back of the strip
        </h3>
        <p role="alert" className="m-0 mt-3 font-sans text-[13px]/[1.4] font-medium text-warning">
          {scan.phase === "upload-error" ? `The upload was refused (HTTP ${scan.status}).` : `Textract couldn't read this photo: ${scan.message}`}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={onRetry}>Try again</Button>
          <button type="button" onClick={onTypeInstead} className="inline-flex h-11 items-center px-2 font-sans text-[15px] font-semibold text-cobalt hover:underline">
            Type it in instead
          </button>
        </div>
      </>
    );
  } else if (outcome?.kind === "candidates" && !typing) {
    readBack = (
      <>
        <StateChip tone="warning">{candidates.length} codes could be the batch</StateChip>
        <h3 ref={h3Ref} tabIndex={-1} className={h3Cls}>
          Which one is the batch?
        </h3>
        <p className={cn(ledeCls, "block")}>Pick the code printed next to B.No. or Batch.</p>
        <div role="radiogroup" aria-label="Batch candidates" className="mt-3 flex flex-col">
          {candidates.map((i, k) => {
            const nb = neighbour(words, i);
            const expiry = nb ? /^exp/i.test(nb) : false;
            return (
              <label key={i} className="flex h-14 cursor-pointer items-center gap-3 border-t border-line first:border-t-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cobalt">
                <input
                  type="radio"
                  name="batch-candidate"
                  className="sr-only"
                  onChange={() => {
                    setPicked(i);
                    markDirty();
                    onPickCandidate?.(i);
                  }}
                />
                <b aria-hidden className="grid size-6 place-items-center rounded-full bg-cobalt font-sans text-[12px] font-bold text-white">
                  {String.fromCharCode(65 + k)}
                </b>
                <span className="rounded-[10px] outline-[1.5px] outline-offset-2 outline-cobalt outline-dashed">
                  <FoilChip code={words[i]!.text} />
                </span>
                <span className="font-sans text-[14px] text-ink-muted">
                  {nb ? `next to ${nb}` : "on the strip"}
                  {expiry ? " · looks like an expiry" : ""}
                </span>
              </label>
            );
          })}
        </div>
        {cta("Pick the batch", false)}
      </>
    );
  } else if (outcome?.kind === "failed" && !typing) {
    readBack = (
      <>
        <StateChip tone="warning">No batch found</StateChip>
        <h3 ref={h3Ref} tabIndex={-1} className={h3Cls}>
          We couldn&rsquo;t read a batch on this photo
        </h3>
        <p className="m-0 mt-2 font-sans text-[15px]/[1.5] text-ink-muted">
          Textract read {words.length} words, but none looks like a batch. Tilt the strip so the light doesn&rsquo;t wash out the print, or type the batch.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={onRetake}>Retake photo</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setTyping(true);
              setBatchEdit("");
              setEditing(true);
            }}
          >
            Type the batch
          </Button>
        </div>
      </>
    );
  } else {
    // confirmed, manual, or typing after a failed read
    readBack = (
      <>
        {outcome?.kind === "confirmed" ? (
          <span className="hidden md:contents">
            <StateChip tone="success">Found a batch number</StateChip>
          </span>
        ) : null}
        <h3 ref={h3Ref} tabIndex={-1} className={h3Cls}>
          {outcome?.kind === "confirmed" ? "Is this the batch on your strip?" : "Type what’s printed on the strip"}
        </h3>
        {outcome?.kind === "confirmed" ? (
          <p className={ledeCls}>
            The code next to <b className="font-semibold text-ink">B.No.</b> is the batch. CDSCO lists failed samples by batch, so that&rsquo;s what we match.
          </p>
        ) : null}
        {fields}
        {cta("Check this batch", canSubmit)}
      </>
    );
  }

  return (
    <LayoutGroup id={groupId}>
    <div className="flex min-h-full flex-col gap-3 md:grid md:grid-cols-[600px_minmax(0,1fr)] md:gap-10">
      {scan.phase === "manual" && !photo ? <div className="max-md:hidden">{photoSide}</div> : photoSide}
      <div className="flex min-w-0 flex-1 flex-col pt-1 md:pt-0">{readBack}</div>
      <span aria-live="polite" className="sr-only">
        {liveText}
      </span>
    </div>
    </LayoutGroup>
  );
}
