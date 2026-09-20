"use client";
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Chip, FoilChip, cn } from "../ui";
import { FIELD_LABEL } from "./classes";
import {
  SOURCE_SHORT, bandSourceLine, dayMon, dayMonYear, dayNum, dayRange, daysBetween, itemCodeLabel, monthYear,
} from "./format";
import { ThingIllustration } from "./illustrations";
import { EASE_DRAW, EASE_OUT, S } from "./motion";
import type { Item, Notice } from "./types";

/**
 * C2 · CaseHeader: the My things alert face, grown up. One sentence that explains the harm, plus the
 * two facts behind it: the batch and the dates. Matches the top card of `case-1536.png` / `case-390.png`.
 */
export interface CaseHeaderProps {
  notice: Notice;
  item: Item;
  /** case.sold_after_notice */
  soldAfterNotice: boolean;
  /** play the calendar fill (first paint only) */
  animate?: boolean;
  /** give band, tile and foil their shared-element layoutIds (arrival from My things) */
  morph?: boolean;
}

const CAT_LABEL = { medicine: "Medicine", vehicle: "Vehicle", appliance: "Appliance", other: "Other" } as const;
const CAT_DOT = { medicine: "bg-cat-medicine", vehicle: "bg-cat-vehicle", appliance: "bg-cat-appliance", other: "bg-cat-other" } as const;

/** The filled triangle from the alert badge (lucide's is outline-only). */
function AlertGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M12 3.5 22 20H2z" fill="currentColor" />
      <path d="M12 10v4.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1.2" fill="#fff" />
    </svg>
  );
}

export function headline(notice: Notice, item: Item, soldAfter: boolean): { lead: string; em: string; tail: string } {
  const src = SOURCE_SHORT[notice.source];
  if (item.kind === "vehicle") {
    return { lead: `Your ${item.name} is on an ${src} recall published `, em: dayMonYear(notice.published_at), tail: "." };
  }
  const noun = item.kind === "medicine" ? "this strip" : "this";
  const n = item.purchase_date ? Math.abs(daysBetween(notice.published_at, item.purchase_date)) : 0;
  const days = `${n} ${n === 1 ? "day" : "days"}`;
  if (!item.purchase_date) return { lead: `${src} flagged ${noun}`, em: "", tail: "." };
  if (n === 0) return { lead: `You were sold ${noun} `, em: "the day", tail: ` ${src} flagged it.` };
  return soldAfter
    ? { lead: `You were sold ${noun} `, em: days, tail: ` after ${src} flagged it.` }
    : { lead: `${src} flagged ${noun} `, em: days, tail: " after you bought it." };
}

export function CaseHeader({ notice, item, soldAfterNotice, animate = true, morph = false }: CaseHeaderProps) {
  const h = headline(notice, item, soldAfterNotice);
  const code = itemCodeLabel(item);
  const shared = (id: string) => (morph ? { layoutId: `${id}-${item.item_id}`, transition: S.morph } : {});
  const bought = item.purchase_date ? `bought ${dayMonYear(item.purchase_date)}` : null;
  const gap = item.purchase_date ? Math.abs(daysBetween(notice.published_at, item.purchase_date)) : null;

  return (
    <article
      aria-labelledby="case-title"
      className={cn(
        "mt-3 overflow-hidden rounded-md border border-[rgb(179_18_30/.28)] bg-surface-1 max-md:mt-2.5",
        "shadow-[0_2px_4px_rgb(11_27_51/.05),0_22px_44px_-22px_rgb(179_18_30/.45)]",
      )}
    >
      <motion.div
        {...shared("alert-band")}
        className={cn(
          "flex h-13 items-center gap-3.5 bg-danger px-6 text-white",
          "max-md:h-auto max-md:flex-wrap max-md:gap-x-2.5 max-md:gap-y-2 max-md:px-4 max-md:pt-2.5 max-md:pb-3",
        )}
      >
        <span className="inline-flex h-7 items-center gap-[7px] rounded-pill bg-white pr-[11px] pl-[9px] text-[12px] leading-none font-bold tracking-[.05em] text-danger uppercase">
          <AlertGlyph className="size-3.5" />
          On a notice
        </span>
        <span className="text-[16px] leading-[1.2] font-semibold max-md:order-3 max-md:basis-full max-md:text-[15px] max-md:leading-[1.35]">
          {bandSourceLine(notice)}
        </span>
        <span className="ml-auto text-[14px] leading-none font-medium text-[#FFDCD8] max-md:text-[12.5px]">
          Published {dayMonYear(notice.published_at)}
        </span>
      </motion.div>

      <div
        className={cn(
          "grid grid-cols-[132px_minmax(0,1fr)_452px] items-center gap-7 px-7 pt-6 pb-[26px]",
          "md:max-[1440px]:grid-cols-[112px_minmax(0,1fr)]",
          "max-md:grid-cols-[64px_minmax(0,1fr)] max-md:gap-3.5 max-md:px-4 max-md:pt-4 max-md:pb-[18px]",
        )}
      >
        <motion.div
          {...shared("tile")}
          className="grid size-[132px] place-items-center rounded-md bg-danger-soft md:max-[1440px]:size-[112px] max-md:row-start-1 max-md:size-16 max-md:rounded-[12px]"
        >
          <ThingIllustration kind={item.kind} className="size-4/5" />
        </motion.div>

        <div className="min-w-0 max-md:contents">
          <div className="flex items-center gap-[7px] text-[12px] leading-none font-semibold tracking-[.05em] text-ink-muted uppercase max-md:col-start-2 max-md:row-start-1 max-md:self-center">
            <i aria-hidden className={cn("inline-block size-[9px] rounded-[3px]", CAT_DOT[item.kind])} />
            {CAT_LABEL[item.kind]}
          </div>
          <h1
            id="case-title"
            className={cn(
              "mt-2.5 max-w-[800px] font-display text-[46px] leading-[1.04] font-extrabold tracking-[-.035em] text-ink",
              "max-md:col-span-full max-md:mt-0 max-md:text-[31px] max-md:leading-[1.06]",
            )}
          >
            {h.lead}
            {h.em && <em className="whitespace-nowrap text-danger not-italic">{h.em}</em>}
            {h.tail}
          </h1>
          <div className="mt-[18px] flex items-center gap-5 max-md:col-span-full max-md:mt-0 max-md:gap-3.5">
            {code && (
              <div className="flex flex-col gap-1.5">
                <span className={cn(FIELD_LABEL, "whitespace-nowrap")}>{code.label}</span>
                <motion.span {...shared("foil")} className="inline-flex">
                  {code.spoken ? (
                    <span role="img" aria-label={code.spoken} className="inline-flex">
                      <span aria-hidden className="inline-flex"><FoilChip code={code.code} size="lg" className={FOIL_LG} /></span>
                    </span>
                  ) : (
                    <FoilChip code={code.code} size="lg" className={FOIL_LG} />
                  )}
                </motion.span>
              </div>
            )}
            <span aria-hidden className="w-px self-stretch bg-line" />
            <div className="text-[15px] leading-[1.45] text-ink-muted max-md:text-[14px]">
              <b className="block text-[16px] font-semibold text-ink max-md:text-[15px]">{item.name}</b>
              {[item.brand, bought].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>

        <div className="max-[1440px]:col-span-full">
          {item.kind === "vehicle" && notice.model_years && item.year ? (
            <YearsPanel from={notice.model_years[0]} to={notice.model_years[1]} yours={item.year} source={notice.source} />
          ) : item.purchase_date && gap != null && gap <= 31 ? (
            <SoldAfterCalendar
              publishedAt={notice.published_at}
              purchasedAt={item.purchase_date}
              soldAfter={soldAfterNotice}
              row={notice.row_ref?.row ?? null}
              batch={item.batch ?? null}
              sourceShort={SOURCE_SHORT[notice.source]}
              animate={animate}
            />
          ) : item.purchase_date ? (
            <GapPanel publishedAt={notice.published_at} purchasedAt={item.purchase_date} soldAfter={soldAfterNotice} />
          ) : null}
        </div>
      </div>
    </article>
  );
}

const FOIL_LG = "max-md:h-11! max-md:px-3! max-md:text-[28px]!";

/* ------------------------------------------------------------------ SoldAfterCalendar (452 × 190) */

const PANEL = "rounded-md border border-[#F3D3CF] bg-[#FFF8F7] px-[18px] pt-3.5 pb-4 max-md:px-3 max-md:pt-3 max-md:pb-3.5";

export interface SoldAfterCalendarProps {
  /** notice.published_at */
  publishedAt: string;
  /** item.purchase_date */
  purchasedAt: string;
  soldAfter: boolean;
  row: number | null;
  batch: string | null;
  /** "CDSCO" */
  sourceShort?: string;
  animate?: boolean;
}

export function SoldAfterCalendar({ publishedAt, purchasedAt, soldAfter, row, batch, sourceShort = "CDSCO", animate = true }: SoldAfterCalendarProps) {
  const reduce = useReducedMotion();
  const play = animate && !reduce;
  const [first, last] = soldAfter ? [publishedAt, purchasedAt] : [purchasedAt, publishedAt];
  const days = dayRange(first, last);
  const n = days.length - 1;
  const cells = days.length;
  const startMonth = monthYear(first);
  const endMonth = monthYear(last);
  const month = startMonth === endMonth ? startMonth : `${startMonth.split(" ")[0]} – ${endMonth}`;
  // centre of the first cell to the centre of the last: half a cell in from each side
  const half = (gapPx: number) => `calc((100% - ${(cells - 1) * gapPx}px) / ${cells * 2})`;
  const drawAt = 0.38;
  const pubLabel = `${sourceShort} published`;
  const aria = soldAfter
    ? `${monthYear(publishedAt)}: ${sourceShort} published the notice on ${Number(publishedAt.slice(8, 10))} ${monthYear(publishedAt).split(" ")[0]}; you bought the strip on ${Number(purchasedAt.slice(8, 10))} ${monthYear(purchasedAt).split(" ")[0]}, ${n} ${n === 1 ? "day" : "days"} later`
    : `${monthYear(purchasedAt)}: you bought the strip on ${Number(purchasedAt.slice(8, 10))} ${monthYear(purchasedAt).split(" ")[0]}; ${sourceShort} published the notice ${n} ${n === 1 ? "day" : "days"} later`;

  const pub = (
    <span key="p">
      <b className="block font-semibold text-ink">{dayMon(publishedAt)}</b>
      {pubLabel}
      {row != null && <span className="max-md:hidden"> row {row}</span>}
    </span>
  );
  const buy = (
    <span key="b">
      <b className="block font-semibold text-ink">{dayMon(purchasedAt)}</b>
      You bought <span className="max-md:hidden">{batch ? `batch ${batch}` : "it"}</span>
      <span className="md:hidden">it</span>
    </span>
  );

  return (
    <div role="img" aria-label={aria} className={PANEL}>
      <div aria-hidden className="flex items-center justify-between text-[14px] leading-none font-semibold text-ink max-md:text-[13px]">
        <span>{month}</span>
        {soldAfter ? <Chip tone="alert">Sold after the notice</Chip> : <Chip tone="info">Flagged after you bought it</Chip>}
      </div>

      <div
        aria-hidden
        className="relative mt-11 grid gap-[5px] max-md:mt-10 max-md:gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}
      >
        <motion.span
          className="absolute -top-5 h-3 rounded-t-[7px] border-2 border-b-0 border-danger max-md:hidden"
          style={{ left: half(5), right: half(5) }}
          initial={play ? { clipPath: "inset(0 100% 0 0)" } : false}
          animate={{ clipPath: "inset(0 0% 0 0)" }}
          transition={{ duration: 0.32, ease: EASE_DRAW, delay: drawAt }}
        />
        <motion.span
          className="absolute -top-5 h-3 rounded-t-[7px] border-2 border-b-0 border-danger md:hidden"
          style={{ left: half(3), right: half(3) }}
          initial={play ? { clipPath: "inset(0 100% 0 0)" } : false}
          animate={{ clipPath: "inset(0 0% 0 0)" }}
          transition={{ duration: 0.32, ease: EASE_DRAW, delay: drawAt }}
        />
        <motion.b
          className="absolute -top-[35px] left-1/2 rounded-pill bg-danger px-[11px] py-1.5 text-[13px] leading-none font-bold whitespace-nowrap text-white"
          style={{ x: "-50%" }}
          initial={play ? { scale: 0.85, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...S.pop, opacity: { duration: 0.12, delay: drawAt + 0.24 }, delay: drawAt + 0.24 }}
        >
          {n} {n === 1 ? "day" : "days"}
        </motion.b>
        {days.map((d, i) => {
          const isFirst = i === 0;
          const isLast = i === days.length - 1;
          const isPub = soldAfter ? isFirst : isLast;
          const isBuy = soldAfter ? isLast : isFirst;
          return (
            <motion.span
              key={d}
              initial={play ? { opacity: 0.4 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.16, ease: EASE_OUT, delay: i * 0.022 }}
              className={cn(
                "grid h-[42px] place-items-center rounded-[9px] text-[14px] leading-none font-semibold tabular-nums",
                "max-md:h-[34px] max-md:rounded-[7px] max-md:text-[12px]",
                isBuy
                  ? "bg-danger text-white shadow-[0_0_0_3px_#FBE1DD]"
                  : isPub
                    ? "bg-white text-danger shadow-[inset_0_0_0_2px_var(--danger)]"
                    : "bg-[#FBE1DD] text-[#8C1C24]",
              )}
            >
              {dayNum(d)}
            </motion.span>
          );
        })}
      </div>

      <div aria-hidden className="mt-[11px] flex justify-between gap-4 text-[13px] leading-[1.35] text-ink-muted max-md:text-[12.5px] [&>span:last-child]:text-right">
        {soldAfter ? [pub, buy] : [buy, pub]}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ gaps longer than 31 days */

export function GapPanel({ publishedAt, purchasedAt, soldAfter }: { publishedAt: string; purchasedAt: string; soldAfter: boolean }) {
  const n = Math.abs(daysBetween(publishedAt, purchasedAt));
  const a = soldAfter ? { d: publishedAt, l: "CDSCO published", you: false } : { d: purchasedAt, l: "You bought it", you: true };
  const b = soldAfter ? { d: purchasedAt, l: "You bought it", you: true } : { d: publishedAt, l: "CDSCO published", you: false };
  const Point = ({ p }: { p: typeof a }) => (
    <span className="flex flex-none items-center gap-2">
      <i aria-hidden className={cn("size-3.5 flex-none rounded-full border-[3px] border-danger", p.you ? "bg-danger shadow-[0_0_0_3px_var(--danger-soft)]" : "bg-white")} />
      <span className="flex flex-col gap-[3px] text-[12px] leading-none font-medium text-ink-muted">
        <b className="text-[14px] font-semibold text-ink tabular-nums">{dayMonYear(p.d)}</b>
        {p.l}
      </span>
    </span>
  );
  return (
    <div role="img" aria-label={`${a.l} ${dayMonYear(a.d)}; ${b.l} ${dayMonYear(b.d)}: ${n} days apart`} className={PANEL}>
      <div aria-hidden className="flex items-center justify-between text-[14px] leading-none font-semibold text-ink">
        <span>{soldAfter ? "Sold after the notice" : "Flagged after you bought it"}</span>
      </div>
      <div aria-hidden className="mt-5 flex items-center gap-2.5">
        <Point p={a} />
        <span className="relative grid h-0.5 min-w-15 max-w-[220px] flex-1 place-items-center bg-danger">
          <span className="absolute rounded-pill bg-danger-soft px-2.5 py-1.5 text-[13px] leading-none font-bold whitespace-nowrap text-danger">{n} days</span>
        </span>
        <Point p={b} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ vehicles: listed model years */

export function YearsPanel({ from, to, yours, source }: { from: number; to: number; yours: number; source: Notice["source"] }) {
  const span = Math.max(1, to - from);
  const pos = (y: number) => (y < from ? 4 : y > to ? 96 : from === to ? 50 : 20 + ((y - from) / span) * 60);
  const years = [from - 1, ...Array.from({ length: to - from + 1 }, (_, i) => from + i), to + 1];
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between text-[14px] leading-none font-semibold text-ink">
        <span>Listed model years</span>
        <Chip tone="alert">Your year is listed</Chip>
      </div>
      <div role="img" aria-label={`Listed model years ${from} to ${to}; yours is ${yours}`} className="mt-5">
        <div aria-hidden className="relative h-2.5 rounded-[5px] bg-surface-2">
          <div className="absolute inset-y-0 rounded-[5px] bg-[#F4C9C4] shadow-[inset_0_0_0_1.5px_var(--danger)]" style={{ left: `${pos(from)}%`, right: `${100 - pos(to)}%` }} />
          <div className="absolute top-1/2 -mt-[11px] -ml-[11px] size-[22px] rounded-full border-[3px] border-white bg-danger shadow-[0_1px_3px_rgb(11_27_51/.35)]" style={{ left: `${pos(yours)}%` }} />
        </div>
        <div aria-hidden className="relative mt-2 h-5 text-[12px] leading-none font-medium text-ink-muted tabular-nums">
          {years.map((y) => (
            <span
              key={y}
              className={cn("absolute top-1 -translate-x-1/2 whitespace-nowrap", y === yours ? "font-bold text-ink" : y >= from && y <= to ? "font-bold text-danger" : "")}
              style={{ left: `${pos(y)}%` }}
            >
              {y === yours ? `Yours ${y}` : y}
            </span>
          ))}
        </div>
      </div>
      {source === "nhtsa" && <p className="mt-3 text-[13px] leading-[1.4] text-ink-muted">NHTSA covers US vehicles, so confirm with your dealer using the VIN.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ loading */

export function CaseHeaderSkeleton() {
  const bar = "block rounded-sm bg-surface-2 motion-safe:animate-skeleton";
  return (
    <div aria-hidden className="mt-3 overflow-hidden rounded-md border border-[rgb(179_18_30/.28)] bg-surface-1 shadow-1 max-md:mt-2.5">
      <div className="h-13 bg-danger" />
      <div className="grid grid-cols-[132px_minmax(0,1fr)_452px] items-center gap-7 px-7 pt-6 pb-[26px] md:max-[1440px]:grid-cols-[112px_minmax(0,1fr)] max-md:grid-cols-[64px_minmax(0,1fr)] max-md:gap-3.5 max-md:p-4">
        <span className="size-[132px] rounded-md bg-surface-2 md:max-[1440px]:size-[112px] max-md:size-16" />
        <div className="grid gap-3">
          <span className={cn(bar, "h-3 w-24")} />
          <span className={cn(bar, "h-10 w-4/5")} />
          <span className={cn(bar, "h-10 w-3/5")} />
          <span className={cn(bar, "h-[52px] w-44")} />
        </div>
        <span className="h-[190px] rounded-md bg-surface-2 max-[1440px]:col-span-full max-md:h-40" />
      </div>
    </div>
  );
}
