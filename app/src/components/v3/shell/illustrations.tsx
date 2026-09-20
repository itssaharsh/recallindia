import * as React from "react";
import { cn } from "../ui";
import type { Category } from "./types";

/**
 * One two-tone illustration per category (64 box; `--c` mark colour, `--t` tint, white), copied
 * from the kit mockup's symbol set. The shell needs them for palette result tiles and the kit's
 * category swatches. The full per-thing set (stove, iron, geyser, cooker, earbuds…) belongs to
 * the /mine part; swap these in when it lands.
 */
const catVars: Record<Category, React.CSSProperties> = {
  medicine: { ["--c" as string]: "var(--cat-medicine)", ["--t" as string]: "var(--cat-medicine-tint)" },
  vehicle: { ["--c" as string]: "var(--cat-vehicle)", ["--t" as string]: "var(--cat-vehicle-tint)" },
  appliance: { ["--c" as string]: "var(--cat-appliance)", ["--t" as string]: "var(--cat-appliance-tint)" },
  other: { ["--c" as string]: "var(--cat-other)", ["--t" as string]: "var(--cat-other-tint)" },
};

const tileBg: Record<Category, string> = {
  medicine: "bg-cat-medicine-soft",
  vehicle: "bg-cat-vehicle-soft",
  appliance: "bg-cat-appliance-soft",
  other: "bg-cat-other-soft",
};

/** Blister strip, round tablets. `alert` colours the bottom-right pocket danger. */
function Strip({ alert }: { alert?: boolean }) {
  const px = alert ? "var(--danger)" : "#fff";
  const pxs = alert ? "var(--danger)" : "var(--c)";
  return (
    <g transform="rotate(-14 32 32)">
      <rect x="5" y="15" width="54" height="34" rx="5.5" fill="var(--t)" />
      <rect x="5" y="15" width="54" height="34" rx="5.5" fill="none" stroke="var(--c)" strokeWidth="2.4" />
      <path d="M42.5 17.5v29" stroke="var(--c)" strokeWidth="1.6" strokeDasharray="2.2 2.4" />
      <g stroke="var(--c)" strokeWidth="2">
        <circle cx="13.5" cy="25.5" r="4.7" fill="#fff" /><circle cx="23.8" cy="25.5" r="4.7" fill="#fff" />
        <circle cx="34" cy="25.5" r="4.7" fill="#fff" /><circle cx="51" cy="25.5" r="4.7" fill="#fff" />
        <circle cx="13.5" cy="38.5" r="4.7" fill="#fff" /><circle cx="23.8" cy="38.5" r="4.7" fill="#fff" />
        <circle cx="34" cy="38.5" r="4.7" fill="#fff" /><circle cx="51" cy="38.5" r="4.7" fill={px} stroke={pxs} />
      </g>
    </g>
  );
}

/** SUV (Jeep Compass). */
function Suv() {
  return (
    <>
      <path d="M4 51.5h56" stroke="var(--t)" strokeWidth="3" strokeLinecap="round" />
      <path d="M5 44v-8.2c0-1.6 1-3 2.5-3.5L13 30.4l5.4-9.3c.7-1.2 1.9-1.9 3.3-1.9h23.4c1.3 0 2.5.6 3.2 1.7l5.9 9.3 3.4 1.3c1.4.6 2.4 1.9 2.4 3.4V44c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2z" fill="var(--c)" />
      <path d="M17 30.4l4.2-7.2c.3-.5.8-.8 1.3-.8H31v8z" fill="var(--t)" />
      <path d="M34 22.4h10.2c.5 0 1 .3 1.3.7l4.6 7.3H34z" fill="var(--t)" />
      <path d="M21 16.5h24" stroke="var(--c)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M32.5 32v10" stroke="var(--t)" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="54" y="34" width="5" height="3.2" rx="1.6" fill="#fff" />
      <rect x="5" y="34" width="2.6" height="3.4" rx="1" fill="var(--t)" />
      <circle cx="17.5" cy="45" r="7.2" fill="var(--c)" stroke="#fff" strokeWidth="2.6" /><circle cx="17.5" cy="45" r="2.8" fill="var(--t)" />
      <circle cx="46.5" cy="45" r="7.2" fill="var(--c)" stroke="#fff" strokeWidth="2.6" /><circle cx="46.5" cy="45" r="2.8" fill="var(--t)" />
    </>
  );
}

/** Ceiling fan (Havells Efficiencia Neo). */
function Fan() {
  return (
    <>
      <rect x="25" y="6" width="14" height="4.5" rx="2.2" fill="var(--c)" />
      <rect x="30.5" y="10" width="3" height="11" fill="var(--c)" />
      <path d="M24.5 27.5 4 31.6c-1.2.3-1.2 1.9 0 2.1L25 32z" fill="var(--t)" stroke="var(--c)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M39.5 27.5 60 31.6c1.2.3 1.2 1.9 0 2.1L39 32z" fill="var(--t)" stroke="var(--c)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M29 31.5 25.6 46c-.3 1.3 1 2.1 2 1.3L36 31.5z" fill="var(--t)" stroke="var(--c)" strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="32" cy="27" rx="10.5" ry="6" fill="var(--c)" />
      <path d="M22.5 26.5h19" stroke="var(--t)" strokeWidth="1.6" />
      <path d="M27.5 32.4h9l-1.6 3.4h-5.8z" fill="var(--c)" />
    </>
  );
}

/** Flip-lid flask (Milton Thermosteel). */
function Flask() {
  return (
    <>
      <rect x="21" y="18" width="22" height="40" rx="6" fill="var(--c)" />
      <rect x="21" y="47" width="22" height="3.2" fill="var(--t)" />
      <rect x="25.5" y="24" width="3.6" height="19" rx="1.8" fill="#fff" opacity=".85" />
      <rect x="19.5" y="8.5" width="25" height="11" rx="4" fill="var(--t)" stroke="var(--c)" strokeWidth="2.4" />
      <path d="M44.5 11.5h2.8c1.2 0 2.2 1 2.2 2.2V17" fill="none" stroke="var(--c)" strokeWidth="2.4" strokeLinecap="round" />
    </>
  );
}

export function CategoryIllustration({ category, alert = false, className }: { category: Category; alert?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden focusable="false" className={className} style={catVars[category]}>
      {category === "medicine" && <Strip alert={alert} />}
      {category === "vehicle" && <Suv />}
      {category === "appliance" && <Fan />}
      {category === "other" && <Flask />}
    </svg>
  );
}

/**
 * Category tile (spec §6.9): `cat-*-soft` square holding the illustration at 78 %.
 * Sizes: 88 (cards), 72 (phone cards), 44 (rows), 36 (palette), or "fill" (kit swatches, 100 % × parent).
 * Alert swaps the tile to danger-soft and colours the strip's last pocket danger.
 */
export function CategoryTile({
  category, size = 88, alert = false, className, illustrationClassName,
}: { category: Category; size?: 36 | 44 | 72 | 88 | "fill"; alert?: boolean; className?: string; illustrationClassName?: string }) {
  const fill = size === "fill";
  const radius = fill || size < 88 ? (size === 36 ? "rounded-[10px]" : "rounded-[12px]") : "rounded-md";
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center", radius, alert ? "bg-danger-soft" : tileBg[category], fill && "size-full", className)}
      style={fill ? undefined : { width: size, height: size }}
    >
      <CategoryIllustration category={category} alert={alert} className={illustrationClassName ?? (size === 36 ? "size-5" : "size-[78%]")} />
    </span>
  );
}

/** 10 px category square (radius 3). Squares mean category; circles mean status. */
export function CategoryMark({ category, className }: { category: Category; className?: string }) {
  const bg = { medicine: "bg-cat-medicine", vehicle: "bg-cat-vehicle", appliance: "bg-cat-appliance", other: "bg-cat-other" }[category];
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-[3px]", bg, className)} />;
}
