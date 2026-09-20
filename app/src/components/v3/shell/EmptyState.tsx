"use client";
import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button, cn } from "../ui";
import { IconSearch } from "./icons";
import { formatCount } from "./format";

/**
 * Empty states (spec §6.14). Each says what would be here, why it's empty and one next step,
 * and borrows the product's objects (a blister, a search, a batch code) instead of stock art.
 */
export type EmptyStateProps =
  | {
      type: "household-empty";
      /** `GET /v1/stats` → `total` */
      total: number;
      /** `GET /v1/stats` → `sources.length` */
      sourcesCount: number;
      onAdd?: () => void;
      onCopyDemo?: () => void;
      headingAs?: "h1" | "h2" | "h3";
      /** Optional small print under the actions (the kit labels each state with its route). */
      footnote?: React.ReactNode;
      className?: string;
    }
  | {
      type: "feed-none";
      query: string;
      total: number;
      /** `GET /v1/stats` → `sources[].label` */
      sourceLabels: string[];
      suggestions: string[];
      onClearQuery?: () => void;
      onSuggestion?: (q: string) => void;
      headingAs?: "h1" | "h2" | "h3";
      /** Optional small print under the actions (the kit labels each state with its route). */
      footnote?: React.ReactNode;
      className?: string;
    }
  | {
      type: "not-found";
      feedHref?: string;
      mineHref?: string;
      headingAs?: "h1" | "h2" | "h3";
      /** Optional small print under the actions (the kit labels each state with its route). */
      footnote?: React.ReactNode;
      className?: string;
    };

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const pocket =
  "size-16 rounded-full bg-white/35 shadow-[inset_0_3px_6px_rgb(11_27_51/0.22),inset_0_-1px_0_rgb(255_255_255/0.9),0_1px_0_rgb(255_255_255/0.7)] max-md:size-[52px]";

/** The empty foil blister: 3 × 2 pockets, one dashed cobalt "+" pocket. */
function EmptyBlister({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "grid w-max rotate-[-4deg] grid-cols-[repeat(3,64px)] justify-center gap-3.5 rounded-lg p-[22px] max-md:grid-cols-[repeat(3,52px)]",
        "bg-[image:var(--foil)] shadow-[inset_0_1px_0_rgb(255_255_255/0.8),inset_0_0_0_1px_rgb(11_27_51/0.12),0_18px_34px_-16px_rgb(11_27_51/0.35)]",
        className,
      )}
    >
      <span className={pocket} />
      <span className={pocket} />
      <span className="grid size-16 place-items-center rounded-full border-2 border-dashed border-cobalt text-cobalt max-md:size-[52px]">
        <Plus size={24} strokeWidth={2.2} />
      </span>
      <span className={pocket} />
      <span className={pocket} />
      <span className={pocket} />
    </div>
  );
}

export function EmptyState(props: EmptyStateProps) {
  const H = props.headingAs ?? "h2";

  if (props.type === "household-empty") {
    return (
      <section className={cn("grid grid-cols-[300px_1fr] items-center gap-8 rounded-lg border border-line bg-surface-1 p-8 max-md:grid-cols-1 max-md:p-[22px]", props.className)}>
        <EmptyBlister className="justify-self-center" />
        <div>
          <H className="font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.03em] text-ink">Nothing in your household yet</H>
          <p className="mt-2.5 text-[16px] leading-[1.5] text-ink-muted">
            Add a medicine strip, a vehicle or an appliance. We check it against{" "}
            <b className="font-semibold text-ink">{formatCount(props.total)} notices</b> from {props.sourcesCount} regulators the moment you add it, and every 15 minutes after.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Button icon={<Plus size={18} aria-hidden />} onClick={props.onAdd}>Add a thing</Button>
            <Button variant="secondary" onClick={props.onCopyDemo}>Copy the demo household</Button>
          </div>
          {props.footnote && <p className="mt-3 text-[13px] leading-[1.45] text-ink-muted">{props.footnote}</p>}
        </div>
      </section>
    );
  }

  if (props.type === "feed-none") {
    return (
      <section className={cn("rounded-lg border border-line bg-surface-1 px-8 py-9 text-center max-md:px-5 max-md:py-6", props.className)}>
        <span aria-hidden className="mx-auto mb-[18px] grid size-[84px] place-items-center rounded-full bg-surface-2 text-cobalt">
          <IconSearch size={38} />
        </span>
        <H className="font-display text-[26px] font-extrabold leading-[1.08] tracking-[-0.03em] text-ink">No notices match</H>
        <div className="mt-3">
          <span className="inline-flex h-10 items-center gap-2 rounded-pill bg-surface-2 pl-3.5 pr-2 text-[15px] font-medium leading-none text-ink">
            “{props.query}”
            <button
              type="button"
              aria-label="Clear the search"
              onClick={props.onClearQuery}
              className="grid size-7 place-items-center rounded-full bg-surface-1 text-ink pointer-coarse:size-11"
            >
              <X size={14} aria-hidden />
            </button>
          </span>
        </div>
        <p className="mx-auto mt-3 max-w-[520px] text-[16px] leading-[1.5] text-ink-muted">
          Searched {formatCount(props.total)} notices from {listJoin(props.sourceLabels)}. Batch codes match exactly, letter for letter.
        </p>
        <div className="mt-3.5 flex flex-wrap justify-center gap-2">
          {props.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => props.onSuggestion?.(s)}
              className="inline-flex h-9 items-center rounded-pill border border-line bg-surface-1 px-3 text-[14px] font-medium leading-none text-ink transition-colors duration-180 ease-out hover:bg-surface-2 pointer-coarse:h-11"
            >
              {s}
            </button>
          ))}
        </div>
        {props.footnote && <p className="mt-3 text-[13px] leading-[1.45] text-ink-muted">{props.footnote}</p>}
      </section>
    );
  }

  return (
    <section className={cn("grid grid-cols-[1fr_auto] items-center gap-10 rounded-lg bg-cobalt-soft px-10 py-9 max-md:grid-cols-1 max-md:gap-6 max-md:px-5 max-md:py-6", props.className)}>
      <div>
        <H className="font-display text-[40px] font-extrabold leading-[1.06] tracking-[-0.03em] text-ink max-md:text-[30px]">This page isn't on any list</H>
        <p className="mt-2.5 max-w-[640px] text-[16px] leading-[1.5] text-ink-muted">
          The link may be old or mistyped. Every notice is still in the feed, and the demo household is one click away.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button href={props.feedHref ?? "/feed/"}>Open the feed</Button>
          <Button variant="secondary" href={props.mineHref ?? "/mine/"}>Check what you own</Button>
        </div>
        {props.footnote && <p className="mt-3 text-[13px] leading-[1.45] text-ink-muted">{props.footnote}</p>}
      </div>
      <div aria-hidden className="flex items-center gap-[22px]">
        <span className="font-foil text-[26px] font-black leading-none tracking-[0.06em] text-ink/85">B.No.</span>
        <span
          className={cn(
            "inline-flex h-24 items-center rounded-md px-6 font-foil text-[72px] font-black leading-none tracking-[0.06em] text-ink max-md:h-[72px] max-md:text-[48px]",
            "bg-[image:var(--foil)] shadow-[var(--foil-edge)]",
          )}
        >
          404
        </span>
      </div>
    </section>
  );
}
