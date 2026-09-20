"use client";
/**
 * Small pieces shared by /feed, /ingest and /api (spec §0.2). They sit on top of ../ui:
 * status chips use ui/Chip, dots ui/Dot, keys ui/Kbd; what ui doesn't have is here.
 */
import * as React from "react";
import { Check } from "lucide-react";
import { cn, Dot } from "../ui";
import { Illustration, type IllustrationName } from "./Illustration";
import { SOURCES } from "./sources";
import type { SourceHealth, SourceId } from "./types";

export function SrOnly({ children, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className="sr-only" {...rest}>{children}</span>;
}

/** 24 px source pill: 8 px swatch + label in the source ink on its tint. */
export function SourceChip({ source, className }: { source: SourceId; className?: string }) {
  return (
    <span
      data-source={source}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill pr-[9px] pl-2",
        "bg-src-bg font-sans text-[12px] leading-none font-bold tracking-[.04em] text-src-ink",
        className,
      )}
    >
      <span aria-hidden className="size-2 rounded-[3px] bg-src" />
      {SOURCES[source].label}
    </span>
  );
}

export type IdChipSize = "md" | "sm" | "inline";
const ID_SIZES: Record<IdChipSize, string> = { md: "h-[26px] text-[13.5px]", sm: "h-[22px] text-[12px]", inline: "h-6 align-[1px] text-[13.5px]" };
/** Mono identifier chip (batch, lot, model, date code, notice id). md 26 px, sm 22 px (dense rows), inline 24 px (in a sentence). */
export function IdChip({ children, size = "md", tone = "neutral", className }: { children: React.ReactNode; size?: IdChipSize; tone?: "neutral" | "alert"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-xs px-2 font-mono leading-none",
        ID_SIZES[size],
        tone === "alert" ? "bg-danger-soft text-danger" : "bg-surface-2 text-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Illustration tile on the source tint. `size` in px; radius 12 (10 at ≤ 44, 8 at ≤ 30).
 * `surface="white"` for tiles on a tinted header; `round` for the banner's mini pills.
 */
export function ObjectTile({
  name, source, size, sizeClass, surface = "tint", round = false, alert = false, className,
}: {
  name: IllustrationName; source: SourceId;
  /** px; also picks the radius. */
  size: number;
  /** Responsive size classes instead of the inline px size (e.g. "size-12 lg:size-14"). */
  sizeClass?: string;
  surface?: "tint" | "white"; round?: boolean; alert?: boolean; className?: string;
}) {
  const radius = round ? "rounded-full" : size <= 30 ? "rounded-sm" : size <= 44 ? "rounded-[10px]" : "rounded-[12px]";
  return (
    <span
      data-source={source}
      data-tone={alert ? "alert" : undefined}
      style={sizeClass ? undefined : { width: size, height: size }}
      className={cn("grid shrink-0 place-items-center", radius, sizeClass, surface === "white" ? "bg-surface-1" : "bg-src-bg", className)}
    >
      <Illustration name={name} className="size-[76%]" />
    </span>
  );
}

const HEALTH: Record<SourceHealth, { dot: string; word: string; text: string }> = {
  healthy: { dot: "bg-success ring-success-soft", word: "Healthy", text: "text-success" },
  slow: { dot: "bg-warning ring-warning-soft", word: "Slow", text: "text-warning" },
  degraded: { dot: "bg-warning ring-warning-soft", word: "Slow", text: "text-warning" },
  down: { dot: "bg-danger ring-danger-soft", word: "Down", text: "text-danger" },
};
export const healthWord = (h: SourceHealth): string => HEALTH[h].word;
export const healthText = (h: SourceHealth): string => HEALTH[h].text;

/** 8 px dot with a 3 px soft ring (ui/Dot + ring). Red only for a source that is down. */
export function HealthDot({ health, className }: { health: SourceHealth; className?: string }) {
  return <Dot className={cn("ring-[3px]", HEALTH[health].dot, className)} />;
}

/** Solid 22 px chip (the "New" chip). ui/Chip has no solid-cobalt tone, so it lives here. */
export function SolidChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center rounded-pill bg-cobalt px-2 text-[11.5px] leading-none font-bold tracking-[.03em] text-on-cobalt", className)}>
      {children}
    </span>
  );
}

/** 22 px soft chip: remedy ("Free repair"), "In your things", diff states. */
export function SmallChip({ tone, children, className }: { tone: "clear" | "alert" | "info" | "neutral"; children: React.ReactNode; className?: string }) {
  const tones = { clear: "bg-success-soft text-success", alert: "bg-danger-soft text-danger", info: "bg-cobalt-soft text-cobalt", neutral: "bg-surface-2 text-ink-muted" };
  return <span className={cn("inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-pill px-2 text-[12px] leading-none font-semibold", tones[tone], className)}>{children}</span>;
}

/** Caps label above a value (BATCH, MODEL YEARS, MANUFACTURED…). */
export function CapsLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("block text-[11px] leading-none font-semibold tracking-[.06em] text-ink-muted uppercase", className)}>{children}</span>;
}

/** Opacity-only skeleton block (static under reduced motion via the global rule). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-row-pulse rounded-sm bg-surface-2", className)} />;
}

/** 44 px round icon button (sheet close, copy link). */
export const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; filled?: boolean }>(
  function IconButton({ label, filled = false, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
          filled ? "bg-surface-2 text-ink hover:bg-line" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

/**
 * FilterPill (same component as /mine): 44 px (40 below lg), ink when selected.
 * A source pill carries a 10 px swatch. Inside a role=toolbar it roves (arrow keys via
 * onRoveKeyDown, only the selected pill is a tab stop); `rove={false}` makes it a plain button.
 */
export interface FilterPillProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  selected: boolean;
  label: string;
  source?: SourceId;
  count?: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  rove?: boolean;
  onClick?: () => void;
}

export const FilterPill = React.forwardRef<HTMLButtonElement, FilterPillProps>(function FilterPill(
  { selected, source, label, count, onClick, icon, trailing, rove = true, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-rove={rove || undefined}
      data-source={source}
      aria-pressed={rove ? selected : undefined}
      tabIndex={rove ? (selected ? 0 : -1) : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border px-3.5 text-[14px] leading-none font-medium lg:h-11 lg:px-4 lg:text-[15px]",
        "transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
        selected ? "border-ink bg-ink text-white" : "border-line bg-surface-1 text-ink hover:bg-surface-2",
        className,
      )}
      {...rest}
    >
      {source && <span aria-hidden className="size-2.5 rounded-[3px] bg-src" />}
      {icon}
      {label}
      {count && <span className={cn("text-[13px] font-semibold tabular-nums", selected ? "text-on-ink-muted" : "text-ink-muted")}>{count}</span>}
      {trailing}
    </button>
  );
});

/** Label above a control, with an optional hint (Onest 600 13 / 400 13 muted). */
export function FieldLabel({ htmlFor, label, hint, className }: { htmlFor: string; label: string; hint?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-2 block text-[13px] leading-none font-semibold text-ink", className)}>
      {label}
      {hint && <span className="ml-1 font-normal text-ink-muted">{hint}</span>}
    </label>
  );
}

/** Classes for a 44 px field shell (input or select): radius 8, 1 px line-strong. */
export const fieldShell =
  "flex h-11 min-w-0 items-center gap-2 rounded-sm border border-line-strong bg-surface-1 px-3.5 text-[15px] text-ink " +
  "focus-within:border-cobalt focus-within:shadow-[0_0_0_3px_var(--color-cobalt-soft)]";

/** Two-option segmented control (Pretty | Raw). */
export function Segmented<T extends string>({ value, options, onChange, label, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-pill bg-surface-2 p-[3px]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-pill px-3 py-[7px] text-[13px] leading-none font-medium transition-colors duration-150 pointer-coarse:min-h-11",
            "focus-visible:outline-2 focus-visible:outline-cobalt",
            value === o.value ? "bg-surface-1 text-ink shadow-1" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Round status disc with a check (household clear, ingest gutter). */
export function CheckDisc({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span style={{ width: size, height: size }} className={cn("grid shrink-0 place-items-center rounded-full", className)}>
      <Check aria-hidden strokeWidth={3} style={{ width: size / 2, height: size / 2 }} />
    </span>
  );
}
