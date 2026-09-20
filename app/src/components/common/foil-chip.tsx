"use client";

/**
 * C-11, the signature visual: a batch, lot or serial code set in Doto dot-matrix on brushed
 * foil — the way it is printed on the back of a medicine strip. Doto is only ever used here,
 * and never for words.
 *
 * `diff` underlines the characters that differ from another code (the near-miss comparison on
 * /mine stacks Yours over Listed so the differing column lines up).
 */
export function FoilChip({
  code,
  size = "md",
  diff,
  className,
}: {
  code: string;
  size?: "md" | "lg";
  /** indexes of the characters that differ from the code this one is compared with */
  diff?: number[];
  className?: string;
}) {
  const chars = [...(code ?? "")];
  const marks = new Set(diff ?? []);
  const box = size === "lg" ? "h-12 px-3.5 text-[36px]" : "h-8 px-2.5 text-[22px]";
  return (
    <span
      className={`foil-chip inline-flex w-fit shrink-0 items-center self-start rounded-sm leading-none whitespace-nowrap ${box} ${className ?? ""}`}
      aria-label={`Batch ${chars.join(" ")}`}
    >
      {chars.map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className="inline-block"
          style={marks.has(i) ? { boxShadow: "0 3px 0 var(--primary)" } : undefined}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

/** The indexes where two codes differ, compared left to right (C-11 diff). */
export function diffIndexes(a: string, b: string): number[] {
  const out: number[] = [];
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) out.push(i);
  return out;
}
