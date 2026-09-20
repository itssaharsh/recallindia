"use client";
import * as React from "react";
import { cn, Kbd } from "../ui";
import { IconAlert, IconSearch } from "./icons";
import { CategoryMark } from "./illustrations";
import { formatCount, formatIstTime } from "./format";
import type { Category, SourceStat } from "./types";

/*
 * Primitives specified in shell-tokens §6 that ui/ does not have yet:
 * IconButton (§6.1 "icon 44"), TextField + SearchField (§6.7), FilterPill + FilterBar (§6.3),
 * SourceChip (§6.3). They are shell-owned until promoted into ui/ (see README).
 */

/** Hover fill for controls that rest on surface-2 (spec: #DCE5F1). No token yet; see README. */
export const SURFACE_2_HOVER = "hover:bg-[#DCE5F1]";

// ---------------------------------------------------------------- IconButton
export type IconButtonVariant = "ghost" | "outline" | "soft";
const iconButtonVariants: Record<IconButtonVariant, string> = {
  ghost: "text-ink hover:bg-surface-2",
  outline: "border border-line-strong bg-surface-1 text-ink hover:bg-surface-2",
  soft: cn("bg-surface-2 text-ink", SURFACE_2_HOVER),
};

/** 44 × 44 round icon-only button. `label` becomes the accessible name (wrap in <Tooltip> too). */
export const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: IconButtonVariant }>(
  function IconButton({ label, variant = "ghost", className, children, type = "button", ...rest }, ref) {
    return (
      <button
        ref={ref} type={type} aria-label={label}
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,transform] duration-180 ease-out active:scale-[.97]",
          iconButtonVariants[variant], className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

// ---------------------------------------------------------------- TextField
const fieldFocus = "border-cobalt shadow-[inset_0_0_0_1px_var(--cobalt),0_0_0_4px_var(--cobalt-soft)]";
const fieldError = "border-warning shadow-[inset_0_0_0_1px_var(--warning),0_0_0_4px_var(--warning-soft)]";

export type TextFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  helper?: string;
  /** Replaces the helper; warning colour (red means something you own is affected, not a typo). */
  error?: string;
  /** Kit only: draw the focus state without focus. */
  forceFocus?: boolean;
};

/** Label above, 48 px field, radius 8, 1px line-strong, helper or error below (spec §6.7). */
export function TextField({ label, helper, error, forceFocus, id, className, ...rest }: TextFieldProps) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <label htmlFor={inputId} className="text-[14px] font-semibold leading-none text-ink">{label}</label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helper ? msgId : undefined}
        className={cn(
          "h-12 w-full rounded-sm border border-line-strong bg-surface-1 px-3.5 text-[16px] font-medium tracking-[0.02em] text-ink outline-none",
          "transition-[border-color,box-shadow] duration-180 ease-out placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-subtle",
          error ? fieldError : forceFocus ? fieldFocus : "focus:border-cobalt focus:shadow-[inset_0_0_0_1px_var(--cobalt),0_0_0_4px_var(--cobalt-soft)]",
        )}
        {...rest}
      />
      {error ? (
        <p id={msgId} className="flex items-start gap-1.5 text-[13px] font-medium leading-[1.4] text-warning">
          <IconAlert size={16} className="mt-px shrink-0" />
          {error}
        </p>
      ) : helper ? (
        <p id={msgId} className="text-[13px] leading-[1.4] text-ink-muted">{helper}</p>
      ) : null}
    </div>
  );
}

/** Search field: 48 px pill on surface-2, no border, 18 px icon, trailing "/" key on desktop. */
export function SearchField({ label, shortcut = "/", className, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & { label: string; shortcut?: string | null }) {
  return (
    <label className={cn("grid content-start gap-2", className)}>
      <span className="text-[14px] font-semibold leading-none text-ink">{label}</span>
      <span className="flex h-12 items-center gap-2.5 rounded-pill bg-surface-2 px-3.5 transition-shadow duration-180 ease-out focus-within:shadow-[inset_0_0_0_1px_var(--cobalt),0_0_0_4px_var(--cobalt-soft)]">
        <IconSearch size={18} className="shrink-0 text-ink-muted" />
        <input
          type="search"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-subtle focus-visible:shadow-none"
          {...rest}
        />
        {shortcut && <span className="max-md:hidden [&>kbd]:bg-surface-1"><Kbd>{shortcut}</Kbd></span>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------- FilterPill
export type FilterLead = { type: "category"; category: Category } | { type: "alert" };

export interface FilterPillProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  count?: number;
  selected?: boolean;
  lead?: FilterLead;
  size?: "md" | "sm";
  /** Kit only: draw the hover state. */
  forceHover?: boolean;
}

/**
 * Filter pill (spec §6.3): 44 high, surface-1, 1px line, Onest 500 15. Selected is the ink face
 * with a white label, `aria-pressed`. Category lead = 10 px square; "On a notice" lead = 8 px red dot.
 */
export const FilterPill = React.forwardRef<HTMLButtonElement, FilterPillProps>(function FilterPill(
  { label, count, selected = false, lead, size = "md", forceHover, className, type = "button", ...rest }, ref,
) {
  return (
    <button
      ref={ref} type={type} aria-pressed={selected}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border font-medium leading-none",
        "transition-[background-color,border-color,color,transform] duration-180 ease-out active:scale-[.97]",
        size === "md" ? "h-11 px-4 text-[15px]" : "h-9 px-3 text-[14px] pointer-coarse:h-11",
        selected ? "border-ink bg-ink text-white" : cn("border-line bg-surface-1 text-ink hover:bg-surface-2", forceHover && "bg-surface-2"),
        className,
      )}
      {...rest}
    >
      {lead?.type === "category" && <CategoryMark category={lead.category} />}
      {lead?.type === "alert" && <span aria-hidden className="size-2 shrink-0 rounded-full bg-danger" />}
      {label}
      {count !== undefined && (
        // #C9D3E3 on ink per spec §6.3 (no token; see README)
        <span className={cn("text-[13px] font-semibold tabular-nums", selected ? "text-[#C9D3E3]" : "text-ink-muted")}>{count}</span>
      )}
    </button>
  );
});

export interface FilterOption { id: string; label: string; count?: number; lead?: FilterLead }

/** A row of filter pills in a `role="toolbar"`; arrow keys move between pills (one tab stop). */
export function FilterBar({
  options, value, onChange, label, forceHoverId, className,
}: { options: FilterOption[]; value: string; onChange?: (id: string) => void; label: string; forceHoverId?: string; className?: string }) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.id === value));
  const [focusIndex, setFocusIndex] = React.useState(selectedIndex);
  React.useEffect(() => setFocusIndex(selectedIndex), [selectedIndex]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    let next = focusIndex;
    if (e.key === "ArrowRight") next = focusIndex === last ? 0 : focusIndex + 1;
    else if (e.key === "ArrowLeft") next = focusIndex === 0 ? last : focusIndex - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    setFocusIndex(next);
    refs.current[next]?.focus();
  };

  return (
    <div role="toolbar" aria-label={label} onKeyDown={onKeyDown} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o, i) => (
        <FilterPill
          key={o.id}
          ref={(el) => { refs.current[i] = el; }}
          label={o.label} count={o.count} lead={o.lead}
          selected={o.id === value}
          forceHover={o.id === forceHoverId}
          tabIndex={i === focusIndex ? 0 : -1}
          onFocus={() => setFocusIndex(i)}
          onClick={() => onChange?.(o.id)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- SourceChip
/**
 * Source chip (spec §6.3) from `/v1/stats` → `sources[]`: `healthy` → success dot + count;
 * `degraded` → warning dot + "slow · {count}"; anything else → danger dot + "down since {HH:MM}".
 */
export function SourceChip({ source, className }: { source: SourceStat; className?: string }) {
  const down = source.health !== "healthy" && source.health !== "degraded";
  const dot = source.health === "healthy" ? "bg-success" : source.health === "degraded" ? "bg-warning" : "bg-danger";
  const detail =
    source.health === "healthy"
      ? formatCount(source.count)
      : source.health === "degraded"
        ? `slow · ${formatCount(source.count)}`
        : source.last_success_at
          ? `down since ${formatIstTime(source.last_success_at)}`
          : "down";
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-pill border bg-surface-1 pl-2.5 pr-3 text-[12px] font-bold leading-none tracking-[0.05em] text-ink",
        down ? "border-[rgb(179_18_30/0.35)]" : "border-line",
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot)} />
      {source.label}
      <span className="font-medium tracking-normal text-ink-muted">{detail}</span>
    </span>
  );
}

// ---------------------------------------------------------------- AlertBadge
/** Red count badge on "My things" (nav 20 px, tab bar 18 px with a 2 px white ring). */
export function AlertBadge({ count, size = "nav", announce = true, className }: { count: number; size?: "nav" | "tabbar"; announce?: boolean; className?: string }) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "inline-grid place-items-center rounded-pill bg-danger font-bold leading-none text-white tabular-nums",
          size === "nav" ? "h-5 min-w-5 px-1.5 text-[12px]" : "h-[18px] min-w-[18px] px-[5px] text-[11px] shadow-[0_0_0_2px_var(--surface-1)]",
          className,
        )}
      >
        {count}
      </span>
      {announce && <span className="sr-only">, {count} on a notice</span>}
    </>
  );
}
