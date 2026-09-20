'use client'
/**
 * LandingView: the whole "/" page from one typed props object (landing.md).
 * Presentational: no fetching. The route passes the build-time snapshot, swaps in live numbers when
 * its client refresh lands (status 'live'), or keeps the snapshot with status 'stale' if it fails.
 */
import { MotionConfig } from 'framer-motion'
import { useEffect } from 'react'
import { ArtifactShowcase } from './ArtifactShowcase'
import { landingLinks } from './fixtures'
import { FooterCta } from './FooterCta'
import { Hero } from './Hero'
import { HowItWorks } from './HowItWorks'
import s from './landing.module.css'
import { LandingNav } from './LandingNav'
import { ProofBand } from './ProofBand'
import type { LandingData, LandingDataStatus, LandingLinks, LandingState, LandingStory } from './types'

export interface LandingViewProps {
  /** Numbers: /v1/stats + /v1/sources mapped by lib/api.ts (landing.md §1.3). */
  data: LandingData
  /** 'snapshot' (build time), 'live' (client refresh landed: bars grow once), 'stale' (refresh failed). */
  status?: LandingDataStatus
  /** Demo records the page illustrates: CDSCO JUL-2026 row 12, the demo household, case_demo_ft5427. */
  story: LandingStory
  /** Route overrides; defaults are the app's routes. */
  links?: Partial<LandingLinks>
  /** QA state from ?state= (landing.md §1.4). */
  state?: LandingState
  /** Static assets in public/. */
  assets?: {
    /** Hero poster, 1400 × 1050 transparent (FoilStripHero's default is /strip/strip-poster-hero.png). */
    poster?: string
    /** ScanHint photo (default /strip/scan-strip.webp, shipped in landing/assets). */
    scanPhoto?: string
  }
}

export function LandingView({ data, status = 'snapshot', story, links, state = 'default', assets }: LandingViewProps) {
  const l: LandingLinks = { ...landingLinks, ...links }
  const st: LandingDataStatus = state === 'stale' ? 'stale' : status

  // ?state=scrolled loads at y = 900 with the solid nav.
  useEffect(() => {
    if (state === 'scrolled') window.scrollTo({ top: 900, behavior: 'instant' })
  }, [state])

  return (
    <MotionConfig reducedMotion={state === 'reduced' ? 'always' : 'user'}>
      <div className={`${s.root} bg-canvas font-sans text-ink`} data-landing-state={state}>
        <LandingNav links={l} forceSolid={state === 'scrolled'} />
        <main>
          <div className={s.top}>
            <Hero data={data} status={st} story={story} links={l} state={state} poster={assets?.poster} />
          </div>
          <div className={s.sheet}>
            <HowItWorks data={data} story={story} state={state} scanPhoto={assets?.scanPhoto ?? '/strip/scan-strip.webp'} />
            <ProofBand data={data} status={st} story={story} links={l} />
            <ArtifactShowcase story={story} links={l} />
          </div>
        </main>
        <FooterCta data={data} story={story} links={l} />
      </div>
    </MotionConfig>
  )
}
