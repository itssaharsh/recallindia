"use client";
import * as React from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Check } from "lucide-react";
import { Card, Chip, FoilChip, cn } from "../ui";
import { CHIP_LG, SEC_H2, SEC_META, SEC_PAD } from "./classes";
import { stripDate } from "./format";
import { EASE_DRAW, EASE_OUT } from "./motion";

/**
 * C5 · BatchVsList: the match drawn onto the object. Your strip's printed batch, character by character,
 * against the listed batch. Matches the batch card in `case-full-1536.png` / `case-full-390.png`.
 * Tiles always come from the two strings (never hard-coded).
 */
export interface BatchVsListProps {
  /** range_check.yours (item.batch) */
  yours: string;
  /** range_check.listed */
  listed: string;
  /** "CDSCO, row 12" */
  listedLabel: string;
  /** item.name, printed on the strip */
  productName: string;
  /** item.brand */
  maker: string | null;
  /** item.mfg_date / exp_date (the strip prints only what exists) */
  mfg?: string | null;
  exp?: string | null;
  /** from case.reasoning */
  sameProduct: boolean;
  sameMaker: boolean;
  kind: "medicine" | "appliance" | "other";
  /** another household item whose near-miss points at this notice */
  nearMissBatch?: string | null;
  nearMissStatus?: "dismissed" | "open";
  animate?: boolean;
  className?: string;
}

const TILE = cn(
  "grid h-[54px] place-items-center rounded-[9px] font-foil text-[28px] leading-none font-black text-ink",
  "bg-[linear-gradient(180deg,#F1F2F1_0%,#DDE0DE_46%,#C9CDCB_54%,#E6E8E7_100%)]",
  "max-md:h-[50px] max-md:text-[26px]",
);
const TILE_EDGE = "shadow-[inset_0_1px_0_rgb(255_255_255/.7),inset_0_0_0_1px_rgb(11_27_51/.14)]";
const TILE_DIFF = "shadow-[inset_0_1px_0_rgb(255_255_255/.7),0_0_0_2px_var(--cobalt)]";

export function BatchVsList({
  yours, listed, listedLabel, productName, maker, mfg, exp, sameProduct, sameMaker, kind,
  nearMissBatch, nearMissStatus = "dismissed", animate = true, className,
}: BatchVsListProps) {
  const reduce = useReducedMotion();
  const play = animate && !reduce;
  const n = Math.max(yours.length, listed.length);
  const a = Array.from(yours.padEnd(n, " "));
  const b = Array.from(listed.padEnd(n, " "));
  const same = a.map((c, i) => c === b[i]);
  const k = same.filter(Boolean).length;
  const all = k === n;
  const noun = kind === "medicine" ? "strip" : "label";

  const top: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.18, ease: EASE_OUT } } };
  const flip: Variants = {
    hidden: { rotateX: 90, opacity: 0 },
    show: (i: number) => ({ rotateX: 0, opacity: 1, transition: { duration: 0.18, ease: EASE_DRAW, delay: 0.18 + i * 0.06 } }),
  };
  const eq: Variants = {
    hidden: { opacity: 0 },
    show: (i: number) => ({ opacity: 1, transition: { duration: 0.12, delay: 0.18 + i * 0.06 + 0.18 + 0.04 } }),
  };

  return (
    <Card as="section" aria-labelledby="batch-h" className={cn(SEC_PAD, className)}>
      <h2 id="batch-h" className={SEC_H2}>Your batch against the list</h2>
      <p className={SEC_META}>Matched on batch, {kind === "medicine" ? "medicine" : "product"} and maker, character by character</p>

      <div className="mt-[22px] grid grid-cols-[352px_minmax(0,1fr)] items-center gap-9 max-md:grid-cols-1 max-md:gap-[22px]">
        <StripBack name={productName} maker={maker} batch={yours} mfg={mfg} exp={exp} />

        <div className="min-w-0">
          <motion.div
            role="img"
            aria-label={`On your ${noun} ${yours}, ${listedLabel} ${listed}: ${k} of ${n} characters match`}
            initial={play ? "hidden" : false}
            whileInView="show"
            viewport={{ once: true, amount: 0.5 }}
            style={{ ["--n" as string]: n }}
            className={cn(
              "grid grid-cols-[118px_repeat(var(--n),46px)_minmax(0,1fr)] items-center gap-x-2",
              "max-md:grid-cols-[repeat(var(--n),minmax(0,1fr))] max-md:gap-x-1.5",
            )}
          >
            <RowLabel title={`On your ${noun}`} sub="printed batch" />
            {a.map((c, i) => (
              <motion.span key={`a${i}`} aria-hidden variants={top} className={cn(TILE, same[i] ? TILE_EDGE : TILE_DIFF)}>{c}</motion.span>
            ))}
            <span className="max-md:hidden" />

            <span className="max-md:hidden" />
            {same.map((s, i) => (
              <motion.span
                key={`e${i}`} aria-hidden variants={eq} custom={i}
                className={cn("grid h-[30px] place-items-center font-display text-[20px] leading-none font-extrabold", s ? "text-danger" : "text-cobalt")}
              >
                {s ? "=" : "≠"}
              </motion.span>
            ))}
            <span className="max-md:hidden" />

            <RowLabel title={listedLabel} sub="listed batch" second />
            {b.map((c, i) => (
              <motion.span
                key={`b${i}`} aria-hidden variants={flip} custom={i}
                style={{ transformPerspective: 400 }}
                className={cn(TILE, same[i] ? TILE_EDGE : TILE_DIFF)}
              >
                {c}
              </motion.span>
            ))}
            <span className="max-md:hidden" />
          </motion.div>

          <div className="mt-[18px] flex flex-wrap gap-2">
            <Chip tone={all ? "alert" : "info"} className={CHIP_LG}>{k} of {n} characters match</Chip>
            {all && <Chip tone="alert" className={CHIP_LG}><Check aria-hidden className="size-3.5" strokeWidth={2.8} />Same batch</Chip>}
            {sameProduct && <Chip tone="alert" className={CHIP_LG}><Check aria-hidden className="size-3.5" strokeWidth={2.8} />Same {kind === "medicine" ? "medicine" : "product"}</Chip>}
            {sameMaker && <Chip tone="alert" className={CHIP_LG}><Check aria-hidden className="size-3.5" strokeWidth={2.8} />Same maker</Chip>}
          </div>
        </div>
      </div>

      {nearMissBatch && (
        <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-line pt-[18px] text-[14px] leading-[1.4] text-ink-muted">
          Not on this list: your other {noun}, batch
          <FoilChip code={nearMissBatch} size="sm" />
          <Chip tone="info">Near-miss · {nearMissStatus}</Chip>
        </div>
      )}
    </Card>
  );
}

function RowLabel({ title, sub, second = false }: { title: string; sub: string; second?: boolean }) {
  return (
    <span className={cn("text-[13px] leading-[1.25] font-semibold text-ink max-md:col-span-full max-md:mb-2", second && "max-md:mt-2")}>
      {title}
      <small className="block text-[12px] leading-[1.3] font-normal text-ink-muted">{sub}</small>
    </span>
  );
}

/* ------------------------------------------------------------------ the back of the strip (352 × 184) */

const FOIL_BG = "bg-[linear-gradient(180deg,#F1F2F1_0%,#DDE0DE_46%,#C9CDCB_54%,#E6E8E7_100%)]";

function StripBack({ name, maker, batch, mfg, exp }: { name: string; maker: string | null; batch: string; mfg?: string | null; exp?: string | null }) {
  const m = stripDate(mfg);
  const e = stripDate(exp);
  return (
    <div
      role="img"
      aria-label={`Your strip, printed batch ${batch}`}
      className={cn(
        "relative h-[184px] overflow-hidden rounded-md px-[18px] py-4 max-md:h-[168px]",
        FOIL_BG,
        "shadow-[inset_0_1px_0_rgb(255_255_255/.8),inset_0_0_0_1px_rgb(11_27_51/.12),0_2px_4px_rgb(11_27_51/.06),0_18px_34px_-16px_rgb(11_27_51/.35)]",
      )}
    >
      <div aria-hidden className="w-[170px] font-display text-[13px] leading-[1.2] font-extrabold tracking-[.03em] text-[#1B3563] uppercase max-md:w-[150px]">{name}</div>
      {maker && <div aria-hidden className="mt-[3px] w-[170px] text-[11px] leading-[1.3] font-medium text-[#3C4F6E] max-md:w-[150px]">{maker}</div>}
      <div aria-hidden className="absolute bottom-4 left-[18px] grid gap-[5px] font-foil text-[17px] leading-none font-black tracking-[.06em] text-[#26344A]">
        <span className="flex items-baseline gap-2">
          <small className="w-10 font-sans text-[10px] leading-none font-bold tracking-[.08em] text-[#4D5E78]">B.NO.</small>
          <span className="relative -mx-[5px] -my-[3px] rounded-[5px] bg-[rgb(221_231_248/.55)] px-[5px] py-[3px] shadow-[0_0_0_2px_var(--cobalt)]">
            <em className="absolute -top-6 -left-0.5 rounded-[5px] bg-cobalt px-[7px] py-1 font-sans text-[11px] leading-none font-bold tracking-[.02em] whitespace-nowrap text-white not-italic">
              Your batch
            </em>
            {batch}
          </span>
        </span>
        {m && <span className="flex items-baseline gap-2"><small className="w-10 font-sans text-[10px] leading-none font-bold tracking-[.08em] text-[#4D5E78]">MFG</small>{m}</span>}
        {e && <span className="flex items-baseline gap-2"><small className="w-10 font-sans text-[10px] leading-none font-bold tracking-[.08em] text-[#4D5E78]">EXP</small>{e}</span>}
      </div>
      <span aria-hidden className="absolute top-3 right-[146px] bottom-3 border-l-[1.5px] border-dashed border-[rgb(11_27_51/.25)] max-md:right-[124px]" />
      <div aria-hidden className="absolute top-[18px] right-[18px] grid grid-cols-[repeat(2,52px)] gap-x-3 gap-y-2.5 max-md:grid-cols-[repeat(2,44px)] max-md:gap-2.5">
        {[false, false, true, false].map((red, i) => (
          <i key={i} className="grid size-13 place-items-center rounded-full bg-white/35 shadow-[inset_0_2px_5px_rgb(11_27_51/.22),inset_0_-1px_0_rgb(255_255_255/.9)] max-md:size-11">
            <span
              className={cn(
                "size-[38px] rounded-full max-md:size-8",
                red
                  ? "bg-danger shadow-[0_1px_2px_rgb(120_0_10/.45),inset_0_-3px_0_rgb(90_0_8/.25)]"
                  : "bg-white shadow-[0_1px_2px_rgb(11_27_51/.28),inset_0_-3px_0_rgb(11_27_51/.07)]",
              )}
            />
          </i>
        ))}
      </div>
    </div>
  );
}
