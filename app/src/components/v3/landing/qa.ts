'use client'
/**
 * ?state= support for the landing route (landing.md §1.4). Read after hydration, so the static
 * export's HTML is always the default page (no useSearchParams Suspense bail-out on "/").
 */
import { useEffect, useState } from 'react'
import { landingSnapshotSourceDown } from './fixtures'
import type { LandingData, LandingDataStatus, LandingState } from './types'

const STATES: LandingState[] = [
  'default', 'static', 'poster', 'reduced', 'stale', 'source-down', 'highlight-batch', 'highlight-pill', 'scrolled', 'traced',
]

export function useLandingQaState(): LandingState {
  const [state, setState] = useState<LandingState>('default')
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('state') as LandingState | null
    if (q && STATES.includes(q)) setState(q)
  }, [])
  return state
}

/** Data/status overrides for the QA states that are about data rather than presentation. */
export function applyLandingQa(state: LandingState, data: LandingData, status: LandingDataStatus) {
  if (state === 'source-down') return { data: landingSnapshotSourceDown, status }
  if (state === 'stale') return { data, status: 'stale' as const }
  // static and poster keep the 3D off: FoilStripHero reads ?state= itself.
  return { data, status }
}
