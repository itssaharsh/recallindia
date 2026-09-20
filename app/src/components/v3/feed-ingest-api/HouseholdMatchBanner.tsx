"use client";
import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "../ui";
import { matchLabel } from "./derive";
import { AlertGlyph } from "./Illustration";
import { IdChip, ObjectTile } from "./primitives";
import { SOURCES } from "./sources";
import type { HouseholdCheck, HouseholdMatch } from "./types";

export interface HouseholdMatchBannerProps {
  /** The /mine household check. null while it runs: the banner stays hidden (no flash). */
  check: HouseholdCheck | null;
  /** "/mine?filter=alert" */
  href?: string;
}

const illustrationFor = (m: HouseholdMatch) =>
  m.item.kind === "vehicle" ? "suv" : m.item.kind === "medicine" ? "strip" : SOURCES[m.notice.source].illustration;

/**
 * "You're affected" link from the public feed to your things (spec 1.5). Red, because a thing you
 * own is on a notice. Hidden at 0 matches; shows two pills and "+{n−2} more" beyond that.
 * Matches feed-1536.png (56 px pill) and feed-390.png (150 px card).
 */
export function HouseholdMatchBanner({ check, href = "/mine/?filter=alert" }: HouseholdMatchBannerProps) {
  if (!check || check.matches.length === 0) return null;
  const n = check.matches.length;
  const lead = n === 1 ? `1 notice matches something in ${check.name}.` : `${n} notices match things in ${check.name}.`;
  return (
    <div
      role="status"
      className="mt-4 flex flex-wrap items-start gap-2.5 rounded-md border border-danger-edge bg-danger-soft py-3 pr-3 pl-3.5 lg:min-h-14 lg:flex-nowrap lg:items-center lg:gap-3 lg:rounded-pill lg:py-1.5 lg:pr-1.5 lg:pl-2"
    >
      <span className="hidden size-10 shrink-0 place-items-center rounded-full bg-surface-1 text-danger lg:grid">
        <AlertGlyph className="size-5" />
      </span>
      <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2 text-[15px] leading-[1.35] font-medium text-ink lg:gap-3.5">
        <b className="basis-full text-[14.5px] font-semibold tracking-[-.005em] text-danger lg:basis-auto lg:text-[15px] lg:tracking-normal">{lead}</b>
        {check.matches.slice(0, 2).map((m) => {
          const l = matchLabel(m);
          return (
            <span
              key={m.notice.pk + m.item.item_id}
              className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-danger-edge bg-surface-1 pr-2 pl-2.5 text-[13.5px] leading-none font-medium text-ink lg:h-9 lg:gap-2 lg:pr-3 lg:pl-[3px] lg:text-[14px]"
            >
              <ObjectTile name={illustrationFor(m)} source={m.notice.source} size={30} round alert={m.item.kind === "medicine"} className="max-lg:hidden" />
              {l.name}
              {l.batch && (
                <IdChip size="sm" tone="alert" className="max-lg:px-1.5 lg:text-[12.5px]">
                  {l.batch}
                </IdChip>
              )}
              <span className="hidden items-center gap-2 lg:inline-flex">
                {l.detail}
                {l.id && (
                  <IdChip size="sm" tone="alert" className="lg:text-[12.5px]">
                    {l.id}
                  </IdChip>
                )}
              </span>
            </span>
          );
        })}
        {n > 2 && <span className="text-[14px] font-semibold text-danger">+{n - 2} more</span>}
      </p>
      <span className="hidden flex-1 lg:block" />
      <Button variant="danger" href={href} className="w-full lg:w-auto">
        See my things
        <ArrowRight aria-hidden className="size-[18px]" />
      </Button>
    </div>
  );
}
