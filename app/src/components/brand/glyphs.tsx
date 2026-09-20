/**
 * The two glyphs the product needs that Lucide does not have (UI-SPEC §9): a notice row sliding
 * out of a page, and a blister strip. Same grid, stroke and caps as Lucide, so they sit in a row
 * of icons without looking borrowed.
 */
const BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  focusable: "false" as const,
  "aria-hidden": true,
};

export function GNotice({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <path d="M16 6.5V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1.5" />
      <rect x="9" y="10.5" width="13" height="3" rx="1" />
      <path d="M8 7h4" />
    </svg>
  );
}

export function GStrip({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...BASE} width={size} height={size} className={className}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="16" cy="12" r="2" />
    </svg>
  );
}
