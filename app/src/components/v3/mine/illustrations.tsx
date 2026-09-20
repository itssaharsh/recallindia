/**
 * Illustration set (spec/mine.md §2.13): flat two-tone drawings on a 64 × 64 box.
 * `--c` is the mark colour, `--t` the tint; white only for pills, lenses and highlights.
 * The tile sets `--c`/`--t` from the item's category. Every drawing is aria-hidden: the card title names the thing.
 *
 * Ported 1:1 from the <symbol>s in v3/mock/mine.html. If you prefer a sprite (public/illustrations.svg with
 * <use href>), these components are the source for it; the rendered pixels are the same.
 */
import * as React from "react";
import { cn } from "../ui";
import type { ItemKind } from "./types";

export type IllustrationId =
  | "il-strip"
  | "il-strip-cap"
  | "il-suv"
  | "il-hatch"
  | "il-iron"
  | "il-stove"
  | "il-fan"
  | "il-geyser"
  | "il-induction"
  | "il-plug"
  | "il-buds"
  | "il-cooker"
  | "il-flask"
  | "il-parcel";

type SvgProps = React.SVGProps<SVGSVGElement>;

function Svg({ children, className, ...rest }: SvgProps) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden focusable="false" className={className} {...rest}>
      {children}
    </svg>
  );
}

/** Blister strip, round tablets. `--px`/`--pxs` colour the bottom-right pocket (red on a medicine alert). */
export function IlStrip(p: SvgProps) {
  return (
    <Svg {...p}>
      <g transform="rotate(-14 32 32)">
        <rect x="5" y="15" width="54" height="34" rx="5.5" fill="var(--t)" />
        <rect x="5" y="15" width="54" height="34" rx="5.5" fill="none" stroke="var(--c)" strokeWidth="2.4" />
        <path d="M42.5 17.5v29" stroke="var(--c)" strokeWidth="1.6" strokeDasharray="2.2 2.4" />
        <g stroke="var(--c)" strokeWidth="2">
          <circle cx="13.5" cy="25.5" r="4.7" fill="#fff" />
          <circle cx="23.8" cy="25.5" r="4.7" fill="#fff" />
          <circle cx="34" cy="25.5" r="4.7" fill="#fff" />
          <circle cx="51" cy="25.5" r="4.7" fill="#fff" />
          <circle cx="13.5" cy="38.5" r="4.7" fill="#fff" />
          <circle cx="23.8" cy="38.5" r="4.7" fill="#fff" />
          <circle cx="34" cy="38.5" r="4.7" fill="#fff" />
          <circle cx="51" cy="38.5" r="4.7" fill="var(--px,#fff)" stroke="var(--pxs,var(--c))" />
        </g>
      </g>
    </Svg>
  );
}

/** Blister strip, caplets (Crocin Advance). */
export function IlStripCap(p: SvgProps) {
  return (
    <Svg {...p}>
      <g transform="rotate(-14 32 32)">
        <rect x="5" y="15" width="54" height="34" rx="5.5" fill="var(--t)" stroke="var(--c)" strokeWidth="2.4" />
        <path d="M42.5 17.5v29" stroke="var(--c)" strokeWidth="1.6" strokeDasharray="2.2 2.4" />
        <g stroke="var(--c)" strokeWidth="2" fill="#fff">
          <rect x="8.5" y="22.5" width="10" height="6" rx="3" />
          <rect x="19.8" y="22.5" width="10" height="6" rx="3" />
          <rect x="30" y="22.5" width="10" height="6" rx="3" />
          <rect x="46" y="22.5" width="10" height="6" rx="3" />
          <rect x="8.5" y="35.5" width="10" height="6" rx="3" />
          <rect x="19.8" y="35.5" width="10" height="6" rx="3" />
          <rect x="30" y="35.5" width="10" height="6" rx="3" />
          <rect x="46" y="35.5" width="10" height="6" rx="3" />
        </g>
      </g>
    </Svg>
  );
}

/** SUV with roof rails and a square glasshouse (Jeep Compass). */
export function IlSuv(p: SvgProps) {
  return (
    <Svg {...p}>
      <path d="M4 51.5h56" stroke="var(--t)" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M5 44v-8.2c0-1.6 1-3 2.5-3.5L13 30.4l5.4-9.3c.7-1.2 1.9-1.9 3.3-1.9h23.4c1.3 0 2.5.6 3.2 1.7l5.9 9.3 3.4 1.3c1.4.6 2.4 1.9 2.4 3.4V44c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2z"
        fill="var(--c)"
      />
      <path d="M17 30.4l4.2-7.2c.3-.5.8-.8 1.3-.8H31v8z" fill="var(--t)" />
      <path d="M34 22.4h10.2c.5 0 1 .3 1.3.7l4.6 7.3H34z" fill="var(--t)" />
      <path d="M21 16.5h24" stroke="var(--c)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M32.5 32v10" stroke="var(--t)" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="54" y="34" width="5" height="3.2" rx="1.6" fill="#fff" />
      <rect x="5" y="34" width="2.6" height="3.4" rx="1" fill="var(--t)" />
      <circle cx="17.5" cy="45" r="7.2" fill="var(--c)" stroke="#fff" strokeWidth="2.6" />
      <circle cx="17.5" cy="45" r="2.8" fill="var(--t)" />
      <circle cx="46.5" cy="45" r="7.2" fill="var(--c)" stroke="#fff" strokeWidth="2.6" />
      <circle cx="46.5" cy="45" r="2.8" fill="var(--t)" />
    </Svg>
  );
}

/** Hatchback with a short rear (Maruti Suzuki Swift); fallback for any vehicle. */
export function IlHatch(p: SvgProps) {
  return (
    <Svg {...p}>
      <path d="M4 51.5h56" stroke="var(--t)" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M5 43.5v-6.2c0-2 1.3-3.7 3.2-4.3l6.3-2 6.8-8.8c1-1.3 2.6-2.2 4.3-2.2h12.8c1.8 0 3.4.9 4.4 2.3l6 8.7 6.7 2c2 .6 3.3 2.4 3.3 4.4v6.1c0 1.4-1.1 2.5-2.5 2.5H7.5C6.1 46 5 44.9 5 43.5z"
        fill="var(--c)"
      />
      <path d="M18.4 30.8l5.4-7.1c.4-.6 1.2-.9 1.9-.9H31v8z" fill="var(--t)" />
      <path d="M34 22.8h5.3c.8 0 1.6.4 2.1 1.1l4.9 6.9H34z" fill="var(--t)" />
      <path d="M32.5 33v9" stroke="var(--t)" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="54.5" y="35.5" width="4.5" height="3" rx="1.5" fill="#fff" />
      <circle cx="17.5" cy="45.2" r="6.6" fill="var(--c)" stroke="#fff" strokeWidth="2.6" />
      <circle cx="17.5" cy="45.2" r="2.5" fill="var(--t)" />
      <circle cx="46.5" cy="45.2" r="6.6" fill="var(--c)" stroke="#fff" strokeWidth="2.6" />
      <circle cx="46.5" cy="45.2" r="2.5" fill="var(--t)" />
    </Svg>
  );
}

/** Dry iron with dial and cord (Bajaj Majesty DX-6). */
export function IlIron(p: SvgProps) {
  return (
    <Svg {...p}>
      <path d="M24 31c.6-7.5 5-12 12.5-12H50c2.8 0 4.8 2 4.8 4.8V31" fill="none" stroke="var(--c)" strokeWidth="5" strokeLinejoin="round" />
      <path d="M7 45c3.4-9 11.6-14.5 24-14.5h23c1.7 0 3 1.3 3 3V45z" fill="var(--c)" />
      <path d="M6.5 45H57.5v3c0 1.1-.9 2-2 2H9c-1.5 0-2.7-1.4-2.5-2.9z" fill="var(--t)" />
      <circle cx="42" cy="38" r="4.4" fill="var(--t)" />
      <path d="M42 38l2.2-2.4" stroke="var(--c)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M57 38c4 .2 5.2 4.6 2.6 9" fill="none" stroke="var(--c)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="20" cy="39.5" r="1.6" fill="var(--t)" />
      <circle cx="26" cy="38" r="1.6" fill="var(--t)" />
    </Svg>
  );
}

/** Glass-top gas stove, 3 burners, 3 knobs (Butterfly Smart Glass). */
export function IlStove(p: SvgProps) {
  return (
    <Svg {...p}>
      <path d="M12.5 20h39l7.5 20H5z" fill="var(--c)" />
      <g fill="var(--t)">
        <ellipse cx="17" cy="32" rx="6.6" ry="3.6" />
        <ellipse cx="32" cy="26.4" rx="5.6" ry="3" />
        <ellipse cx="47" cy="32" rx="6.6" ry="3.6" />
      </g>
      <g fill="var(--c)">
        <ellipse cx="17" cy="32" rx="2.6" ry="1.4" />
        <ellipse cx="32" cy="26.4" rx="2.2" ry="1.2" />
        <ellipse cx="47" cy="32" rx="2.6" ry="1.4" />
      </g>
      <path d="M15 22.5l-2 3" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
      <rect x="5" y="40" width="54" height="9" rx="2" fill="var(--t)" />
      <g fill="var(--c)">
        <circle cx="17" cy="44.5" r="2.7" />
        <circle cx="32" cy="44.5" r="2.7" />
        <circle cx="47" cy="44.5" r="2.7" />
        <rect x="9" y="49" width="5" height="3" rx="1" />
        <rect x="50" y="49" width="5" height="3" rx="1" />
      </g>
    </Svg>
  );
}

/** Ceiling fan: canopy, rod, 3 blades (Havells Efficiencia Neo). */
export function IlFan(p: SvgProps) {
  return (
    <Svg {...p}>
      <rect x="25" y="6" width="14" height="4.5" rx="2.2" fill="var(--c)" />
      <rect x="30.5" y="10" width="3" height="11" fill="var(--c)" />
      <path d="M24.5 27.5 4 31.6c-1.2.3-1.2 1.9 0 2.1L25 32z" fill="var(--t)" stroke="var(--c)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M39.5 27.5 60 31.6c1.2.3 1.2 1.9 0 2.1L39 32z" fill="var(--t)" stroke="var(--c)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M29 31.5 25.6 46c-.3 1.3 1 2.1 2 1.3L36 31.5z" fill="var(--t)" stroke="var(--c)" strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="32" cy="27" rx="10.5" ry="6" fill="var(--c)" />
      <path d="M22.5 26.5h19" stroke="var(--t)" strokeWidth="1.6" />
      <path d="M27.5 32.4h9l-1.6 3.4h-5.8z" fill="var(--c)" />
    </Svg>
  );
}

/** Storage geyser: rounded tank, band, dial, pipes (Crompton Arno Neo). */
export function IlGeyser(p: SvgProps) {
  return (
    <Svg {...p}>
      <rect x="15" y="6" width="34" height="46" rx="11" fill="var(--t)" />
      <path d="M15 20h34v16H15z" fill="var(--c)" />
      <rect x="15" y="6" width="34" height="46" rx="11" fill="none" stroke="var(--c)" strokeWidth="2.4" />
      <circle cx="24.5" cy="28" r="2.4" fill="#fff" />
      <circle cx="38" cy="28" r="4.4" fill="#fff" />
      <path d="M38 28l2.3-2.3" stroke="var(--c)" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="27" y="43" width="10" height="2.4" rx="1.2" fill="var(--c)" />
      <path d="M25.5 52.5v6.5M38.5 52.5v6.5" stroke="var(--c)" strokeWidth="3" strokeLinecap="round" />
    </Svg>
  );
}

/** Induction cooktop: coil rings, touch strip (Pigeon Cruise). */
export function IlInduction(p: SvgProps) {
  return (
    <Svg {...p}>
      <path d="M11 20h42l6.5 21h-55z" fill="var(--c)" />
      <ellipse cx="32" cy="30.5" rx="15" ry="6.3" fill="none" stroke="var(--t)" strokeWidth="2" />
      <ellipse cx="32" cy="30.5" rx="9" ry="3.7" fill="none" stroke="var(--t)" strokeWidth="2" />
      <ellipse cx="32" cy="30.5" rx="3.2" ry="1.3" fill="var(--t)" />
      <rect x="4.5" y="41" width="55" height="8" rx="2" fill="var(--t)" />
      <g fill="var(--c)">
        <circle cx="12" cy="45" r="2" />
        <rect x="34" y="44" width="4.5" height="2" rx="1" />
        <rect x="41" y="44" width="4.5" height="2" rx="1" />
        <rect x="48" y="44" width="4.5" height="2" rx="1" />
        <rect x="9" y="49" width="5" height="2.6" rx="1" />
        <rect x="50" y="49" width="5" height="2.6" rx="1" />
      </g>
    </Svg>
  );
}

/** Plug and cord: fallback for any appliance without its own drawing. */
export function IlPlug(p: SvgProps) {
  return (
    <Svg {...p}>
      <path d="M32 40v6c0 5 3.5 8 8.5 8H56" fill="none" stroke="var(--c)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M22 10.5v9M42 10.5v9" stroke="var(--c)" strokeWidth="4.4" strokeLinecap="round" />
      <path d="M15 19h34v9c0 7.7-6.3 14-14 14h-6c-7.7 0-14-6.3-14-14z" fill="var(--c)" />
      <rect x="15" y="19" width="34" height="6" fill="var(--t)" />
      <circle cx="32" cy="32.5" r="3" fill="var(--t)" />
    </Svg>
  );
}

/** Two earbuds over an open case (boAt Airdopes 141). */
export function IlBuds(p: SvgProps) {
  const bud = (cx: number, rot: number) => (
    <g transform={`rotate(${rot} ${cx} 26)`}>
      <rect x={cx - 3.5} y="24" width="7" height="20" rx="3.5" fill="var(--c)" />
      <circle cx={cx} cy="21" r="9" fill="var(--c)" />
      <circle cx={cx} cy="21" r="4.2" fill="#fff" />
      <circle cx={cx} cy="21" r="1.8" fill="var(--t)" />
    </g>
  );
  return (
    <Svg {...p}>
      <rect x="12" y="46" width="40" height="13" rx="6.5" fill="var(--t)" stroke="var(--c)" strokeWidth="2.4" />
      <circle cx="32" cy="52.5" r="1.7" fill="var(--c)" />
      {bud(21, -14)}
      {bud(43, 14)}
    </Svg>
  );
}

/** Pressure cooker: lid, whistle, long handle (Hawkins Contura, Prestige Deluxe Plus). */
export function IlCooker(p: SvgProps) {
  return (
    <Svg {...p}>
      <path d="M43 28.5 59 24.2" stroke="var(--c)" strokeWidth="5.2" strokeLinecap="round" />
      <path d="M3.5 37h6" stroke="var(--c)" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M8 30h36v16c0 3.3-2.7 6-6 6H14c-3.3 0-6-2.7-6-6z" fill="var(--c)" />
      <path d="M11 41h30" stroke="var(--t)" strokeWidth="2" strokeLinecap="round" />
      <path d="M5.5 30.5c4-7 11.3-10.5 20.5-10.5s16.5 3.5 20.5 10.5z" fill="var(--t)" stroke="var(--c)" strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="23.5" y="12.5" width="5" height="8.5" rx="1.5" fill="var(--c)" />
      <circle cx="26" cy="11.5" r="3" fill="var(--c)" />
    </Svg>
  );
}

/** Flip-lid flask with a highlight (Milton Thermosteel). */
export function IlFlask(p: SvgProps) {
  return (
    <Svg {...p}>
      <rect x="21" y="18" width="22" height="40" rx="6" fill="var(--c)" />
      <rect x="21" y="47" width="22" height="3.2" fill="var(--t)" />
      <rect x="25.5" y="24" width="3.6" height="19" rx="1.8" fill="#fff" opacity=".85" />
      <rect x="19.5" y="8.5" width="25" height="11" rx="4" fill="var(--t)" stroke="var(--c)" strokeWidth="2.4" />
      <path d="M44.5 11.5h2.8c1.2 0 2.2 1 2.2 2.2V17" fill="none" stroke="var(--c)" strokeWidth="2.4" strokeLinecap="round" />
    </Svg>
  );
}

/** Parcel box: fallback for any other thing without its own drawing. */
export function IlParcel(p: SvgProps) {
  return (
    <Svg {...p}>
      <path d="M32 8 55 18v28L32 56 9 46V18z" fill="var(--t)" />
      <path d="M32 30 55 18v28L32 56z" fill="var(--c)" />
      <path d="M32 8 55 18 32 30 9 18z" fill="var(--t)" stroke="var(--c)" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M32 8 55 18v28L32 56 9 46V18z" fill="none" stroke="var(--c)" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M20.5 13 43.5 24v8" fill="none" stroke="var(--c)" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M37 45.5l12-5.5" stroke="var(--t)" strokeWidth="2.4" strokeLinecap="round" />
    </Svg>
  );
}

export const ILLUSTRATIONS: Record<IllustrationId, (p: SvgProps) => React.JSX.Element> = {
  "il-strip": IlStrip,
  "il-strip-cap": IlStripCap,
  "il-suv": IlSuv,
  "il-hatch": IlHatch,
  "il-iron": IlIron,
  "il-stove": IlStove,
  "il-fan": IlFan,
  "il-geyser": IlGeyser,
  "il-induction": IlInduction,
  "il-plug": IlPlug,
  "il-buds": IlBuds,
  "il-cooker": IlCooker,
  "il-flask": IlFlask,
  "il-parcel": IlParcel,
};

/** Mapping rule (spec §2.13): by kind, then the first matching regex on the name. */
export function illustrationFor(kind: ItemKind, name: string): IllustrationId {
  const n = name.toLowerCase();
  switch (kind) {
    case "medicine":
      return /caplet|advance|capsule/.test(n) ? "il-strip-cap" : "il-strip";
    case "vehicle":
      return /compass|scorpio|xuv|creta|seltos|fortuner|thar|innova|suv/.test(n) ? "il-suv" : "il-hatch";
    case "appliance":
      if (/iron/.test(n)) return "il-iron";
      if (/stove|burner|hob/.test(n)) return "il-stove";
      if (/fan/.test(n)) return "il-fan";
      if (/geyser|water heater/.test(n)) return "il-geyser";
      if (/induction|cooktop/.test(n)) return "il-induction";
      return "il-plug";
    case "other":
      if (/earbud|airdopes|earphone|headphone/.test(n)) return "il-buds";
      if (/cooker/.test(n)) return "il-cooker";
      if (/flask|bottle/.test(n)) return "il-flask";
      return "il-parcel";
  }
}

/* ------------------------------------------------------------ category */

/** CSS variables for a category: `--c` mark, `--t` tint. Paper is the tile background (`bg-cat-*-soft`). */
export function catVars(kind: ItemKind): React.CSSProperties {
  return { ["--c" as string]: `var(--cat-${kind})`, ["--t" as string]: `var(--cat-${kind}-tint)` } as React.CSSProperties;
}

const PAPER: Record<ItemKind, string> = {
  medicine: "bg-cat-medicine-soft",
  vehicle: "bg-cat-vehicle-soft",
  appliance: "bg-cat-appliance-soft",
  other: "bg-cat-other-soft",
};
const MARK: Record<ItemKind, string> = {
  medicine: "bg-cat-medicine",
  vehicle: "bg-cat-vehicle",
  appliance: "bg-cat-appliance",
  other: "bg-cat-other",
};

/** 9–10 px rounded square in the category colour (squares are categories; circles are status). */
export function CategoryMark({ kind, size = 9, className }: { kind: ItemKind; size?: 9 | 10; className?: string }) {
  return <i aria-hidden className={cn("inline-block shrink-0 rounded-[3px]", size === 9 ? "size-[9px]" : "size-2.5", MARK[kind], className)} />;
}

/**
 * The illustration tile. Sizes by face: alert 112 (76 at 390), near-miss and needs-you 88 (64),
 * checking 72, clear 64 (56). `danger` puts it on --danger-soft (alert faces); `redPocket` turns the
 * strip's bottom-right pocket red (medicine alert).
 */
export function ItemIllustration({
  kind,
  name,
  id,
  danger = false,
  redPocket = false,
  className,
}: {
  kind: ItemKind;
  name: string;
  id?: IllustrationId;
  danger?: boolean;
  redPocket?: boolean;
  className?: string;
}) {
  const Draw = ILLUSTRATIONS[id ?? illustrationFor(kind, name)];
  const style: React.CSSProperties = { ...catVars(kind) };
  if (redPocket) Object.assign(style, { ["--px" as string]: "var(--pill-red, #B3121E)", ["--pxs" as string]: "var(--pill-red, #B3121E)" });
  return (
    <div aria-hidden className={cn("grid shrink-0 place-items-center rounded-[12px]", danger ? "bg-danger-soft" : PAPER[kind], className)} style={style}>
      <Draw className="size-[78%]" />
    </div>
  );
}

/* ------------------------------------------------------------ UI glyphs */

/** Filled alert triangle for the "ON A NOTICE" badge (lucide's TriangleAlert is outlined). */
export function AlertGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <path d="M12 3.5 22 20H2z" fill="currentColor" />
      <path d="M12 10v4.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1.2" fill="#fff" />
    </svg>
  );
}

/** 2 × 2 pockets with one filled: the "My things" tab icon (shell part). */
export function ThingsGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.9">
        <circle cx="7.5" cy="7.5" r="3" />
        <circle cx="16.5" cy="7.5" r="3" />
        <circle cx="7.5" cy="16.5" r="3" />
      </g>
      <circle cx="16.5" cy="16.5" r="3" fill="currentColor" />
    </svg>
  );
}

/** Logo mark (brand/mark.svg): ink card, 2×2 pockets punched through, bottom-right pocket red. Prefer shell/Brand's Mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" aria-hidden focusable="false" className={className}>
      <path fill="var(--ink)" fillRule="evenodd" d="M8 0h20a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8zM10.5 5.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM25.5 5.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM10.5 20.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM25.5 20.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10z" />
      <circle fill="var(--danger)" cx="25.5" cy="25.5" r="5" />
    </svg>
  );
}

/** 14 px spinner (a 3/4 arc). Under reduced motion the global rule stops it, leaving a static arc. */
export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />;
}
