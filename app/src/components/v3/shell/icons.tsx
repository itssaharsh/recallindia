import * as React from "react";

/**
 * Product glyphs drawn for this brand (24 box, currentColor), copied from the kit mockup's
 * <symbol>s so the nav and tab bar match the PNGs exactly. Generic icons (x, chevrons, arrows,
 * plus, lock, check) come from lucide-react instead.
 */
type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" {...rest}>
      {children}
    </svg>
  );
}

/** Household (u-house): household pill, banner. */
export function IconHouse(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    </Svg>
  );
}

/** Feed tab: three lines. */
export function IconFeed(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 6h14M5 12h14M5 18h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

/** Ingest tab: a page with lines. */
export function IconIngest(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </Svg>
  );
}

/** My things tab: 2 × 2 pockets, one filled (echoes the mark). */
export function IconThings(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="7.5" cy="7.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="16.5" cy="7.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="7.5" cy="16.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="16.5" cy="16.5" r="3" fill="currentColor" />
    </Svg>
  );
}

/** API tab: braces. */
export function IconApi(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 4.5C6.5 4.5 7 7 7 9s-2 3-2 3 2 1 2 3-.5 4.5 2 4.5M15 4.5c2.5 0 2 2.5 2 4.5s2 3 2 3-2 1-2 3 .5 4.5-2 4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </Svg>
  );
}

/** Search (u-search). */
export function IconSearch(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

/** Filled warning triangle with a white mark (alert chips and bands). */
export function IconAlert(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5 22 20H2z" fill="currentColor" />
      <path d="M12 10v4.5" stroke="var(--surface-1)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1.2" fill="var(--surface-1)" />
    </Svg>
  );
}

/** Heavy check (u-check): "No match" lines. */
export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Half disc (k-near): near-miss chip. */
export function IconNear(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" />
    </Svg>
  );
}

/** Ring spinner (k-spin). Spins with `animate-spin`; the global reduced-motion rule stops it. */
export function IconSpinner({ className, ...p }: IconProps) {
  return (
    <Svg className={["animate-spin", className].filter(Boolean).join(" ")} {...p}>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2.6" />
      <path d="M12 4a8 8 0 0 1 8 8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </Svg>
  );
}

/** Ring check (k-verified): VERIFIED chip, success toast. 30 box. */
export function IconRingCheck({ size = 30, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden focusable="false" {...p}>
      <circle cx="15" cy="15" r="13" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M9.5 15.3l3.8 3.8 7.4-8" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Ring plus: neutral toast ("Your household is ready"). 30 box. */
export function IconRingPlus({ size = 30, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden focusable="false" {...p}>
      <circle cx="15" cy="15" r="13" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M10 15.5h10M15 10.5v10" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** Progress ring for the copying household pill (18 px, track cobalt 22 %). `value` 0..1. */
export function ProgressRing({ value, size = 18 }: { value: number; size?: number }) {
  const r = 7.5;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden focusable="false" className="shrink-0">
      <circle cx="10" cy="10" r={r} fill="none" stroke="rgb(10 88 194 / 0.22)" strokeWidth="2.6" />
      <circle
        cx="10" cy="10" r={r} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"
        strokeDasharray={`${(v * c).toFixed(2)} ${c.toFixed(2)}`} transform="rotate(-90 10 10)"
        style={{ transition: "stroke-dasharray 250ms var(--ease-out)" }}
      />
    </svg>
  );
}

/** Phone status-bar signal (kit phone frames only). */
export function IconSignal(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="14" width="3.4" height="6" rx="1" fill="currentColor" />
      <rect x="8.2" y="10.5" width="3.4" height="9.5" rx="1" fill="currentColor" />
      <rect x="13.4" y="7" width="3.4" height="13" rx="1" fill="currentColor" />
      <rect x="18.6" y="3.5" width="3.4" height="16.5" rx="1" fill="currentColor" opacity=".35" />
    </Svg>
  );
}
