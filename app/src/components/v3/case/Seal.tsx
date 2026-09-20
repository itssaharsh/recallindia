import * as React from "react";
import { cn } from "../ui";

/**
 * C7 · Seal. The same 200×200 drawing as the landing (`#seal` in landing.html): white disc r96,
 * outer ring r92 (5 px), inner ring r58 (2.5 px), arc text on r74 (Onest 700 14.5, tracking 3.2,
 * textLength 458), centre disc r54 with a white glyph and word.
 *
 * Split in two layers so the verify beat (B5) can flip the centre alone:
 *   <SealBase>   disc, rings, arc text
 *   <SealCentre> centre disc, glyph, word
 * <Seal> stacks both. The "slot" variant is HTML (see EvidenceBand), not this drawing.
 */
export type SealVariant = "sealed" | "verified" | "invalid";

export const SEAL_COLOR: Record<SealVariant, string> = {
  sealed: "var(--cobalt)",
  verified: "var(--success)",
  invalid: "var(--danger)",
};

const WORD: Record<SealVariant, string> = { sealed: "SEALED", verified: "VERIFIED", invalid: "INVALID" };

export function sealArcText(variant: SealVariant, flippedByte?: number | null): string {
  if (variant === "sealed") return "EVIDENCE SEALED · S3 OBJECT LOCK · RECALLINDIA · ";
  if (variant === "verified") return "EVIDENCE SEALED · KMS SIGNED · RECALLINDIA · ";
  return `SIGNATURE MISMATCH · BYTE ${flippedByte ?? "?"} CHANGED · `;
}

export const SEAL_LABEL: Record<SealVariant, string> = { sealed: "Seal: sealed", verified: "Seal: verified", invalid: "Seal: invalid" };

const ARC = "M100 100 m-74 0 a74 74 0 1 1 148 0 a74 74 0 1 1 -148 0";
const font: React.CSSProperties = { fontFamily: "var(--font-sans)", fontWeight: 700 };

function useArcId(): string {
  return "seal-arc-" + React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

export function SealBase({ variant, flippedByte, className }: { variant: SealVariant; flippedByte?: number | null; className?: string }) {
  const id = useArcId();
  const c = SEAL_COLOR[variant];
  return (
    <svg viewBox="0 0 200 200" aria-hidden className={cn("block size-full", className)}>
      <path id={id} d={ARC} fill="none" />
      <circle cx="100" cy="100" r="96" fill="#fff" />
      <circle cx="100" cy="100" r="92" fill="none" stroke={c} strokeWidth="5" />
      <circle cx="100" cy="100" r="58" fill="none" stroke={c} strokeWidth="2.5" />
      <text fontSize="14.5" letterSpacing="3.2" fill={c} style={font}>
        <textPath href={`#${id}`} startOffset="0" textLength="458" lengthAdjust="spacing">
          {sealArcText(variant, flippedByte)}
        </textPath>
      </text>
    </svg>
  );
}

/** `glyph` lets the flip swap in a drawing path (motion.path) for the check. */
export function SealCentre({ variant, glyph, className }: { variant: SealVariant; glyph?: React.ReactNode; className?: string }) {
  const c = SEAL_COLOR[variant];
  return (
    <svg viewBox="0 0 200 200" aria-hidden className={cn("block size-full", className)}>
      <circle cx="100" cy="100" r="54" fill={c} />
      {glyph ?? <SealGlyph variant={variant} />}
      <text x="100" y="134" textAnchor="middle" fontSize="13" letterSpacing="1.6" fill="#fff" style={font}>
        {WORD[variant]}
      </text>
    </svg>
  );
}

export const CHECK_PATH = "M78 94l14 14 28-30";

export function SealGlyph({ variant }: { variant: SealVariant }) {
  if (variant === "verified") {
    return <path d={CHECK_PATH} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (variant === "invalid") {
    return <path d="M85 79l30 30M115 79l-30 30" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" />;
  }
  // sealed: white lock (9 px stroke shackle over a solid body)
  return (
    <g>
      <path d="M88 90v-6a12 12 0 0 1 24 0v6" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      <rect x="78" y="88" width="44" height="26" rx="6" fill="#fff" />
    </g>
  );
}

/** Static seal (both layers). `size` in px; resting rotate(-8deg) + drop shadow unless `flat`. */
export function Seal({
  variant, size = 176, flippedByte, mini = false, flat = false, className, label = true,
}: {
  variant: SealVariant; size?: number; flippedByte?: number | null; mini?: boolean; flat?: boolean; className?: string; label?: boolean;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label ? SEAL_LABEL[variant] : undefined}
      aria-hidden={label ? undefined : true}
      className={cn("relative inline-block shrink-0", className)}
      style={{
        width: size, height: size,
        transform: flat ? undefined : "rotate(-8deg)",
        filter: flat ? undefined : mini ? "drop-shadow(0 6px 10px rgb(0 18 64 / .35))" : "drop-shadow(0 12px 20px rgb(0 18 64 / .4))",
      }}
    >
      <SealBase variant={variant} flippedByte={flippedByte} className="absolute inset-0" />
      <SealCentre variant={variant} className="absolute inset-0" />
    </span>
  );
}
