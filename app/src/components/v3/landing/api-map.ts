/**
 * Pure mapping from the live GET /v1/stats response (checked 20 Sep 2026) to LandingData.
 * No fetching here: lib/api.ts fetches and calls this, at build time for the snapshot and on the client
 * for the refresh. GET /v1/sources returns 404 today, so everything comes from /v1/stats.
 */
import { fmtAlertMonth, fmtDay } from './format'
import type { LandingData, LandingSource, SourceId } from './types'

export interface StatsResponse {
  total: number
  sources_count: number
  sources: {
    source: 'cdsco_nsq' | 'cpsc' | 'nhtsa' | 'openfda'
    label: string
    count: number
    /** 'healthy' | 'degraded' | anything else = not responding */
    health: string
    last_run_at: string | null
    last_success_at: string | null
    /** '15 min' | '1 day' */
    polls_every: string
  }[]
  cdsco_latest: { month: string; count: number; published_at: string; complete: boolean }
  last_poll_at: string
  generated_at: string
}

const ID: Record<StatsResponse['sources'][number]['source'], SourceId> = { cdsco_nsq: 'cdsco', cpsc: 'cpsc', nhtsa: 'nhtsa', openfda: 'openfda' }

const istClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

/**
 * @param pipelineSeconds approve → verified time of case_demo_ft5427. Not in any API response yet
 *        (see README "Backend"), so the snapshot bakes it: 9.
 */
export function landingDataFromStats(r: StatsResponse, pipelineSeconds: number): LandingData {
  const bySource = { cdsco: 0, cpsc: 0, nhtsa: 0, openfda: 0 } as Record<SourceId, number>
  const sources: LandingSource[] = r.sources.map((s) => {
    const id = ID[s.source]
    bySource[id] = s.count
    return {
      id,
      schedule: s.polls_every === '1 day' ? 'daily' : s.polls_every,
      status: s.health === 'healthy' || s.health === 'degraded' ? 'ok' : 'down',
      lastRunAt: s.last_success_at ?? s.last_run_at ?? r.generated_at,
    }
  })
  const p = Object.fromEntries(istClock.formatToParts(new Date(r.generated_at)).map((x) => [x.type, x.value]))
  return {
    total: r.total,
    bySource,
    sourceCount: r.sources_count,
    cdscoLatest: { month: r.cdsco_latest.month, label: fmtAlertMonth(r.cdsco_latest.month), failed: r.cdsco_latest.count },
    asOf: `${p.hour}:${p.minute}`,
    asOfDate: fmtDay(`${p.year}-${p.month}-${p.day}`),
    sources,
    pipelineSeconds,
  }
}
