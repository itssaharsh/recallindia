import * as React from "react";

/**
 * Two-tone object illustrations (64 box) from the /mine set plus the ones this part adds
 * (spec §0.2). Colours come from the nearest [data-source] ramp: --src-c (mark) and --src-t (tint).
 * The strip's last pocket reads --il-pocket, which [data-tone="alert"] turns red.
 */
export type IllustrationName =
  | "strip" | "vial" | "bottle" | "tube" | "doc"
  | "sauna" | "board" | "grill" | "stove" | "mattress" | "helmet" | "suv";

const C = "var(--src-c, var(--cobalt))";
const T = "var(--src-t, var(--cat-medicine-tint))";
const W = "#fff";

const art: Record<IllustrationName, React.ReactNode> = {
  strip: (
    <g transform="rotate(-14 32 32)">
      <rect x="5" y="15" width="54" height="34" rx="5.5" fill={T} />
      <rect x="5" y="15" width="54" height="34" rx="5.5" fill="none" stroke={C} strokeWidth="2.4" />
      <path d="M42.5 17.5v29" stroke={C} strokeWidth="1.6" strokeDasharray="2.2 2.4" />
      <g stroke={C} strokeWidth="2" fill={W}>
        <circle cx="13.5" cy="25.5" r="4.7" /><circle cx="23.8" cy="25.5" r="4.7" /><circle cx="34" cy="25.5" r="4.7" /><circle cx="51" cy="25.5" r="4.7" />
        <circle cx="13.5" cy="38.5" r="4.7" /><circle cx="23.8" cy="38.5" r="4.7" /><circle cx="34" cy="38.5" r="4.7" />
        <circle cx="51" cy="38.5" r="4.7" fill="var(--il-pocket, #fff)" stroke={`var(--il-pocket-stroke, ${C})`} />
      </g>
    </g>
  ),
  vial: (
    <>
      <rect x="21" y="7" width="22" height="8" rx="2.5" fill={C} />
      <path d="M24 15h16v4c3 1.2 5 3.6 5 7v26a5 5 0 0 1-5 5H24a5 5 0 0 1-5-5V26c0-3.4 2-5.8 5-7z" fill={W} stroke={C} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M19.5 38h25v14a5 5 0 0 1-5 5H24.5a5 5 0 0 1-5-5z" fill={T} />
      <rect x="19" y="27" width="26" height="9" fill={C} />
      <path d="M25 31.5h14" stroke={W} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  bottle: (
    <>
      <rect x="16" y="8" width="26" height="9" rx="3" fill={C} />
      <path d="M14 20a3 3 0 0 1 3-3h24a3 3 0 0 1 3 3v33a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" fill={T} stroke={C} strokeWidth="2.4" />
      <rect x="14" y="27" width="30" height="17" fill={W} stroke={C} strokeWidth="2.4" />
      <path d="M19 33h14M19 38h9" stroke={C} strokeWidth="2" strokeLinecap="round" />
      <g transform="rotate(-38 50 44)">
        <rect x="40.5" y="39" width="19" height="10" rx="5" fill={W} stroke={C} strokeWidth="2.2" />
        <path d="M50 39v10" stroke={C} strokeWidth="2" />
        <path d="M50 39.5h4.5a4.5 4.5 0 0 1 0 9H50z" fill={C} />
      </g>
    </>
  ),
  tube: (
    <g transform="rotate(-24 32 32)">
      <path d="M20 10h24l-2 36H22z" fill={T} stroke={C} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M19 8.5h26" stroke={C} strokeWidth="3.2" strokeLinecap="round" />
      <rect x="25" y="46" width="14" height="10" rx="2.5" fill={C} />
      <circle cx="32" cy="25" r="6.5" fill={W} stroke={C} strokeWidth="2" />
      <path d="M32 15.5v2.5M32 32v2.5M22.5 25H25M39 25h2.5" stroke={C} strokeWidth="2" strokeLinecap="round" />
    </g>
  ),
  doc: (
    <>
      <path d="M14 6h26l12 12v38a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" fill={W} stroke={C} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M40 6v12h12" fill={T} stroke={C} strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="18" y="24" width="28" height="6" rx="1" fill={C} />
      <path d="M18 36h28M18 42h28M18 48h20M26 30v20" stroke={C} strokeWidth="1.8" />
    </>
  ),
  sauna: (
    <>
      <path d="M10 22 32 9l22 13v31H10z" fill={C} />
      <path d="M15 26h34M15 32h34M15 38h34M15 44h34" stroke={T} strokeWidth="1.6" opacity=".55" />
      <rect x="24" y="27" width="16" height="26" rx="2" fill={T} />
      <rect x="27" y="30" width="10" height="10" rx="1.5" fill={W} />
      <circle cx="36.5" cy="44" r="1.4" fill={C} />
      <path d="M44 4.5c-2 2 2 3.5 0 5.5M50 6c-2 2 2 3.5 0 5.5" fill="none" stroke={C} strokeWidth="2" strokeLinecap="round" />
      <path d="M6 53h52" stroke={T} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  board: (
    <>
      <rect x="8" y="10" width="48" height="44" rx="7" fill={T} stroke={C} strokeWidth="2.4" />
      <path d="M32 12v40" stroke={C} strokeWidth="1.8" strokeDasharray="2.4 2.2" />
      <g fill={C}><circle cx="18" cy="22" r="4.4" /><circle cx="18" cy="40" r="4.4" /></g>
      <circle cx="45" cy="21" r="5.2" fill={W} stroke={C} strokeWidth="2.2" />
      <path d="M45 21l2.6-2.6" stroke={C} strokeWidth="2" strokeLinecap="round" />
      <rect x="38" y="34" width="13" height="12" rx="3" fill={W} stroke={C} strokeWidth="2.2" />
      <circle cx="44.5" cy="40" r="1.8" fill={C} />
    </>
  ),
  grill: (
    <>
      <path d="M9 30c0-9.4 10.3-16 23-16s23 6.6 23 16z" fill={C} />
      <rect x="25" y="17.5" width="14" height="3.4" rx="1.7" fill={T} />
      <rect x="6" y="30" width="52" height="11" rx="3" fill={T} stroke={C} strokeWidth="2.4" />
      <circle cx="47" cy="35.5" r="2.6" fill={C} />
      <rect x="14" y="34.3" width="18" height="2.4" rx="1.2" fill={C} />
      <path d="M15 41l-4 11M49 41l4 11M22 41l-1.5 11M42 41l1.5 11" stroke={C} strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  stove: (
    <>
      <path d="M12.5 20h39l7.5 20H5z" fill={C} />
      <g fill={T}><ellipse cx="17" cy="32" rx="6.6" ry="3.6" /><ellipse cx="32" cy="26.4" rx="5.6" ry="3" /><ellipse cx="47" cy="32" rx="6.6" ry="3.6" /></g>
      <g fill={C}><ellipse cx="17" cy="32" rx="2.6" ry="1.4" /><ellipse cx="32" cy="26.4" rx="2.2" ry="1.2" /><ellipse cx="47" cy="32" rx="2.6" ry="1.4" /></g>
      <path d="M15 22.5l-2 3" stroke={W} strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
      <rect x="5" y="40" width="54" height="9" rx="2" fill={T} />
      <g fill={C}>
        <circle cx="17" cy="44.5" r="2.7" /><circle cx="32" cy="44.5" r="2.7" /><circle cx="47" cy="44.5" r="2.7" />
        <rect x="9" y="49" width="5" height="3" rx="1" /><rect x="50" y="49" width="5" height="3" rx="1" />
      </g>
    </>
  ),
  mattress: (
    <>
      <path d="M6 30 22 20h36L42 30z" fill={T} stroke={C} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M6 30h36v14H6z" fill={C} />
      <path d="M42 30l16-10v14L42 44z" fill={C} opacity=".78" />
      <path d="M9 37h30" stroke={T} strokeWidth="1.8" strokeDasharray="3 3" />
      <path d="M20 23.5l-6 4M30 23.5l-6 4M40 23.5l-6 4M50 23.5l-6 4" stroke={C} strokeWidth="1.4" opacity=".6" />
      <path d="M8 44v5M40 44v5" stroke={C} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  helmet: (
    <>
      <path d="M7 38C7 23.6 18.6 13 33 13s25 9.5 25 22.5c0 2.2-1.8 4-4 4H11c-2.2 0-4-.9-4-1.5z" fill={C} />
      <path d="M18 22c3-3.6 8-6 14-6M28 17.5l3 9M39 17l-1 9.5M48.5 21l-4.5 7.5" stroke={T} strokeWidth="3" strokeLinecap="round" />
      <path d="M7 38.5h45.5" stroke={T} strokeWidth="2.6" />
      <path d="M14 40l6 13h9l4-13" fill="none" stroke={C} strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="21" y="49" width="7" height="5" rx="1.5" fill={T} stroke={C} strokeWidth="1.8" />
    </>
  ),
  suv: (
    <>
      <path d="M4 51.5h56" stroke={T} strokeWidth="3" strokeLinecap="round" />
      <path d="M5 44v-8.2c0-1.6 1-3 2.5-3.5L13 30.4l5.4-9.3c.7-1.2 1.9-1.9 3.3-1.9h23.4c1.3 0 2.5.6 3.2 1.7l5.9 9.3 3.4 1.3c1.4.6 2.4 1.9 2.4 3.4V44c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2z" fill={C} />
      <path d="M17 30.4l4.2-7.2c.3-.5.8-.8 1.3-.8H31v8z" fill={T} />
      <path d="M34 22.4h10.2c.5 0 1 .3 1.3.7l4.6 7.3H34z" fill={T} />
      <path d="M21 16.5h24" stroke={C} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M32.5 32v10" stroke={T} strokeWidth="1.6" strokeLinecap="round" />
      <rect x="54" y="34" width="5" height="3.2" rx="1.6" fill={W} />
      <rect x="5" y="34" width="2.6" height="3.4" rx="1" fill={T} />
      <circle cx="17.5" cy="45" r="7.2" fill={C} stroke={W} strokeWidth="2.6" /><circle cx="17.5" cy="45" r="2.8" fill={T} />
      <circle cx="46.5" cy="45" r="7.2" fill={C} stroke={W} strokeWidth="2.6" /><circle cx="46.5" cy="45" r="2.8" fill={T} />
    </>
  ),
};

/** Decorative: the product name always sits next to it. */
export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden focusable="false" className={className}>
      {art[name]}
    </svg>
  );
}

/* ---- Two brand glyphs lucide doesn't draw the way the mockups do ---- */

/** Filled alert triangle with a white "!" (u-alert). Colour = currentColor. */
export function AlertGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <path d="M12 3.5 22 20H2z" fill="currentColor" />
      <path d="M12 10v4.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1.2" fill="#fff" />
    </svg>
  );
}

/** Circular arrow with a play triangle inside (u-replay). */
export function ReplayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4.5 4v4.5H9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 9.2v5.6l4.4-2.8z" fill="currentColor" />
    </svg>
  );
}
