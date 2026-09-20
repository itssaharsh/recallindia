'use client'
/**
 * Hero (landing.md §2, §3): live pill, H1, sub, CTAs, stats and the 3D strip with its annotations.
 * Plays the page's one load sequence (1600 ms). FoilStripHero plays the strip's rows (700–1600 ms)
 * on the same clock via `introStart`.
 *
 * DOM order is the desktop reading order (pill, H1, sub, CTAs, stats, strip). Stacked layouts are a
 * flex column and move the strip right under the H1 with `order` (it is aria-hidden; its text
 * equivalent is FoilStripHero's visually hidden paragraph).
 */
import NumberFlow from '@number-flow/react'
import { motion, useReducedMotionConfig, type Transition } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import FoilStripHero from '../FoilStripHero'
import { Button, Dot } from '../ui'
import { alertSourceLine, fmtInt, LOCALE, lowerReason, pollSummary } from './format'
import { EASE_LANDING, HERO_INTRO, spring } from './motion'
import s from './landing.module.css'
import { CTA_XL } from './styles'
import type { LandingData, LandingDataStatus, LandingLinks, LandingState, LandingStory } from './types'

export interface HeroProps {
  data: LandingData
  status: LandingDataStatus
  story: Pick<LandingStory, 'notice' | 'item'>
  links: Pick<LandingLinks, 'mine' | 'ingest'>
  state: LandingState
  /** Poster for FoilStripHero (1400 × 1050, transparent). */
  poster?: string
}

/** The H1, split where it breaks at 1536 ("When your medicine / fails a quality test, / nobody tells you."). */
export const HERO_H1_LINES = ['When your medicine', 'fails a quality test,', 'nobody tells you.'] as const
export const HERO_SUB =
  "RecallIndia reads India's drug-quality alerts and recall notices the day they're published, checks them against the things in your house, and hands you a claim letter with sealed evidence."

type Phase = 'idle' | 'playing' | 'done'
type Pose = { opacity: number; y: number; scale: number }
interface EnterProps {
  initial: false | Pose
  animate: Pose
  transition: Transition
  'data-intro'?: string
}

/** One orchestrated sequence: t0 = first frame after the display font is ready (or 300 ms after hydration). */
function useHeroIntro(skip: boolean) {
  const reduce = useReducedMotionConfig() ?? false
  const [phase, setPhase] = useState<Phase>(skip ? 'done' : 'idle')
  const [t0, setT0] = useState<number | undefined>(undefined)
  const [wide, setWide] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1200px)')
    const onMq = () => setWide(mq.matches)
    onMq()
    mq.addEventListener('change', onMq)
    return () => mq.removeEventListener('change', onMq)
  }, [])

  useEffect(() => {
    if (skip) {
      setPhase('done')
      return
    }
    let started = false
    let raf = 0
    let doneTimer = 0
    const start = () => {
      if (started) return
      started = true
      raf = requestAnimationFrame(() => {
        setT0(performance.now())
        setPhase('playing')
        doneTimer = window.setTimeout(() => setPhase('done'), reduce ? HERO_INTRO.reducedFade : HERO_INTRO.done)
      })
    }
    const fallback = window.setTimeout(start, HERO_INTRO.fontTimeout)
    void document.fonts?.ready.then(start)
    return () => {
      window.clearTimeout(fallback)
      window.clearTimeout(doneTimer)
      cancelAnimationFrame(raf)
    }
    // reduce is read once at start; the sequence is never restarted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip])

  const shown = phase !== 'idle'

  /** Enter props for one row of the sequence table. Reduced motion: everything fades together, 200 ms. */
  const enter = (at: number, from: { y?: number; scale?: number }, t: Transition, hidden = !shown): EnterProps => {
    const rest: Pose = { opacity: 1, y: 0, scale: 1 }
    const off: Pose = { opacity: 0, y: from.y ?? 0, scale: from.scale ?? 1 }
    // Hiding (before t0, or when the line/block mode flips on hydration) is always instant.
    const transition: Transition =
      skip || hidden
        ? { duration: 0 }
        : reduce
          ? { duration: HERO_INTRO.reducedFade / 1000, ease: 'linear', delay: 0 }
          : { ...t, delay: at / 1000 }
    return { initial: skip ? false : off, animate: hidden ? off : rest, transition, 'data-intro': '' }
  }

  return { phase, shown, t0, wide, reduce, enter }
}

export function Hero({ data, status, story, links, state, poster }: HeroProps) {
  const skip = state === 'static'
  const { phase, shown, t0, wide, enter } = useHeroIntro(skip)
  const gutter = useHeroGutter()
  const stale = status === 'stale' || state === 'stale'
  const polls = pollSummary(data.sources)
  const n = story.notice
  const highlight = state === 'highlight-batch' ? 'batch' : state === 'highlight-pill' ? 'pill' : null

  const lineSpring = spring(0.4, 0.08)
  const softSpring = spring(0.36, 0)

  // Line mode (≥ 1200): the three lines rise one by one. Below that the H1 rises as one block.
  const still: EnterProps = { initial: false, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0 } }
  const h1Props = wide ? still : enter(HERO_INTRO.h1Lines[0], { y: 18 }, lineSpring)
  const lineProps = (i: number) => (wide ? enter(HERO_INTRO.h1Lines[i], { y: 18 }, lineSpring) : still)

  // FoilStripHero measures its stage with getBoundingClientRect; nudge it once the stage transform settles.
  const onStageSettled = () => window.dispatchEvent(new Event('resize'))

  return (
    <section
      aria-labelledby="hero-h1"
      data-surface="cobalt"
      data-hero={phase === 'done' ? 'rest' : 'intro'}
      className={`${s.hero} text-on-cobalt`}
    >
      <noscript>
        <style>{'[data-intro]{opacity:1!important;transform:none!important}'}</style>
      </noscript>
      <div className={`${s.wrap} relative pt-16 min-[1200px]:h-full min-[1200px]:pt-0`}>
        <div className="flex flex-col pt-2.5 min-[1200px]:block min-[1200px]:w-[min(720px,53.6%)] min-[1200px]:pt-[134px]">
          <motion.div {...enter(HERO_INTRO.livePill.at, {}, { duration: HERO_INTRO.livePill.dur / 1000, ease: EASE_LANDING })} className="relative z-[2] order-1">
            <LivePill data={data} stale={stale} />
          </motion.div>

          <motion.h1
            id="hero-h1"
            {...h1Props}
            className="relative z-[2] order-2 mt-4 mb-1.5 max-w-[680px] font-display text-[38px] font-extrabold leading-none tracking-[-.035em] text-white text-balance min-[701px]:mt-5 min-[701px]:text-[56px] min-[1200px]:mt-6 min-[1200px]:mb-5 min-[1200px]:text-[clamp(52px,4.43vw,68px)] min-[1200px]:tracking-[-.037em]"
          >
            {HERO_H1_LINES.map((line, i) => (
              <motion.span key={line} {...lineProps(i)} className="inline-block min-[1200px]:block">
                {line}
                {i < HERO_H1_LINES.length - 1 ? ' ' : null}
              </motion.span>
            ))}
          </motion.h1>

          <motion.p
            {...enter(HERO_INTRO.sub, { y: 12 }, softSpring)}
            className="relative z-[2] order-4 mb-5 max-w-[590px] font-sans text-[16px] leading-[1.5] text-on-cobalt-muted min-[701px]:text-[18px] min-[1200px]:mb-[30px] min-[1200px]:text-[clamp(17px,1.24vw,19px)] min-[1200px]:leading-[1.52]"
          >
            {HERO_SUB}
          </motion.p>

          <motion.div
            {...enter(HERO_INTRO.ctas, { y: 12 }, softSpring)}
            className="relative z-[2] order-5 flex flex-col gap-2 min-[701px]:flex-row min-[701px]:items-center min-[1200px]:gap-3"
          >
            <Button variant="onBlue" href={links.mine} className={CTA_XL}>
              Check what you own
            </Button>
            <Button variant="outlineOnBlue" href={links.ingest} icon={<PlayDisc />} className={`${CTA_XL} hover:border-white/70! hover:bg-white/8!`}>
              Watch a PDF become the feed
            </Button>
          </motion.div>

          <motion.dl
            {...enter(HERO_INTRO.stats, { y: 8 }, softSpring)}
            className="relative z-[2] order-6 mt-7 grid grid-cols-1 gap-3 border-t border-white/22 pt-[18px] min-[701px]:grid-cols-3 min-[701px]:gap-x-6 min-[701px]:gap-y-0 min-[1200px]:mt-[38px] min-[1200px]:grid-cols-[minmax(0,196fr)_minmax(0,222fr)_minmax(0,200fr)] min-[1200px]:pt-5"
          >
            <Stat value={fmtInt(data.cdscoLatest.failed)}>drug samples failed CDSCO tests in {data.cdscoLatest.label}</Stat>
            <Stat value={polls.fast}>
              between polls of {polls.fastNames}; {polls.dailyNames} daily
            </Stat>
            <Stat value={`${data.pipelineSeconds} s`}>from your approval to a signed, locked claim</Stat>
          </motion.dl>

          <motion.div
            {...enter(HERO_INTRO.stage, { y: 28, scale: 0.96 }, lineSpring)}
            onAnimationComplete={onStageSettled}
            className={`${s.stage} order-3`}
          >
            <FoilStripHero
              className="size-full"
              poster={poster}
              batch={n.batches[0]}
              batchLabel="Batch on your strip"
              alertSource={alertSourceLine(n)}
              alertText={`Failed: ${lowerReason(n.hazard_or_failed_test)}`}
              sealTop="Claim letter ready"
              sealText="Evidence sealed"
              sealWord="VERIFIED"
              highlight={highlight}
              introStart={t0}
              skipIntro={skip}
              gutter={gutter}
            />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function PlayDisc() {
  return (
    <span aria-hidden="true" className="-ml-1.5 grid size-[22px] place-items-center rounded-full bg-white/18">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M2 1l7 4-7 4z" fill="#fff" />
      </svg>
    </span>
  )
}

function Stat({ value, children }: { value: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-baseline gap-3 min-[701px]:block">
      <dt className="font-display text-[24px] font-extrabold leading-none tracking-[-.02em] text-white tabular-nums min-[701px]:mb-2 min-[701px]:text-[30px] min-[1200px]:text-[32px]">
        {value}
      </dt>
      <dd className="m-0 font-sans text-[14px] leading-[1.4] text-on-cobalt-muted text-pretty">{children}</dd>
    </div>
  )
}

/** LivePill (§2.2): "Live · {total} notices from {sourceCount} regulators"; stale shows the snapshot time. */
export function LivePill({ data, stale }: { data: LandingData; stale: boolean }) {
  return (
    <p className="m-0 flex h-[30px] w-fit items-center gap-2.5 rounded-pill border border-on-cobalt-line pr-3.5 pl-3 font-sans text-[13px] font-medium leading-none text-on-cobalt-muted min-[1200px]:h-[34px] min-[1200px]:text-[14px]">
      <Dot className={stale ? 'bg-on-cobalt-muted' : 'bg-live shadow-[0_0_0_4px_rgb(61_220_132/.22)]'} />
      <span>
        {stale ? (
          <>
            Updated {data.asOfDate}, {data.asOf} IST
          </>
        ) : (
          <b className="font-semibold text-white">Live</b>
        )}
        {' · '}
        <NumberFlow
          value={data.total}
          locales={LOCALE}
          trend={1}
          transformTiming={{ duration: 400, easing: 'cubic-bezier(.2,.8,.2,1)' }}
          spinTiming={{ duration: 400, easing: 'cubic-bezier(.2,.8,.2,1)' }}
        />{' '}
        notices from {data.sourceCount} regulators
      </span>
    </p>
  )
}

/** Chip clamp gutter for FoilStripHero: the hero content box edge at each breakpoint. */
function useHeroGutter() {
  const [gutter, setGutter] = useState<number | undefined>(undefined)
  const last = useRef<number | undefined>(undefined)
  useEffect(() => {
    const measure = () => {
      const vw = document.documentElement.clientWidth
      const g = vw >= 1200 ? Math.max(40, (vw - 1344) / 2) : vw >= 701 ? (vw - Math.min(640, vw - 64)) / 2 : 16
      if (g !== last.current) {
        last.current = g
        setGutter(g)
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return gutter
}
