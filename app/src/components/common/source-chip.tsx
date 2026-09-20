"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { confidenceLabel, sourceLabel } from "@/lib/format";
import type { Notice } from "@/lib/types";

/** Neutral source chip (no status colour: colour is reserved for health and decisions). */
export function SourceChip({ notice, tooltip = true }: { notice: Notice; tooltip?: boolean }) {
  const chip = (
    <span className="inline-flex h-5 items-center rounded-sm border border-line px-1.5 font-mono text-[10.5px] tracking-wider text-ink-muted uppercase">
      {sourceLabel(notice.source)}
    </span>
  );
  if (!tooltip) return chip;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={-1} aria-label={`${sourceLabel(notice.source)}: ${confidenceLabel(notice)}`}>
          {chip}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="font-mono text-[11px]">
        {confidenceLabel(notice)}
      </TooltipContent>
    </Tooltip>
  );
}
