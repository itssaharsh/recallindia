import * as React from "react";
import { cn } from "./cn";

export type FoilChipSize = "sm" | "md" | "lg";
const sizes: Record<FoilChipSize, string> = {
  sm: "h-7 px-2.5 text-foil-sm",
  md: "h-[34px] px-3 text-foil-md",
  lg: "h-[52px] px-4 text-foil-lg",
};
/**
 * The signature visual: a batch/lot/serial code in Doto on brushed foil, the way it is printed on a strip.
 * `diff` = indexes of characters that differ from a comparison code (near-miss): underlined in cobalt.
 * Never used for words. Reads the same on red or cobalt faces (do not recolour).
 */
export function FoilChip({ code, size = "md", diff = [], className }: { code: string; size?: FoilChipSize; diff?: number[]; className?: string }) {
  const chars = Array.from(code);
  const spelled = chars.join(" ");
  const diffText = diff.length ? `, character ${diff.map((i) => i + 1).join(" and ")} differs` : "";
  return (
    <span
      role="img"
      aria-label={`Batch ${spelled}${diffText}`}
      className={cn(
        "inline-flex items-center rounded-sm font-foil tracking-[.06em] text-ink",
        "bg-[linear-gradient(180deg,#F1F2F1_0%,#DDE0DE_46%,#C9CDCB_54%,#E6E8E7_100%)]",
        "shadow-[inset_0_1px_0_rgb(255_255_255/.7),inset_0_0_0_1px_rgb(11_27_51/.14)]",
        sizes[size], className,
      )}
    >
      {chars.map((c, i) => (
        <span key={i} aria-hidden className={cn(diff.includes(i) && "shadow-[0_3px_0_var(--color-cobalt)]")}>{c}</span>
      ))}
    </span>
  );
}
