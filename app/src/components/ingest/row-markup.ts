// One definition of the feed-row look used twice: by the React rows that land in the column and
// by the flight elements the dissolve builds imperatively. Same classes, so a landing is seamless.

import type { RowNotice } from "@/lib/ingest";

export const ROW_GRID =
  "grid h-10 w-full grid-cols-[4rem_minmax(0,1fr)_6.5rem] items-center gap-3 px-4 text-left text-[13px] 2xl:grid-cols-[4rem_minmax(0,1.3fr)_6.5rem_minmax(0,1fr)]";
export const ROW_CHIP =
  "inline-flex h-5 w-fit items-center rounded-xs bg-cat-medicine-soft px-1.5 text-[10.5px] font-bold tracking-wider text-cobalt uppercase";
export const ROW_CELLS = [
  "truncate text-ink",
  "w-fit max-w-full truncate rounded-xs bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] text-ink",
  "hidden truncate text-ink-muted 2xl:block",
] as const;

/** product · batch (+N more) · failed test */
export function rowTexts(n: RowNotice): [string, string, string] {
  const batch = n.batch ? (n.batches > 1 ? `${n.batch} +${n.batches - 1}` : n.batch) : "—";
  return [n.product || "—", batch, n.test || "—"];
}

/** The feed-row grid (chip · product · batch · failed test) as DOM, for flights and landed rows. */
function rowGrid(n: RowNotice): HTMLDivElement {
  const row = document.createElement("div");
  row.className = ROW_GRID;
  const chip = document.createElement("span");
  chip.className = ROW_CHIP;
  chip.textContent = "CDSCO";
  row.append(chip);
  rowTexts(n).forEach((text, i) => {
    const cell = document.createElement("span");
    cell.className = ROW_CELLS[i];
    cell.textContent = text;
    row.append(cell);
  });
  row.title = `${n.product} · ${n.maker}`;
  return row;
}

/** A landed row, exactly as the React list renders it (LandedRow in dissolve-column.tsx). */
export function buildLandedRow(n: RowNotice, fade: boolean): HTMLLIElement {
  const li = document.createElement("li");
  li.className = `border-b border-line bg-surface-1 contain-content${fade ? " ingest-fade-in" : ""}`;
  li.append(rowGrid(n));
  return li;
}

/**
 * The flight element: the row's own pixels (a crop of the page image, the paper layer) over a
 * feed-row layer; the paper fades off the row. `n` null = a continuation line (no row layer).
 */
export function buildFlight(
  n: RowNotice | null,
  pixels: Partial<CSSStyleDeclaration> | null,
): { el: HTMLDivElement; paper: HTMLDivElement } {
  const el = document.createElement("div");
  // a continuation line has no row of its own to become: no row surface, only its pixels
  el.className = n ? "fixed overflow-hidden border-b border-line bg-surface-1" : "fixed overflow-hidden";
  el.style.transformOrigin = "0 0";
  el.style.willChange = "transform";
  el.style.contain = "strict"; // sized explicitly: nothing inside can reach layout outside
  if (n) el.append(rowGrid(n));
  const paper = document.createElement("div");
  paper.className = "absolute inset-0 border border-success bg-surface-1";
  if (pixels) Object.assign(paper.style, pixels);
  el.append(paper);
  return { el, paper };
}
