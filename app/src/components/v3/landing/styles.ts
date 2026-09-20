/** Shared class lists (plain module, so server and client components can both import them). */

/** Section H2: 34 px phone, 46 tablet, 56 desktop (landing.md §5, §7, §11). */
export const H2 =
  'm-0 font-display text-[34px] font-extrabold leading-[1.05] tracking-[-.035em] text-ink text-balance min-[701px]:text-[46px] min-[1200px]:text-[56px] min-[1200px]:leading-[1.02]'

/** Section lede: 16 px stacked, 18 px desktop, ink-muted; bold runs are 600 ink. */
export const LEDE = 'm-0 font-sans text-[16px] leading-[1.55] text-ink-muted min-[1200px]:text-[18px]'

/** Landing CTA at 54 px (50 on phones). The ui Button has md (44) and sm only, so this composes an xl size. */
export const CTA_XL =
  'h-[50px]! px-[26px]! text-[16px]! min-[701px]:h-[54px]! min-[701px]:text-[17px]! active:scale-[.98]! focus-visible:outline-offset-3!'
