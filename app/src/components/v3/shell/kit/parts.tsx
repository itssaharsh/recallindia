"use client";
import * as React from "react";
import { cn } from "../../ui";
import { IconSignal } from "../icons";

/** Kit section: numbered h2 on the left, a 560 px lede on the right (kit mockup `.sh`). */
export function KitSection({ id, n, title, lede, children, className }: { id: string; n: string; title: string; lede: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn("scroll-mt-20 pt-24 max-md:pt-16", className)}>
      <div className="mb-7 grid grid-cols-[1fr_560px] items-end gap-12 max-lg:grid-cols-1 max-lg:gap-2.5">
        <h2 id={`${id}-h`} className="flex items-baseline gap-3.5 font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink max-md:text-[30px]">
          <span className="-translate-y-1 font-sans text-[15px] font-bold tracking-[0.02em] text-cobalt tabular-nums">{n}</span>
          {title}
        </h2>
        <p className="text-[16px] leading-[1.5] text-ink-muted [&_b]:font-semibold [&_b]:text-ink">{lede}</p>
      </div>
      {children}
    </section>
  );
}

/** White panel, radius 22, padding 28 (20 on phones). */
export function Panel({ className, children, style }: { className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className={cn("rounded-lg border border-line bg-surface-1 p-7 max-md:p-5", className)} style={style}>{children}</div>;
}

export function PanelHead({ title, note }: { title: string; note?: React.ReactNode }) {
  return (
    <div className="mb-[18px] flex items-baseline justify-between gap-4">
      <h3 className="font-sans text-[20px] font-bold leading-[1.25] tracking-[-0.01em] text-ink">{title}</h3>
      {note && <span className="text-[14px] leading-[1.4] text-ink-muted">{note}</span>}
    </div>
  );
}

/** 13 px muted note; `<b>` inside is ink 600. */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[13px] leading-[1.45] text-ink-muted [&_b]:font-semibold [&_b]:text-ink", className)}>{children}</p>;
}

/** 12 px 600 label (column heads, "Rest", "Hover"). */
export function Lab({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("text-[12px] font-semibold leading-none tracking-[0.02em] text-ink-muted", className)}>{children}</span>;
}

/** 12-column grid, 16 px gap; one column on phones. Children set `col-span-*`. */
export function Grid12({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-12 gap-4 max-md:grid-cols-1 max-md:[&>*]:col-span-1", className)}>{children}</div>;
}

/** A 410 px phone (ink bezel, radius 48) with a 390 × 780 screen and a 15:08 status bar. */
export function PhoneFrame({ children, caption, screenClassName }: { children: React.ReactNode; caption: React.ReactNode; screenClassName?: string }) {
  return (
    <figure className="m-0">
      <div className="w-[410px] rounded-[48px] bg-ink p-2.5 shadow-2 max-md:w-full max-md:rounded-[44px] max-md:p-2">
        <div className={cn("relative flex h-[780px] w-[390px] flex-col overflow-hidden rounded-[38px] bg-canvas max-md:h-[720px] max-md:w-full", screenClassName)}>
          <div className="flex h-10 shrink-0 items-center justify-between bg-surface-1 pl-[30px] pr-[26px] text-[15px] font-semibold leading-none text-ink" aria-hidden>
            <span>15:08</span>
            <IconSignal size={18} />
          </div>
          {children}
        </div>
      </div>
      <figcaption className="mt-3.5 text-center text-[13px] leading-[1.45] text-ink-muted [&_b]:font-semibold [&_b]:text-ink">{caption}</figcaption>
    </figure>
  );
}

/** Annotation chip (spec §6.15): white card, radius 14, caps title in cobalt, 14 px body. */
export function AnnotationChip({ title, children, className, style, innerRef }: { title: string; children: React.ReactNode; className?: string; style?: React.CSSProperties; innerRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={innerRef}
      style={style}
      className={cn(
        "whitespace-nowrap rounded-md border border-line bg-surface-1 px-3 pb-[11px] pt-2.5 shadow-2",
        "[&_code]:rounded-[5px] [&_code]:bg-surface-2 [&_code]:px-[5px] [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px] [&_em]:not-italic [&_em]:text-ink-muted",
        className,
      )}
    >
      <small className="mb-1.5 block text-[11px] font-semibold uppercase leading-none tracking-[0.04em] text-cobalt">{title}</small>
      <span className="block text-[14px] font-medium leading-[1.35] text-ink">{children}</span>
    </div>
  );
}
