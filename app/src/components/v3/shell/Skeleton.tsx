"use client";
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../ui";
import { useDelayedFlag } from "./hooks";
import { fade } from "./motion";

/**
 * Skeleton (spec §6.13): surface-2 blocks shaped like the incoming content, radius 8 (pills keep
 * pill), `animate-skeleton` = opacity 1 ↔ 0.55 over 1.4 s. No gradient sweep. The global
 * reduced-motion rule stops the pulse, leaving static blocks.
 */
export function Skeleton({ className, style, pill = false }: { className?: string; style?: React.CSSProperties; pill?: boolean }) {
  return <span aria-hidden className={cn("block animate-skeleton bg-surface-2", pill ? "rounded-pill" : "rounded-sm", className)} style={style} />;
}

/** Feed rows: 56 high; source 56 · title 64–82 % · date 72. */
export function SkeletonFeedRows({ widths = [82, 64, 74], className }: { widths?: number[]; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-md border border-line bg-surface-1", className)}>
      {widths.map((w, i) => (
        <div key={i} className={cn("grid h-14 grid-cols-[86px_1fr_90px] items-center gap-3.5 px-4", i > 0 && "border-t border-line")}>
          <Skeleton className="h-3" style={{ width: i % 2 ? 48 : 56 }} />
          <Skeleton className="h-3.5" style={{ width: `${w}%` }} />
          <Skeleton className="h-3 w-[72px] justify-self-end" />
        </div>
      ))}
    </div>
  );
}

/** Item card: 88 tile + three lines (caps label, title, chip). */
export function SkeletonItemCard({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-4 rounded-md border border-line bg-surface-1 p-4", className)}>
      <Skeleton className="size-[88px] shrink-0 rounded-[12px]" />
      <div className="grid flex-1 content-start gap-2.5 pt-1.5">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-[18px] w-[86%]" />
        <Skeleton pill className="h-[26px] w-24" />
      </div>
    </div>
  );
}

/** Stat card: 40 × 160 number + the source bar. */
export function SkeletonStat({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-md border border-line bg-surface-1 p-4", className)}>
      <Skeleton className="h-10 w-40" />
      <Skeleton className="mt-4 h-2.5 w-full rounded-[5px]" />
    </div>
  );
}

/**
 * Loading region: `aria-busy` while loading; the skeleton appears only if loading lasts 300 ms,
 * and the content replaces it with a 180 ms opacity fade.
 */
export function Loadable({
  loading, skeleton, children, label, className,
}: { loading: boolean; skeleton: React.ReactNode; children: React.ReactNode; label?: string; className?: string }) {
  const showSkeleton = useDelayedFlag(loading, 300);
  return (
    <div aria-busy={loading || undefined} aria-label={label} className={className}>
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          showSkeleton ? (
            <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
              {skeleton}
            </motion.div>
          ) : null
        ) : (
          <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
