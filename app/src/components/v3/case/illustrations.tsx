import * as React from "react";
import type { ItemKind } from "./types";

/**
 * Flat two-tone thing illustrations (64×64), the same drawings as My things (`il-strip`, `il-suv`).
 * When the My things build exports its illustration set, swap `ThingIllustration` for it.
 */
const CAT = {
  medicine: { c: "var(--cat-medicine)", t: "var(--cat-medicine-tint)" },
  vehicle: { c: "var(--cat-vehicle)", t: "var(--cat-vehicle-tint)" },
  appliance: { c: "var(--cat-appliance)", t: "var(--cat-appliance-tint)" },
  other: { c: "var(--cat-other)", t: "var(--cat-other-tint)" },
} as const;

/** `alert` fills the bottom-right pocket red (the one red pill). */
export function StripIllustration({ alert = true, className }: { alert?: boolean; className?: string }) {
  const { c, t } = CAT.medicine;
  const px = alert ? "var(--danger)" : "#fff";
  const pxs = alert ? "var(--danger)" : c;
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <g transform="rotate(-14 32 32)">
        <rect x="5" y="15" width="54" height="34" rx="5.5" fill={t} />
        <rect x="5" y="15" width="54" height="34" rx="5.5" fill="none" stroke={c} strokeWidth="2.4" />
        <path d="M42.5 17.5v29" stroke={c} strokeWidth="1.6" strokeDasharray="2.2 2.4" />
        <g stroke={c} strokeWidth="2">
          <circle cx="13.5" cy="25.5" r="4.7" fill="#fff" /><circle cx="23.8" cy="25.5" r="4.7" fill="#fff" />
          <circle cx="34" cy="25.5" r="4.7" fill="#fff" /><circle cx="51" cy="25.5" r="4.7" fill="#fff" />
          <circle cx="13.5" cy="38.5" r="4.7" fill="#fff" /><circle cx="23.8" cy="38.5" r="4.7" fill="#fff" />
          <circle cx="34" cy="38.5" r="4.7" fill="#fff" /><circle cx="51" cy="38.5" r="4.7" fill={px} stroke={pxs} />
        </g>
      </g>
    </svg>
  );
}

export function SuvIllustration({ className }: { className?: string }) {
  const { c, t } = CAT.vehicle;
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <path d="M4 51.5h56" stroke={t} strokeWidth="3" strokeLinecap="round" />
      <path d="M5 44v-8.2c0-1.6 1-3 2.5-3.5L13 30.4l5.4-9.3c.7-1.2 1.9-1.9 3.3-1.9h23.4c1.3 0 2.5.6 3.2 1.7l5.9 9.3 3.4 1.3c1.4.6 2.4 1.9 2.4 3.4V44c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2z" fill={c} />
      <path d="M17 30.4l4.2-7.2c.3-.5.8-.8 1.3-.8H31v8z" fill={t} />
      <path d="M34 22.4h10.2c.5 0 1 .3 1.3.7l4.6 7.3H34z" fill={t} />
      <path d="M21 16.5h24" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M32.5 32v10" stroke={t} strokeWidth="1.6" strokeLinecap="round" />
      <rect x="54" y="34" width="5" height="3.2" rx="1.6" fill="#fff" />
      <rect x="5" y="34" width="2.6" height="3.4" rx="1" fill={t} />
      <circle cx="17.5" cy="45" r="7.2" fill={c} stroke="#fff" strokeWidth="2.6" /><circle cx="17.5" cy="45" r="2.8" fill={t} />
      <circle cx="46.5" cy="45" r="7.2" fill={c} stroke="#fff" strokeWidth="2.6" /><circle cx="46.5" cy="45" r="2.8" fill={t} />
    </svg>
  );
}

/** Generic box for appliances and other things until the shared set is wired. */
function BoxIllustration({ kind, className }: { kind: "appliance" | "other"; className?: string }) {
  const { c, t } = CAT[kind];
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <rect x="12" y="10" width="40" height="44" rx="6" fill={t} stroke={c} strokeWidth="2.4" />
      <path d="M12 24h40" stroke={c} strokeWidth="2" />
      <circle cx="20" cy="17" r="2.4" fill={c} /><circle cx="28" cy="17" r="2.4" fill={c} />
      <circle cx="32" cy="39" r="9" fill="#fff" stroke={c} strokeWidth="2.2" />
    </svg>
  );
}

export function ThingIllustration({ kind, className }: { kind: ItemKind; className?: string }) {
  if (kind === "medicine") return <StripIllustration className={className} />;
  if (kind === "vehicle") return <SuvIllustration className={className} />;
  return <BoxIllustration kind={kind} className={className} />;
}

/** Brand mark (brand/mark.svg): ink card, 2×2 pockets punched through, bottom-right pocket red. */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} aria-hidden className={className}>
      <path
        fill="var(--ink)" fillRule="evenodd"
        d="M8 0h20a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8zM10.5 5.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM25.5 5.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM10.5 20.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM25.5 20.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10z"
      />
      <circle fill="var(--danger)" cx="25.5" cy="25.5" r="5" />
    </svg>
  );
}
