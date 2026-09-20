import * as React from "react";
import { cn } from "../ui";

/**
 * Brand marks, from v3/brand/*.svg (paths copied verbatim; the c2pa metadata is dropped).
 * - Mark: mark.svg / mark-onblue.svg. An ink card (white on cobalt) with 2 × 2 pockets punched
 *   through; the bottom-right pocket is filled danger (the logo pocket is on red's allowed list).
 * - Lockup: mark + live "RecallIndia" text in Funnel Display 800, sized per the nav specs.
 *   Live text keeps it crisp, selectable and matches the mockups (which use live text).
 * - LockupOutlined: lockup.svg / lockup-onblue.svg with the wordmark outlined to paths, for places
 *   that cannot wait for the font (OG image, video title cards, a pre-font splash).
 */
const CARD =
  "M8 0h20a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8zM10.5 5.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM25.5 5.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM10.5 20.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM25.5 20.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10z";

/** The "RecallIndia" wordmark outlined from Funnel Display 800 (lockup.svg, font size 100 units, baseline 0). */
const WORDMARK = "M22.33 0L6.67 0L6.67-67.50L42.50-67.50Q53.42-67.50 59.63-62.58Q65.83-57.67 65.83-49.17Q65.83-43.50 63.13-39.63Q60.42-35.75 55.75-34.33L55.75-34Q60.58-34 63.21-31.38Q65.83-28.75 65.83-23.50L65.83 0L50.17 0L50.17-25L22.33-25L22.33 0M22.33-53.83L22.33-38.67L41.50-38.67Q45.83-38.67 48.17-40.67Q50.50-42.67 50.50-46.25Q50.50-49.92 48.17-51.88Q45.83-53.83 41.50-53.83M98 1Q89.75 1 83.67-2.21Q77.58-5.42 74.29-11.29Q71-17.17 71-25.17Q71-33.17 74.21-38.96Q77.42-44.75 83.38-47.88Q89.33-51 97.42-51Q105.42-51 111.17-47.96Q116.92-44.92 119.96-39.25Q123-33.58 123-25.67L123-20.75L85.75-20.75Q86.67-15.92 89.75-13.46Q92.83-11 97.92-11Q102-11 104.29-12.29Q106.58-13.58 107.58-16.42L122.92-16.42Q121.33-8.25 114.75-3.63Q108.17 1 98 1M86-30.75L108.33-30.75Q107.58-34.92 104.88-36.96Q102.17-39 97.50-39Q92.92-39 90-36.92Q87.08-34.83 86-30.75M151.17 1Q143.33 1 137.37-2.21Q131.42-5.42 128.04-11.25Q124.67-17.08 124.67-25Q124.67-32.92 128-38.75Q131.33-44.58 137.33-47.79Q143.33-51 151.17-51Q161.33-51 167.88-45.83Q174.42-40.67 175.92-31.83L160.58-31.83Q159.58-34.58 157.21-36.13Q154.83-37.67 151.17-37.67Q146.25-37.67 143.12-34.38Q140-31.08 140-25Q140-18.92 143.17-15.63Q146.33-12.33 151.17-12.33Q159.08-12.33 160.83-18.92L176.17-18.92Q174.83-9.67 168.33-4.33Q161.83 1 151.17 1M195.25 0.92Q186.25 0.92 181.21-3.38Q176.17-7.67 176.17-14.83Q176.17-22.25 181.46-26.29Q186.75-30.33 196.58-30.33L210-30.33L210-32.17Q210-39 201.33-39Q193.67-39 192-33.83L176.83-33.83Q178.58-42.33 184.75-46.67Q190.92-51 201.25-51Q212.67-51 218.67-45.96Q224.67-40.92 224.67-31.25L224.67-15L231.83-15L231.83 0L216.50 0L216.50-8.33L213-8.33Q210.42-3.83 206.17-1.46Q201.92 0.92 195.25 0.92M197.58-10.58Q201.25-10.58 204.04-11.83Q206.83-13.08 208.42-15.25Q210-17.42 210-20.08L210-20.33L197.25-20.33Q190.83-20.33 190.83-15.58Q190.83-13.17 192.62-11.88Q194.42-10.58 197.58-10.58M251.92 0L236.58 0L236.58-70L251.92-70M274.75 0L259.42 0L259.42-70L274.75-70M299.83 0L284.17 0L284.17-67.50L299.83-67.50M328.50 0L313.17 0L313.17-35L305.67-35L305.67-50L321-50L321-41.67L324.50-41.67Q327.50-46 331.88-48.46Q336.25-50.92 343.08-50.92Q353.75-50.92 359.46-45.17Q365.17-39.42 365.17-29.75L365.17 0L349.83 0L349.83-26.75Q349.83-31.92 347.13-34.58Q344.42-37.25 339.17-37.25Q333.92-37.25 331.21-34.58Q328.50-31.92 328.50-26.75M393.25 1Q385.42 1 380.04-2.29Q374.67-5.58 371.92-11.46Q369.17-17.33 369.17-25Q369.17-32.75 371.83-38.63Q374.50-44.50 379.63-47.75Q384.75-51 391.92-51Q397.25-51 401.08-49.04Q404.92-47.08 407-43.58L407.33-43.58L407.33-70L422.67-70L422.67-15L430.17-15L430.17 0L414.83 0L414.83-8.33L411.33-8.33Q408.67-3.92 404.13-1.46Q399.58 1 393.25 1M396.17-12.33Q401.33-12.33 404.33-15.21Q407.33-18.08 407.33-23.17L407.33-26.83Q407.33-31.92 404.33-34.79Q401.33-37.67 396.17-37.67Q390.25-37.67 387.38-34.25Q384.50-30.83 384.50-25Q384.50-19.17 387.38-15.75Q390.25-12.33 396.17-12.33M449.42 0L434.08 0L434.08-50L449.42-50L449.42 0M441.75-54.25Q438.33-54.25 435.92-56.67Q433.50-59.08 433.50-62.50Q433.50-65.92 435.92-68.33Q438.33-70.75 441.75-70.75Q445.17-70.75 447.58-68.33Q450-65.92 450-62.50Q450-59.08 447.58-56.67Q445.17-54.25 441.75-54.25M473.42 0.92Q464.42 0.92 459.37-3.38Q454.33-7.67 454.33-14.83Q454.33-22.25 459.62-26.29Q464.92-30.33 474.75-30.33L488.17-30.33L488.17-32.17Q488.17-39 479.50-39Q471.83-39 470.17-33.83L455-33.83Q456.75-42.33 462.92-46.67Q469.08-51 479.42-51Q490.83-51 496.83-45.96Q502.83-40.92 502.83-31.25L502.83-15L510-15L510 0L494.67 0L494.67-8.33L491.17-8.33Q488.58-3.83 484.33-1.46Q480.08 0.92 473.42 0.92M475.75-10.58Q479.42-10.58 482.21-11.83Q485-13.08 486.58-15.25Q488.17-17.42 488.17-20.08L488.17-20.33L475.42-20.33Q469-20.33 469-15.58Q469-13.17 470.79-11.88Q472.58-10.58 475.75-10.58";

export type BrandTone = "ink" | "onBlue";

export function Mark({ size = 30, tone = "ink", title, className }: { size?: number; tone?: BrandTone; title?: string; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 36 36" className={cn("shrink-0", className)}
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false"
    >
      <path fillRule="evenodd" d={CARD} className={tone === "onBlue" ? "fill-white" : "fill-ink"} />
      <circle cx="25.5" cy="25.5" r="5" className="fill-danger" />
    </svg>
  );
}

/** Lockup sizes used across the product: [mark px, wordmark px, gap px]. */
const LOCKUP_SIZES = {
  nav: [30, 21, 10], // desktop top nav (spec §2)
  bar: [26, 19, 8], // mobile top bar (spec §3)
  landing: [30, 22, 10], // landing nav and the cobalt kit tile
  footer: [24, 18, 8], // kit footer
} as const;
export type LockupSize = keyof typeof LOCKUP_SIZES;

/** Mark + wordmark. Decorative inside a link that carries the name; pass `labelled` when standalone. */
export function Lockup({ size = "nav", tone = "ink", labelled = false, className }: { size?: LockupSize; tone?: BrandTone; labelled?: boolean; className?: string }) {
  const [mark, font, gap] = LOCKUP_SIZES[size];
  return (
    <span
      className={cn("inline-flex items-center font-display font-extrabold leading-none tracking-[-0.03em]", tone === "onBlue" ? "text-white" : "text-ink", className)}
      style={{ gap, fontSize: font }}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? "RecallIndia" : undefined}
    >
      <Mark size={mark} tone={tone} />
      <span aria-hidden={labelled || undefined}>RecallIndia</span>
    </span>
  );
}

/** The outlined lockup (brand/lockup.svg). `height` is the mark height; width follows (702.14 : 142.86). */
export function LockupOutlined({ height = 30, tone = "ink", className }: { height?: number; tone?: BrandTone; className?: string }) {
  const fill = tone === "onBlue" ? "fill-white" : "fill-ink";
  return (
    <svg
      viewBox="0 -105.18 702.14 142.86" height={height} width={(height * 702.14) / 142.86}
      role="img" aria-label="RecallIndia" className={cn("shrink-0", className)} focusable="false"
    >
      <g transform="translate(0 -105.179) scale(3.96825)">
        <path fillRule="evenodd" d={CARD} className={fill} />
        <circle cx="25.5" cy="25.5" r="5" className="fill-danger" />
      </g>
      <path transform="translate(190.476 0)" d={WORDMARK} className={fill} />
    </svg>
  );
}
