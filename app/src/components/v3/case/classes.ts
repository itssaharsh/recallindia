/**
 * Recurring class lists on /case, named so component markup stays readable.
 * Case-only tints (not in globals.tokens.css) are written as arbitrary values here and in the components;
 * README lists them as token candidates.
 */

/** `.fl` field label: Onest 600 11, uppercase, .07em */
export const FIELD_LABEL = "font-sans text-[11px] leading-none font-semibold uppercase tracking-[.07em] text-ink-muted";

/** section card padding (notice, batch, show work) */
export const SEC_PAD = "px-7 pt-6 pb-[26px] max-md:px-4 max-md:pt-[18px] max-md:pb-5";

/** h2 inside section cards: Funnel Display 700 24/1.15 */
export const SEC_H2 = "font-display text-[24px] leading-[1.15] font-bold tracking-[-.02em] text-ink max-md:text-[20px]";

/** meta line under a section h2 */
export const SEC_META = "mt-1.5 text-[14px] leading-[1.45] text-ink-muted";

/** 30 px status chip (`.chip.lg`): Chip has no lg size, so these override it with `!` */
export const CHIP_LG = "h-[30px]! px-3! text-[13px]! gap-1.5 whitespace-nowrap";

/** primary button shadow used on /case */
export const PRIMARY_SHADOW = "shadow-[0_1px_2px_rgb(10_88_194/.3),0_10px_22px_-10px_rgb(10_88_194/.7)]";

/** visually hidden */
export const SR_ONLY = "absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)] [clip-path:inset(50%)] -m-px p-0 border-0";
