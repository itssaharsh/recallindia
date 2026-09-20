'use client'
/**
 * Live proof band (landing.md §6): SourceBars (left) and FailedGrid (right) in one white panel.
 * Bars: snapshot widths in the server HTML → when live data lands and the panel reaches 40 %
 * visibility they grow once from 0 (400 ms each, 60 ms stagger, NumberFlow in step) → later live
 * changes animate old → new. Bars are aria-hidden; names and values stay as text.
 */
import NumberFlow from '@number-flow/react'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Dot } from '../ui'
import { fmtInt, fmtIstTime, LOCALE, pollSummary, SOURCE_LABEL } from './format'
import { BAR_MS, BAR_STAGGER_MS } from './motion'
import s from './landing.module.css'
import type { LandingData, LandingDataStatus, LandingLinks, LandingStory, SourceId } from './types'

export interface ProofBandProps {
  data: LandingData
  status: LandingDataStatus
  story: Pick<LandingStory, 'notice'>
  links: Pick<LandingLinks, 'feedCdscoMonth'>
}

/** Bar order, description and the source identity colour used on /feed. */
const SOURCE_ROWS: { id: SourceId; desc: string; fill: string }[] = [
  { id: 'cdsco', desc: 'Drug samples that failed quality tests · India', fill: 'bg-cat-medicine' },
  { id: 'cpsc', desc: 'Consumer product recalls · US', fill: 'bg-cat-appliance' },
  { id: 'openfda', desc: 'Drug, device and food recalls · US', fill: 'bg-cat-other' },
  { id: 'nhtsa', desc: 'Vehicle safety recalls · US', fill: 'bg-cat-vehicle' },
]

type BarPhase = 'snapshot' | 'armed' | 'grown'

const FIG = 'font-display text-[64px] font-extrabold leading-[.9] tracking-[-.045em] text-ink tabular-nums min-[1200px]:text-[88px]'
const flowTiming = { duration: BAR_MS, easing: 'cubic-bezier(.22,1,.36,1)' }

export function ProofBand({ data, status, story, links }: ProofBandProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const phase = useBarPhase(panelRef, status === 'live')
  return (
    <section aria-labelledby="proof-h2" className="pb-[72px] min-[1200px]:pb-32">
      <div className={s.wrap}>
        <h2 id="proof-h2" className="sr-only">
          The live feed right now
        </h2>
        <div
          ref={panelRef}
          className="grid grid-cols-[minmax(0,1fr)] rounded-lg border border-line bg-surface-1 shadow-1 min-[1200px]:grid-cols-[1fr_452px]"
        >
          <SourceBars data={data} stale={status === 'stale'} phase={phase} />
          <FailedGrid data={data} row={story.notice.row_ref?.row ?? 0} batch={story.notice.batches[0] ?? ''} href={links.feedCdscoMonth} />
        </div>
      </div>
    </section>
  )
}

/** snapshot → (live arrives while off-screen) armed → (≥ 40 % visible) grown. */
function useBarPhase(ref: RefObject<HTMLDivElement | null>, live: boolean): BarPhase {
  const [phase, setPhase] = useState<BarPhase>('snapshot')
  const done = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!live || done.current || !el) return
    let first = true
    const io = new IntersectionObserver(
      ([e]) => {
        const visible = e.intersectionRatio >= 0.4
        if (first) {
          first = false
          if (visible) {
            // Already on screen when the data landed: no collapse, widths just move (settled).
            done.current = true
            io.disconnect()
            return
          }
          setPhase('armed')
          return
        }
        if (visible) {
          done.current = true
          setPhase('grown')
          io.disconnect()
        }
      },
      { threshold: [0, 0.4] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [live, ref])
  return phase
}

export function SourceBars({ data, stale, phase }: { data: LandingData; stale: boolean; phase: BarPhase }) {
  const max = Math.max(...SOURCE_ROWS.map((r) => data.bySource[r.id]))
  const polls = pollSummary(data.sources)
  const armed = phase === 'armed'
  return (
    <div className="px-5 pt-7 pb-6 min-[1200px]:px-14 min-[1200px]:pt-[52px] min-[1200px]:pb-12">
      <p className="m-0 flex items-center gap-2.5 font-sans text-[14px] font-medium leading-none text-ink-muted">
        {stale ? (
          <>
            <Dot className="bg-line-strong" />
            Snapshot · {data.asOfDate}, {data.asOf} IST
          </>
        ) : (
          <>
            <Dot className="bg-success shadow-[0_0_0_4px_var(--success-soft)]" />
            Live feed · as of {data.asOf} IST
          </>
        )}
      </p>
      <div className="mt-3.5 mb-[26px] flex flex-col items-start gap-2 min-[1200px]:mt-[18px] min-[1200px]:mb-[34px] min-[1200px]:flex-row min-[1200px]:items-end min-[1200px]:gap-5">
        {/* plain text: NumberFlow's mask padding would add ~22 px of height at 88 px */}
        <b className={FIG}>{fmtInt(data.total)}</b>
        <span className="max-w-[250px] pb-1 font-sans text-[18px] font-semibold leading-[1.25] tracking-[-.01em] text-ink text-balance min-[1200px]:text-[22px]">
          notices in one feed, from {data.sourceCount} regulators
        </span>
      </div>

      <ul className="m-0 grid list-none gap-[18px] p-0">
        {SOURCE_ROWS.map((row, i) => {
          const value = data.bySource[row.id]
          const src = data.sources.find((x) => x.id === row.id)
          const down = src?.status === 'down'
          const ratio = armed ? 0 : value / max
          return (
            <li key={row.id} className="grid grid-cols-1 items-center gap-2 min-[1200px]:grid-cols-[230px_1fr] min-[1200px]:gap-5">
              <div className="font-sans text-[16px] font-bold leading-[1.2] text-ink">
                {SOURCE_LABEL[row.id]}
                {down && src ? (
                  <span className="mt-[3px] flex items-center gap-2 font-sans text-[13.5px] font-normal leading-[1.35] text-ink-muted">
                    <Dot className="bg-danger" />
                    {SOURCE_LABEL[row.id]} is not responding · last update {fmtIstTime(src.lastRunAt)} IST
                  </span>
                ) : (
                  <span className="mt-[3px] block font-sans text-[13.5px] font-normal leading-[1.35] text-ink-muted">{row.desc}</span>
                )}
              </div>
              <div className="relative flex h-[30px] items-center gap-3">
                <span aria-hidden="true" className="absolute -top-1 -bottom-1 left-0 w-px bg-line-strong" />
                <span
                  aria-hidden="true"
                  className={`h-[30px] min-w-1 rounded-r-[8px] ${row.fill}`}
                  style={{
                    width: `calc((100% - 70px) * ${ratio.toFixed(4)})`,
                    transition: armed ? 'none' : `width ${BAR_MS}ms var(--ease-out) ${phase === 'grown' ? i * BAR_STAGGER_MS : 0}ms`,
                  }}
                />
                <span className="font-display text-[20px] font-bold leading-none tracking-[-.01em] text-ink tabular-nums">
                  <NumberFlow value={armed ? 0 : value} locales={LOCALE} transformTiming={flowTiming} spinTiming={flowTiming} />
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-[30px] flex flex-col items-start gap-2 border-t border-line pt-5 font-sans text-[14px] leading-[1.4] text-ink-muted min-[1200px]:flex-row min-[1200px]:flex-wrap min-[1200px]:items-center min-[1200px]:gap-2.5">
        <span>
          {polls.fastNames} polled every {polls.fast}
        </span>
        <Sep />
        <span>{polls.dailyNames} daily</span>
        <Sep />
        <code className="rounded-[6px] bg-surface-2 px-2 py-[5px] font-mono text-[13px] leading-none text-ink">GET /v1/stats</code>
      </div>
    </div>
  )
}

function Sep() {
  return <span aria-hidden="true" className="hidden size-1 rounded-full bg-line-strong min-[1200px]:inline-block" />
}

export function FailedGrid({ data, row, batch, href }: { data: LandingData; row: number; batch: string; href: string }) {
  const n = data.cdscoLatest.failed
  return (
    <div className="flex flex-col border-t border-line px-5 pt-7 pb-7 min-[1200px]:border-t-0 min-[1200px]:border-l min-[1200px]:px-[52px] min-[1200px]:pt-[52px] min-[1200px]:pb-12">
      <div className={FIG}>{fmtInt(n)}</div>
      <p className="m-0 mt-3.5 mb-[26px] max-w-[330px] font-sans text-[20px] font-semibold leading-[1.3] tracking-[-.01em] text-ink">
        failed samples in the {data.cdscoLatest.label} CDSCO alert, one mark each
      </p>
      <div
        role="img"
        aria-label={`${n} marks, one per failed sample; row ${row} is highlighted`}
        className="grid max-w-[316px] grid-cols-[repeat(20,minmax(0,1fr))] gap-x-1 gap-y-1.5 min-[1200px]:max-w-none min-[1200px]:grid-cols-[repeat(20,13px)] min-[1200px]:gap-y-[7px]"
      >
        {Array.from({ length: n }, (_, i) => (
          <i
            key={i}
            className={
              'block h-[7px] w-full rounded-[4px] min-[1200px]:h-2 min-[1200px]:w-[13px] ' +
              (i + 1 === row ? 'bg-danger shadow-[0_0_0_3px_#fff,0_0_0_5px_var(--danger)]' : 'bg-(--unit-mark)')
            }
          />
        ))}
      </div>
      <p className="m-0 mt-[22px] flex items-center gap-2.5 font-sans text-[14px] font-medium leading-[1.4] text-ink">
        <span aria-hidden="true" className="h-2 w-3.5 flex-none rounded-[4px] bg-danger" />
        <span>
          Row {row} is batch {batch} <span className="font-normal text-ink-muted">· the strip in the demo household</span>
        </span>
      </p>
      <Link
        href={href}
        className="mt-auto inline-flex min-h-11 w-fit items-center gap-2 rounded-sm pt-6 font-sans text-[15px] font-semibold leading-[1.2] text-cobalt transition-colors duration-150 hover:text-cobalt-hover"
      >
        See all {n} in the feed
        <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
      </Link>
    </div>
  )
}
