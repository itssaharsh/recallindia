"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "../ui";
import { accessibleRowName, displayProduct, hazard, identifiers, illustrationFor, remedyLabel, rowIdText } from "./derive";
import { fmtDate } from "./format";
import { springSoft } from "./motion";
import { CapsLabel, IdChip, ObjectTile, Skeleton, SmallChip, SolidChip, SourceChip } from "./primitives";
import type { Notice } from "./types";

export interface NoticeRowProps {
  notice: Notice;
  /** The sheet is open on this row. */
  selected?: boolean;
  /** Arrived by a poll after page load: cobalt-soft wash that fades over 2 s + "New" chip. */
  isNew?: boolean;
  /** A household thing matches this notice: "In your things" chip beside the date. */
  inHousehold?: boolean;
  /** Plain left click opens the sheet in place; modified / middle clicks follow the href. */
  onOpen?: (pk: string) => void;
  /** Position in the first 6 rows of the page's load sequence (fade up 8 px, 40 ms stagger). */
  introIndex?: number | null;
}

export const noticeHref = (pk: string): string => `/feed?notice=${encodeURIComponent(pk)}`;

/**
 * One notice (spec 1.6.3). Grid at ≥ lg: 56 | 1.2fr | 220 | 1.3fr | 120 | 20, 101 px tall.
 * At 390: 48 | 1fr, identifiers under the title, hazard and date full width, no chevron.
 * Matches the rows in feed-1536.png / feed-full-1536.png / feed-390.png.
 */
export function NoticeRow({ notice: n, selected = false, isNew = false, inHousehold = false, onOpen, introIndex = null }: NoticeRowProps) {
  const ids = identifiers(n);
  const hz = hazard(n);
  const remedy = remedyLabel(n);
  const intro = introIndex != null && introIndex < 6;
  const delay = intro ? 0.4 + introIndex! * 0.04 : 0;

  return (
    <motion.li
      className="relative"
      initial={intro ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ opacity: { duration: 0.16, ease: "linear", delay }, y: { ...springSoft, delay } }}
    >
      <a
        href={noticeHref(n.pk)}
        data-notice-row={n.pk}
        aria-label={accessibleRowName(n)}
        aria-current={selected || undefined}
        onClick={(e) => {
          if (!onOpen || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onOpen(n.pk);
        }}
        className={cn(
          "group relative grid grid-cols-[48px_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 border-b border-line px-4 py-3.5 text-ink no-underline transition-colors duration-150",
          "lg:min-h-[101px] lg:grid-cols-[56px_minmax(0,1.2fr)_220px_minmax(0,1.3fr)_120px_20px] lg:items-center lg:gap-5 lg:px-5",
          "focus-visible:outline-[3px] focus-visible:-outline-offset-2 focus-visible:outline-cobalt",
          selected ? "z-[1] bg-cobalt-wash shadow-[inset_0_0_0_2px_var(--color-cobalt)]" : "bg-surface-1 hover:bg-wash focus-visible:shadow-none",
        )}
      >
        {isNew && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-cobalt-soft"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 2, ease: "linear" }}
          />
        )}

        <ObjectTile name={illustrationFor(n)} source={n.source} size={56} sizeClass="size-12 lg:size-14" className="relative row-span-2 lg:row-span-1" />

        <div className="relative min-w-0">
          <div className="flex items-center gap-2">
            <SourceChip source={n.source} />
            <span className="truncate font-mono text-[12.5px] leading-none text-ink-muted">{rowIdText(n)}</span>
          </div>
          <h3 className="mt-1.5 line-clamp-2 font-sans text-[16px] leading-[1.3] font-semibold tracking-normal text-ink lg:line-clamp-1 lg:text-[16.5px]">
            {displayProduct(n)}
          </h3>
          {n.brand && <p className="mt-0.5 text-[13.5px] leading-[1.35] text-ink-muted lg:truncate">{n.brand}</p>}
        </div>

        <div className="relative col-start-2 flex min-w-0 flex-row flex-wrap items-center gap-2 lg:col-start-auto lg:flex-col lg:items-start lg:gap-1.5">
          <CapsLabel className="max-lg:hidden">{ids.label}</CapsLabel>
          {ids.chips.length ? (
            <span className="flex flex-wrap items-center gap-[5px]">
              {ids.chips.map((c) => (
                <IdChip key={c}>{c}</IdChip>
              ))}
              {ids.more > 0 && <span className="text-[13px] font-medium text-ink-muted">+{ids.more}</span>}
            </span>
          ) : (
            <span className="text-[13px] leading-[1.3] text-ink-muted max-lg:hidden">None listed</span>
          )}
        </div>

        <div className="relative col-span-2 mt-1 min-w-0 lg:col-span-1 lg:mt-0">
          <b className="block text-[14px] leading-[1.3] font-semibold text-ink">{hz.label}</b>
          <p className="mt-[3px] line-clamp-2 text-[14px] leading-[1.4] text-ink-muted">{hz.description}</p>
        </div>

        <div className="relative col-span-2 mt-0.5 flex flex-row flex-wrap items-center justify-between gap-2 lg:col-span-1 lg:mt-0 lg:flex-col lg:items-end lg:gap-[7px]">
          <span className="flex items-center gap-2">
            {isNew && <SolidChip>New</SolidChip>}
            <time dateTime={n.published_at} className="text-[14px] leading-none font-medium whitespace-nowrap text-ink">
              {fmtDate(n.published_at)}
            </time>
          </span>
          {(remedy || inHousehold) && (
            <span className="flex items-center gap-1.5">
              {inHousehold && <SmallChip tone="alert">In your things</SmallChip>}
              {remedy && <SmallChip tone="clear">{remedy}</SmallChip>}
            </span>
          )}
        </div>

        <ChevronRight
          aria-hidden
          strokeWidth={2.2}
          className={cn("relative hidden size-5 transition-colors lg:block", selected ? "text-cobalt" : "text-line-strong group-hover:text-cobalt")}
        />
      </a>
    </motion.li>
  );
}

/** Loading row: tile, 3 bars, 2 bars, a date bar (pulse .6 ↔ 1 over 1.2 s, static with reduced motion). */
export function NoticeRowSkeleton() {
  return (
    <li aria-hidden className="grid grid-cols-[48px_1fr] gap-x-3 gap-y-2 border-b border-line px-4 py-3.5 lg:min-h-[101px] lg:grid-cols-[56px_minmax(0,1.2fr)_220px_minmax(0,1.3fr)_120px_20px] lg:items-center lg:gap-5 lg:px-5">
      <Skeleton className="size-12 rounded-[12px] lg:size-14" />
      <span className="space-y-2">
        <Skeleton className="h-5 w-24 rounded-pill" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-2/5" />
      </span>
      <span className="space-y-2 max-lg:hidden">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-6 w-24" />
      </span>
      <span className="col-span-2 space-y-2 lg:col-span-1">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3.5 w-11/12" />
      </span>
      <Skeleton className="h-3.5 w-20 max-lg:hidden lg:justify-self-end" />
    </li>
  );
}
