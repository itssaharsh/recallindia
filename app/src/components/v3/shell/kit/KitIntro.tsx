"use client";
import * as React from "react";
import { motion, type Variants } from "framer-motion";
import { Button, cn } from "../../ui";
import { Lockup } from "../Brand";
import { formatCount } from "../format";
import { STAGGER, spring } from "../motion";

/** The kit page's one orchestrated load sequence: heading, lede, facts, then the three material tiles, 40 ms apart. */
const container: Variants = { hidden: {}, show: { transition: { staggerChildren: STAGGER } } };
const rise: Variants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: spring } };

const foilFace = "bg-[image:var(--foil)] shadow-[inset_0_1px_0_rgb(255_255_255/0.8),inset_0_0_0_1px_rgb(11_27_51/0.12)]";

/** A 2 × 2 foil blister with one red pill (the "Red" material tile). */
function Blister() {
  const pocket = "grid size-14 place-items-center rounded-full bg-white/35 shadow-[inset_0_3px_6px_rgb(11_27_51/0.22),inset_0_-1px_0_rgb(255_255_255/0.9),0_1px_0_rgb(255_255_255/0.7)] max-md:size-10";
  const pill = "relative size-10 rounded-full bg-white shadow-[0_2px_3px_rgb(11_27_51/0.25),inset_0_-3px_0_rgb(11_27_51/0.07)] max-md:size-7 after:absolute after:left-[11px] after:top-[9px] after:h-2 after:w-3 after:-rotate-[30deg] after:rounded-full after:bg-white/80 max-md:after:left-[7px] max-md:after:top-[5px] max-md:after:h-[5px] max-md:after:w-[7px]";
  // the red pill echoes the 3D strip's pill: danger, shaded like the render
  const red = "bg-[radial-gradient(circle_at_38%_34%,#E4414C_0,var(--danger)_58%,#8E0A14_100%)] shadow-[0_2px_4px_rgb(120_0_10/0.45),0_0_0_4px_rgb(179_18_30/0.14)]";
  return (
    <div
      aria-hidden
      className={cn(
        "ml-1.5 mt-1.5 grid w-max -rotate-6 grid-cols-[repeat(2,56px)] gap-3 rounded-[20px] p-3.5 max-md:grid-cols-[repeat(2,40px)] max-md:gap-2 max-md:rounded-[14px] max-md:p-2.5",
        "bg-[image:var(--foil)] shadow-[inset_0_1px_0_rgb(255_255_255/0.8),inset_0_0_0_1px_rgb(11_27_51/0.12),0_12px_24px_-12px_rgb(11_27_51/0.35)]",
      )}
    >
      <span className={pocket}><span className={pill} /></span>
      <span className={pocket}><span className={pill} /></span>
      <span className={pocket}><span className={pill} /></span>
      <span className={pocket}><span className={cn(pill, red)} /></span>
    </div>
  );
}

export interface KitIntroProps {
  total: number;
  sourcesCount: number;
  alertCount: number;
  thingsCount: number;
  /** The batch printed on the demo strip, and its expiry as printed. */
  batch: string;
  expiry: string;
}

export function KitIntro({ total, sourcesCount, alertCount, thingsCount, batch, expiry }: KitIntroProps) {
  return (
    <motion.section aria-labelledby="kit-title" className="pt-11 max-md:pt-[22px]" variants={container} initial="hidden" animate="show">
      <div className="grid grid-cols-[1fr_470px] items-end gap-12 max-lg:grid-cols-1 max-lg:gap-[18px]">
        <div>
          <motion.h1 id="kit-title" variants={rise} className="font-display text-display-xl text-ink max-md:text-[44px]">
            Cobalt &amp; Foil
          </motion.h1>
          <motion.p variants={rise} className="mt-4 max-w-[720px] text-[19px] leading-[1.5] text-ink-muted max-md:mt-2.5 max-md:text-[16px] [&_b]:font-semibold [&_b]:text-ink">
            The kit RecallIndia is built from. <b>Cobalt</b> is for what you can do, <b>foil</b> is for what's printed on the thing, and <b>red</b> is only for what affects you. Everything else is white cards on a cool canvas.
          </motion.p>
        </div>
        <motion.dl variants={rise} className="m-0 grid grid-cols-[auto_1fr] gap-x-[18px] gap-y-2.5 text-[14px] leading-[1.35] text-ink-muted max-lg:hidden">
          <dt className="font-semibold text-ink">Type</dt><dd>Funnel Display 800 · Onest · Doto 900 on foil · IBM Plex Mono for hashes</dd>
          <dt className="font-semibold text-ink">Radius</dt><dd>8 inputs · 14 cards · 22 sheets · pill for anything you press</dd>
          <dt className="font-semibold text-ink">Motion</dt><dd>Springs with bounce 0.1 · 250 ms chips · 320 ms flips · 400 ms sheets</dd>
          <dt className="font-semibold text-ink">Tokens</dt><dd><code className="font-mono text-[13px] text-ink">globals.tokens.css</code> · <code className="font-mono text-[13px] text-ink">DESIGN.md</code></dd>
        </motion.dl>
      </div>

      <div className="mt-8 grid grid-cols-[1.32fr_1fr_.78fr] gap-4 max-md:mt-5 max-md:grid-cols-2 max-md:gap-3">
        {/* Cobalt */}
        <motion.div variants={rise} data-surface="cobalt" className="relative flex min-h-[300px] flex-col overflow-hidden rounded-lg bg-cobalt px-[26px] py-6 text-white max-md:col-span-2 max-md:min-h-[236px] max-md:p-[18px]">
          <span aria-hidden className="pointer-events-none absolute -right-[120px] -top-20 h-[420px] w-[520px] bg-[image:var(--hero-glow)]" />
          <Lockup size="landing" tone="onBlue" labelled className="relative" />
          <span className="absolute right-[26px] top-6 inline-flex h-8 items-center gap-[9px] rounded-pill border border-on-cobalt-line pl-[11px] pr-[13px] text-[13px] font-medium leading-none text-on-cobalt-muted max-md:hidden">
            <span aria-hidden className="size-2 rounded-full bg-live shadow-[0_0_0_4px_rgb(61_220_132/0.22)]" />
            <b className="font-semibold text-white">Live</b> · {formatCount(total)} notices from {sourcesCount} regulators
          </span>
          <div className="relative mt-auto grid grid-cols-[1fr_auto] items-end gap-5 max-md:mt-[26px] max-md:grid-cols-1">
            <div>
              <p className="font-display text-[44px] font-extrabold leading-none tracking-[-0.03em] max-md:text-[34px]">Cobalt</p>
              <p className="mt-2.5 max-w-[380px] text-[16px] leading-[1.45] text-on-cobalt-muted max-md:text-[14px]">
                <b className="font-semibold text-white">#0A58C2</b> · for what you can do: the one primary action, the active tab, links, focus and the landing hero.
              </p>
            </div>
            {/* ui/Button has no lg size yet: 54 / 0 26 / 17 px via style (see README) */}
            <Button variant="onBlue" href="/mine/" className="justify-self-start" style={{ height: 54, paddingInline: 26, fontSize: 17 }}>
              Check what you own
            </Button>
          </div>
        </motion.div>

        {/* Foil */}
        <motion.div variants={rise} className={cn("relative flex min-h-[300px] flex-col overflow-hidden rounded-lg px-[26px] py-6 text-ink max-md:min-h-0 max-md:p-[18px]", foilFace)}>
          <div aria-hidden className="mt-[18px] origin-top-left -rotate-[4deg] font-foil text-[26px] font-black leading-none tracking-[0.06em] text-ink/85 max-md:mt-1.5 max-md:text-[15px]">
            B.No.
            <span className="my-2.5 mb-3 block text-[76px] tracking-[0.05em] text-ink max-md:my-1.5 max-md:text-[38px]">{batch}</span>
            <span className="text-[22px] max-md:text-[13px]">EXP {expiry}</span>
          </div>
          <div className="mt-auto text-[15px] leading-[1.45] text-ink/90 max-md:mt-4 max-md:text-[12.5px]">
            <p className="mb-1.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink max-md:text-[18px]">Foil</p>
            For what's printed on the thing: batch, lot and serial codes, in Doto on a foil chip.
          </div>
        </motion.div>

        {/* Red */}
        <motion.div variants={rise} className="relative flex min-h-[300px] flex-col overflow-hidden rounded-lg border border-line bg-surface-1 px-[26px] py-6 shadow-1 max-md:min-h-0 max-md:p-[18px]">
          <Blister />
          <div className="mt-auto pt-3.5 text-[15px] leading-[1.45] text-ink-muted max-md:pt-2.5 max-md:text-[12.5px]">
            <p className="mb-1.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink max-md:text-[18px]">Red</p>
            Only for what affects you: <em className="font-semibold not-italic text-danger">{alertCount} of {thingsCount} things</em> in the demo household.
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}
