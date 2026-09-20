'use client'
/**
 * How it works (landing.md §5): one batch's journey as real mini UI, two lanes merging into step 3.
 * Desktop (≥ 1200): a fixed 1344 × 760 composition, scaled by k = contentWidth / 1344 below 1440,
 * with FlowConnectors measured from the DOM and a single tracer that runs once at ≥ 40 % visibility.
 * Stacked (≤ 1199): one column with lane labels and dashed vertical connectors, order 1, 2, house, 3.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { lowerReason } from './format'
import { HouseGlyph } from './glyphs'
import { MiniAlert, MiniFeed, MiniItem, MiniPdf, ScanHint, SealSteps } from './MiniUI'
import { cubicBezier, EASE_TRACER, TRACER_MS } from './motion'
import s from './landing.module.css'
import { H2, LEDE } from './styles'
import type { LandingData, LandingState, LandingStory } from './types'

export interface HowItWorksProps {
  data: Pick<LandingData, 'cdscoLatest' | 'sourceCount' | 'pipelineSeconds'>
  story: LandingStory
  state: LandingState
  /** Photo for ScanHint (the light strip render). */
  scanPhoto: string
}

// ------------------------------------------------------------------ geometry

type Box = { l: number; t: number; r: number; b: number; cx: number; cy: number }
type Geom = { hit: Box; feed: Box; word: Box; scan: Box; item: Box; alert: Box; seal: Box }
const box = (l: number, t: number, w: number, h: number): Box => ({ l, t, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2 })

/** Measured from the 1536 mockup at k = 1, so the server HTML already has wires (re-measured on the client). */
const DEFAULT_GEOM: Geom = {
  hit: box(10, 245.4, 440.5, 37.2),
  feed: box(540, 172, 360, 155.1),
  word: box(158.1, 659.4, 113.8, 67.1),
  scan: box(0, 564, 460, 178),
  item: box(540, 576, 360, 158.7),
  alert: box(1000, 112, 344, 226.8),
  seal: box(991.5, 499.5, 149.1, 149.1),
}

type Pt = [number, number]
const curve = ([x1, y1]: Pt, [x2, y2]: Pt) => {
  const m = (x2 - x1) / 2
  return `C${x1 + m} ${y1} ${x2 - m} ${y2} ${x2} ${y2}`
}
const f = (n: number) => Math.round(n * 10) / 10

/** FlowConnectors (§5.3): cubic Béziers with horizontal tangents, merging at a junction before step 3. */
function wiresFrom(g: Geom) {
  const a1: Pt = [f(g.hit.r + 2), f(g.hit.cy)]
  const b1: Pt = [f(g.feed.l - 4), f(g.feed.cy)]
  const a2: Pt = [f(g.scan.r + 2), f(g.word.cy)]
  const b2: Pt = [f(g.item.l - 4), f(g.item.cy)]
  const a3: Pt = [f(g.feed.r + 4), f(g.feed.cy)]
  const a4: Pt = [f(g.item.r + 4), f(g.item.cy)]
  const j: Pt = [f(g.feed.r + (g.alert.l - g.feed.r) / 2), f(g.alert.t + 70)]
  const aIn: Pt = [f(g.alert.l - 4), j[1]]
  const sx = f(g.seal.cx)
  const v0: Pt = [sx, f(g.alert.b + 4)]
  const v1: Pt = [sx, f(g.seal.t - 8)]
  const vTip: Pt = [sx, f(g.seal.t - 2)]
  const toAlert = `M${a1[0]} ${a1[1]} ${curve(a1, b1)} L${a3[0]} ${a3[1]} ${curve(a3, j)} L${aIn[0]} ${aIn[1]}`
  return {
    paths: [
      `M${a1[0]} ${a1[1]} ${curve(a1, b1)}`,
      `M${a2[0]} ${a2[1]} ${curve(a2, b2)}`,
      `M${a3[0]} ${a3[1]} ${curve(a3, j)}`,
      `M${a4[0]} ${a4[1]} ${curve(a4, j)}`,
      `M${j[0]} ${j[1]} L${aIn[0]} ${aIn[1]}`,
      `M${v0[0]} ${v0[1]} L${v1[0]} ${v1[1]}`,
    ],
    starts: [a1, a2, a3, a4, v0],
    arrowsRight: [b1, b2, aIn],
    arrowDown: vTip,
    junction: j,
    /** label centres (landing.md §5.3): the match pill rides the rising wire; "After you approve" sits 78 px right */
    matchLabel: [j[0] - 14, (g.feed.b + g.item.t) / 2 + 10] as Pt,
    afterLabel: [sx + 78, (g.alert.b + g.seal.t) / 2] as Pt,
    /** row 12 → feed card → junction → alert card → (behind the card) → seal */
    tracer: `${toAlert} L${v0[0]} ${v0[1]} L${vTip[0]} ${vTip[1]}`,
    toAlert,
  }
}

// ------------------------------------------------------------------ component

export function HowItWorks({ data, story, state, scanPhoto }: HowItWorksProps) {
  const n = story.notice
  const row = n.row_ref?.row ?? 0
  const batch = n.batches[0] ?? ''

  const fitRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const hitRef = useRef<HTMLDivElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const scanRef = useRef<HTMLDivElement>(null)
  const wordRef = useRef<HTMLSpanElement>(null)
  const itemRef = useRef<HTMLDivElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const sealRef = useRef<HTMLDivElement>(null)
  const tracerRef = useRef<HTMLSpanElement>(null)

  const [k, setK] = useState(1)
  const [geom, setGeom] = useState<Geom>(DEFAULT_GEOM)
  const [pulse, setPulse] = useState(0)
  const [tracer, setTracer] = useState<'idle' | 'running' | 'arrived' | 'gone'>(state === 'traced' ? 'arrived' : 'idle')
  // 'arrived' is only used by ?state=traced: the dot stays at the seal.
  const w = wiresFrom(geom)

  /** Measure every anchor in unscaled composition units (divide by k). Desktop only. */
  const measure = useCallback(() => {
    const fit = fitRef.current
    const flow = flowRef.current
    if (!fit || !flow || !window.matchMedia('(min-width: 1200px)').matches) return
    const kk = Math.min(1, fit.clientWidth / 1344)
    fit.style.setProperty('--k', String(kk)) // apply now so the rects below are read at this scale
    setK(kk)
    const fr = flow.getBoundingClientRect()
    const R = (el: Element | null): Box | null => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return box((r.left - fr.left) / kk, (r.top - fr.top) / kk, r.width / kk, r.height / kk)
    }
    const next = {
      hit: R(hitRef.current),
      feed: R(feedRef.current),
      word: R(wordRef.current),
      scan: R(scanRef.current),
      item: R(itemRef.current),
      alert: R(alertRef.current),
      seal: R(sealRef.current),
    }
    if (Object.values(next).every(Boolean)) setGeom(next as Geom)
  }, [])

  // k and wires: on layout, font load and resize.
  useEffect(() => {
    const fit = fitRef.current
    if (!fit) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(fit)
    void document.fonts?.ready.then(measure)
    return () => ro.disconnect()
  }, [measure])

  // Tracer: once per page view, desktop, not reduced motion, when the flow is ≥ 40 % visible.
  useEffect(() => {
    if (state === 'traced') {
      setTracer('arrived')
      return
    }
    const fit = fitRef.current
    if (!fit) return
    const ok = () =>
      window.matchMedia('(min-width: 1200px)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && state !== 'reduced' && state !== 'static'
    let raf = 0
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || !ok()) return
        io.disconnect()
        run()
      },
      { threshold: 0.4 },
    )
    io.observe(fit)

    function run() {
      const el = tracerRef.current
      if (!el) return
      // Position with getPointAtLength rather than offset-path: same path and timing, and no engine
      // differences in where path() puts its origin.
      const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      probe.setAttribute('d', el.dataset.toAlert ?? '')
      const toAlert = probe.getTotalLength()
      probe.setAttribute('d', el.dataset.path ?? '')
      const total = probe.getTotalLength()
      const alertAt = total > 0 ? toAlert / total : 1
      const ease = cubicBezier(...EASE_TRACER)
      const t0 = performance.now()
      let pulsed = false
      setTracer('running')
      const tick = () => {
        const p = ease(Math.min(1, (performance.now() - t0) / TRACER_MS))
        const pt = probe.getPointAtLength(p * total)
        el.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px)`
        if (!pulsed && p >= alertAt) {
          pulsed = true
          setPulse((x) => x + 1) // "On a notice" badge: 1 → 1.06 → 1 in 200 ms
        }
        if (p < 1) raf = requestAnimationFrame(tick)
        else setTracer('gone') // fades out over 200 ms at the seal
      }
      raf = requestAnimationFrame(tick)
    }
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [state])

  const fitStyle = { '--k': k } as CSSProperties
  const [ex, ey] = tracer === 'idle' || tracer === 'running' ? w.starts[0] : w.arrowDown
  const tracerStyle: CSSProperties = {
    // While running, the rAF loop writes transform to the DOM. React only writes when this string
    // changes, and it stays the start point until the run ends.
    transform: `translate(${ex}px, ${ey}px)`,
    opacity: tracer === 'running' || tracer === 'arrived' ? 1 : 0,
    transition: tracer === 'gone' ? 'opacity 200ms ease-out' : 'none',
  }

  return (
    <section
      id="how"
      aria-labelledby="how-h"
      className="relative scroll-mt-[88px] pt-16 pb-[72px] min-[1200px]:pt-[120px] min-[1200px]:pb-32"
    >
      <div className={s.wrap}>
        <div className="mb-9 grid grid-cols-1 gap-4 min-[1200px]:mb-16 min-[1200px]:grid-cols-[1fr_440px] min-[1200px]:items-end min-[1200px]:gap-16">
          <h2 id="how-h" className={`${H2} max-w-[780px]`}>
            Follow one batch from a government PDF to your claim letter.
          </h2>
          <p className={LEDE}>
            In {data.cdscoLatest.label}, <b className="font-semibold text-ink">batch {batch}</b> of {n.product} failed a{' '}
            {lowerReason(n.hazard_or_failed_test)}. Here is how that one line in a PDF reaches the people holding the strip.
          </p>
        </div>

        <div ref={fitRef} className={s.flowFit} style={fitStyle}>
          <div ref={flowRef} className={`${s.flow} flex flex-col`}>
            <LaneLabel>Notices</LaneLabel>
            <span aria-hidden="true" className={`${s.lane} top-[120px] hidden font-sans text-[12px] font-bold uppercase leading-none tracking-[.12em] text-cobalt min-[1200px]:block`}>
              Notices
            </span>
            <span aria-hidden="true" className={`${s.lane} top-[512px] hidden font-sans text-[12px] font-bold uppercase leading-none tracking-[.12em] text-cobalt min-[1200px]:block`}>
              Your house
            </span>

            <svg
              aria-hidden="true"
              width={1344}
              height={760}
              viewBox="0 0 1344 760"
              className="pointer-events-none absolute inset-0 z-0 hidden overflow-visible min-[1200px]:block"
            >
              <g fill="none" className="stroke-cobalt" strokeWidth={2} strokeDasharray="5 6" strokeLinecap="round">
                {w.paths.map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
              {w.starts.map(([x, y]) => (
                <circle key={`${x},${y}`} cx={x} cy={y} r={4.5} className="fill-white stroke-cobalt" strokeWidth={2} />
              ))}
              {w.arrowsRight.map(([x, y]) => (
                <path key={`${x},${y}`} d={`M${x} ${y} l-9 -5 v10z`} className="fill-cobalt" />
              ))}
              <path d={`M${w.arrowDown[0]} ${w.arrowDown[1]} l-5 -9 h10z`} className="fill-cobalt" />
              <circle cx={w.junction[0]} cy={w.junction[1]} r={5} className="fill-cobalt" />
            </svg>
            <span
              ref={tracerRef}
              aria-hidden="true"
              data-path={w.tracer}
              data-to-alert={w.toAlert}
              className={`${s.tracer} hidden min-[1200px]:block`}
              style={tracerStyle}
            />

            {/* 1 · CDSCO publishes a PDF */}
            <Step className="min-[1200px]:top-0 min-[1200px]:left-0 min-[1200px]:w-[460px]">
              <Caption n={1} title="CDSCO publishes a PDF">
                Every month, a list of drug samples that failed quality tests. {data.cdscoLatest.label} had{' '}
                <b className="font-semibold text-ink">{data.cdscoLatest.failed} rows</b>.
              </Caption>
              <MiniPdf notice={n} pdf={story.pdf} hitRef={hitRef} />
            </Step>
            <VConn label="Textract reads every row" />

            {/* 2 · Every row becomes a notice */}
            <Step className="min-[1200px]:top-0 min-[1200px]:left-[540px] min-[1200px]:w-[360px]">
              <Caption n={2} title="Every row becomes a notice">
                Textract reads the table. Each row is cleaned up and published to the feed and the public API.
              </Caption>
              <MiniFeed notice={n} neighbours={story.neighbours} cardRef={feedRef} />
            </Step>

            <LaneLabel className="mt-14">Your house</LaneLabel>
            {/* house · Meanwhile, you add what you own */}
            <Step className="min-[1200px]:top-[452px] min-[1200px]:left-0 min-[1200px]:w-[460px]">
              <Caption n="house" title="Meanwhile, you add what you own">
                Photograph the strip. Textract finds the batch and it becomes a chip on your list.
              </Caption>
              <ScanHint batch={story.item.batch ?? batch} photo={scanPhoto} scanRef={scanRef} wordRef={wordRef} />
            </Step>
            <VConn />
            <Step className="min-[1200px]:top-[452px] min-[1200px]:left-[540px] min-[1200px]:w-[360px]">
              <MiniItem item={story.item} sourceCount={data.sourceCount} itemRef={itemRef} />
            </Step>
            <VConn label={<MatchLabelInner batch={batch} />} match />

            {/* 3 · A match waits for you */}
            <Step className="min-[1200px]:top-0 min-[1200px]:left-[1000px] min-[1200px]:w-[344px]">
              <Caption n={3} title="A match waits for you">
                Nothing happens until you approve. Then the notice is sealed as evidence and your claim letter is written.
              </Caption>
              <MiniAlert notice={n} item={story.item} daysAfter={story.case.sold_after_notice} pulse={pulse} alertRef={alertRef} />
              <SealSteps pipelineSeconds={data.pipelineSeconds} lockDays={story.case.evidence.lock_days} row={row} sealRef={sealRef} />
            </Step>

            {/* wire labels (desktop) */}
            <WireLabel at={w.afterLabel}>After you approve</WireLabel>
            <WireLabel at={w.matchLabel} match>
              <MatchLabelInner batch={batch} />
            </WireLabel>
          </div>
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ parts

function Step({ className, children }: { className: string; children: ReactNode }) {
  return <div className={`relative min-[1200px]:absolute ${className}`}>{children}</div>
}

function Caption({ n, title, children }: { n: number | 'house'; title: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[34px_1fr] items-start gap-x-3.5 gap-y-1">
      {n === 'house' ? (
        <span aria-hidden="true" className="row-span-2 grid size-[34px] place-items-center rounded-full bg-cobalt-soft text-cobalt shadow-[inset_0_0_0_1.5px_var(--cobalt)]">
          <HouseGlyph size={18} />
        </span>
      ) : (
        <span aria-hidden="true" className="row-span-2 grid size-[34px] place-items-center rounded-full bg-cobalt font-display text-[17px] font-bold leading-none text-white">
          {n}
        </span>
      )}
      <h3 className="m-0 mt-[5px] font-sans text-[18px] font-bold leading-[1.25] tracking-[-.01em] text-ink min-[1200px]:text-[20px]">
        {n !== 'house' ? <span className="sr-only">Step {n}. </span> : null}
        {title}
      </h3>
      <p className="m-0 max-w-[380px] font-sans text-[14.5px] leading-[1.5] text-ink-muted min-[1200px]:text-[15px]">{children}</p>
    </div>
  )
}

/** Horizontal lane label on stacked layouts; kept for screen readers on desktop, where the vertical ones show. */
function LaneLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mb-5 flex items-center gap-3 font-sans text-[12px] font-semibold uppercase leading-none tracking-[.12em] text-ink-muted min-[1200px]:sr-only ${className}`}>
      {children}
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </div>
  )
}

const PILL = 'inline-flex items-center whitespace-nowrap rounded-pill font-sans font-semibold leading-none'
const PILL_PLAIN = `${PILL} h-[26px] gap-1.5 border border-line bg-white px-[11px] text-[12px] text-ink-muted shadow-1`
const PILL_MATCH = `${PILL} h-8 gap-2 border border-cobalt bg-cobalt px-[13px] text-[13px] text-white shadow-1`

function MatchLabelInner({ batch }: { batch: string }) {
  return (
    <>
      Same batch <span className="font-foil text-[14px] font-black leading-none tracking-[.06em]">{batch}</span>
    </>
  )
}

function VConn({ label, match = false }: { label?: ReactNode; match?: boolean }) {
  return (
    <div aria-hidden={label ? undefined : true} className={`${s.vconn} ${label ? s.vconnLabel : ''}`}>
      {label ? <span className={`absolute top-1/2 -translate-y-[60%] ${match ? PILL_MATCH : PILL_PLAIN}`}>{label}</span> : null}
    </div>
  )
}

function WireLabel({ at, match = false, children }: { at: Pt; match?: boolean; children: ReactNode }) {
  return (
    <span
      className={`absolute z-[2] hidden -translate-x-1/2 -translate-y-1/2 min-[1200px]:inline-flex ${match ? PILL_MATCH : PILL_PLAIN}`}
      style={{ left: at[0], top: at[1] }}
    >
      {children}
    </span>
  )
}
