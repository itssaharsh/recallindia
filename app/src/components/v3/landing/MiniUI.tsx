'use client'
/**
 * How-it-works mini UI (landing.md §5.2): small, real-looking pieces of the app drawn in HTML.
 * Each root is role="img" with an aria-label; inner "buttons" are spans, not controls.
 * Desktop (≥ 1200) positions them absolutely inside the 1344 × 760 composition; stacked layouts
 * put them in flow, full width, 18 px under their caption. Refs expose the boxes the wires attach to.
 */
import { motion } from 'framer-motion'
import type { Ref } from 'react'
import { Card, Chip, Dot, FoilChip } from '../ui'
import { AlertGlyph, KindTile, MedicineGlyph, TickDisc } from './glyphs'
import { alertSourceLine, fmtAlertMonth, fmtDay, lowerReason, nb, NOTICE_SOURCE_LABEL } from './format'
import { Seal } from './Seal'
import s from './landing.module.css'
import type { FeedNeighbour, HouseholdItem, LandingStory, NoticeLite } from './types'

/** Decorative bar widths (%) for the unreadable rows of the PDF page, per column. */
const BARS: Record<number, number[]> = {
  [-3]: [84, 80, 88, 74, 78],
  [-2]: [66, 74, 72, 90, 60],
  [-1]: [92, 84, 80, 62, 78],
  1: [78, 66, 94, 80, 66],
  2: [60, 84, 70, 70, 78],
  3: [86, 74, 84, 86, 60],
}
/** Columns 4 (Manufacturer) and 6 (Tested by) are hidden on phones. */
const WIDE_COL = [false, false, false, true, false, true]

// ------------------------------------------------------------------ MiniPdf

export function MiniPdf({ notice, pdf, hitRef }: { notice: NoticeLite; pdf: LandingStory['pdf']; hitRef?: Ref<HTMLDivElement> }) {
  const row = notice.row_ref?.row ?? 0
  const month = notice.row_ref ? fmtAlertMonth(notice.row_ref.month) : ''
  const cells = [String(row), notice.product, notice.batches[0] ?? '', notice.brand ?? '', notice.hazard_or_failed_test ?? '', notice.lab ?? '']
  const label =
    `CDSCO ${month} alert PDF, row ${row} highlighted: ${notice.product}, batch ${cells[2]}, ${cells[3]}, ` +
    `failed ${cells[4]}, tested by ${cells[5]}`
  return (
    <div
      role="img"
      aria-label={label}
      className={`${s.pdfCard} relative mt-[18px] w-full rounded-[6px] bg-white px-4 pt-4 pb-2.5 shadow-[0_1px_0_rgb(11_27_51/.05),0_2px_6px_rgb(11_27_51/.08),0_24px_48px_-20px_rgb(11_27_51/.30)] min-[1200px]:absolute min-[1200px]:top-[112px] min-[1200px]:left-0 min-[1200px]:mt-0 min-[1200px]:h-[278px] min-[1200px]:w-[460px] min-[1200px]:-rotate-[1.2deg] min-[1200px]:pb-0`}
    >
      <div className="mb-2.5 flex items-start gap-2.5">
        <span className="grid size-[22px] flex-none place-items-center rounded-full border-[1.5px] border-(--pdf-rule) font-sans text-[7px] font-bold leading-none text-(--pdf-muted)">
          CDSCO
        </span>
        <div className="font-sans text-[8.5px] font-bold uppercase leading-[1.25] tracking-[.01em] text-(--pdf-ink)">
          {pdf.title}
          <span className="mt-0.5 block font-medium normal-case tracking-normal text-(--pdf-muted)">{pdf.subtitle}</span>
        </div>
        <span className="ml-auto whitespace-nowrap font-mono text-[9px] leading-none text-(--pdf-faint)">{pdf.fileName}</span>
      </div>
      <table className={s.pdfTable}>
        <colgroup>
          <col className="w-4" />
          <col className="w-[132px]" />
          <col className="w-[44px] min-[701px]:w-[40px] min-[1200px]:w-[38px]" />
          <col className={`${s.wide} w-[101px]`} />
          <col />
          <col className={`${s.wide} w-[58px]`} />
        </colgroup>
        <thead>
          <tr>
            {['#', 'Name of drug', 'Batch', 'Manufacturer', 'Reason', 'Tested by'].map((h, i) => (
              <th key={h} scope="col" className={WIDE_COL[i] ? s.wide : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[-3, -2, -1, 0, 1, 2, 3].map((d) =>
            d === 0 ? (
              <tr key={d} className={s.hit}>
                {cells.map((c, i) => (
                  <td key={i} className={WIDE_COL[i] ? s.wide : undefined}>
                    {i === 0 ? (
                      <>
                        {c}
                        <div ref={hitRef} className={s.hitBox}>
                          <span className="absolute -top-[21px] -right-0.5 h-[19px] rounded-t-[5px] bg-cobalt px-2 font-sans text-[10.5px] font-bold leading-[19px] text-white">
                            Row {row}
                          </span>
                        </div>
                      </>
                    ) : (
                      c
                    )}
                  </td>
                ))}
              </tr>
            ) : (
              <tr key={d}>
                <td>{row + d}</td>
                {BARS[d].map((w, i) => (
                  <td key={i} className={WIDE_COL[i + 1] ? s.wide : undefined}>
                    <i style={{ width: `${w}%` }} />
                  </td>
                ))}
              </tr>
            ),
          )}
        </tbody>
      </table>
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[34px] rounded-b-[6px] bg-[linear-gradient(transparent,#fff_80%)]" />
    </div>
  )
}

// ------------------------------------------------------------------ MiniFeed

const SOURCE_INK: Record<NoticeLite['source'], string> = {
  cdsco_nsq: 'text-cobalt',
  cpsc: 'text-(--src-cpsc-ink)',
  // category colours are never text: the other two sources use AA inks
  openfda: 'text-ink-muted',
  nhtsa: 'text-warning',
}

function NeighbourRow({ row }: { row: FeedNeighbour }) {
  const n = row.notice
  return (
    <div className="flex h-[50px] items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-[12px] border border-line bg-surface-1 px-3.5 font-sans text-[13px] font-medium leading-none">
      <b className={`inline-flex flex-none items-center gap-1.5 text-[11px] font-bold tracking-[.04em] ${SOURCE_INK[n.source]}`}>
        <Dot className="size-[7px]! bg-current" />
        {NOTICE_SOURCE_LABEL[n.source]}
      </b>
      <span className="min-w-0 truncate text-ink">
        {n.product}
        {n.row_ref ? ` · row ${n.row_ref.row}` : ''}
      </span>
      <em className="ml-auto flex-none text-[12.5px] not-italic text-ink-muted">{row.dateLabel}</em>
    </div>
  )
}

export function MiniFeed({
  notice,
  neighbours,
  cardRef,
}: {
  notice: NoticeLite
  neighbours: LandingStory['neighbours']
  cardRef?: Ref<HTMLDivElement>
}) {
  const r = notice.row_ref
  const label =
    `Feed notice: ${NOTICE_SOURCE_LABEL[notice.source]} ${r?.month ?? ''} row ${r?.row ?? ''}, ${notice.product}, ` +
    `batch ${notice.batches[0] ?? ''}, failed ${notice.hazard_or_failed_test ?? ''}, published ${fmtDay(notice.published_at)}`
  return (
    <div
      role="img"
      aria-label={label}
      className="relative mt-[18px] w-full min-[1200px]:absolute min-[1200px]:top-[112px] min-[1200px]:left-0 min-[1200px]:mt-0 min-[1200px]:w-[360px]"
    >
      <NeighbourRow row={neighbours.before} />
      <div ref={cardRef} className="my-2.5">
        <Card className="border-[1.5px]! border-cobalt! px-[18px] py-4 shadow-2!">
          <div className="flex items-center gap-2 font-sans text-[13px] font-medium leading-none text-ink-muted">
            <Chip tone="info" className="h-6! gap-1.5! px-[9px]! text-[11px]! font-bold! tracking-[.05em]!">
              <MedicineGlyph size={12} />
              {NOTICE_SOURCE_LABEL[notice.source]}
            </Chip>
            {r ? `${r.month} · row ${r.row}` : notice.notice_id}
            <span className="ml-auto">{fmtDay(notice.published_at)}</span>
          </div>
          <div className="mt-3 mb-[3px] font-sans text-[18px] font-bold leading-[1.25] tracking-[-.01em] text-ink">{notice.product}</div>
          <div className="font-sans text-[14px] leading-[1.4] text-ink-muted">
            {notice.brand}
            {notice.maker_place ? ` · ${notice.maker_place}` : ''}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FoilChip code={notice.batches[0] ?? ''} size="sm" className="rounded-[7px]! px-[9px]!" />
            <span className="inline-flex h-7 items-center rounded-pill bg-surface-2 px-2.5 font-sans text-[13px] font-medium leading-none text-ink">
              Failed: {notice.hazard_or_failed_test}
            </span>
          </div>
        </Card>
      </div>
      <NeighbourRow row={neighbours.after} />
    </div>
  )
}

// ------------------------------------------------------------------ ScanHint

/** Word boxes in the 460 × 178 desktop crop; stacked crops shift the photo 16 px left and 3 px up, so do the boxes. */
const WORDS = [
  { left: 68, top: 82, w: 80, h: 30, hit: false },
  { left: 161, top: 111, w: 108, h: 36, hit: true },
  { left: 306, top: 151, w: 56, h: 28, hit: false },
]

export function ScanHint({
  batch,
  photo,
  scanRef,
  wordRef,
}: {
  batch: string
  /** The cropped light strip photo (assets/scan-strip.webp → public/strip/scan-strip.webp). */
  photo: string
  scanRef?: Ref<HTMLDivElement>
  wordRef?: Ref<HTMLSpanElement>
}) {
  const corner = 'absolute z-[1] size-[26px] border-[3px] border-white'
  return (
    <div
      ref={scanRef}
      role="img"
      aria-label={`Phone camera view of the strip; Textract found batch ${batch}`}
      className={`${s.scan} relative mt-[18px] h-[170px] w-full overflow-hidden rounded-md shadow-1 min-[1200px]:absolute min-[1200px]:top-[112px] min-[1200px]:left-0 min-[1200px]:mt-0 min-[1200px]:h-[178px] min-[1200px]:w-[460px]`}
      style={{ backgroundImage: `url(${photo})` }}
    >
      <span className={`${corner} top-3.5 left-3.5 rounded-tl-[6px] border-r-0 border-b-0`} />
      <span className={`${corner} top-3.5 right-3.5 rounded-tr-[6px] border-b-0 border-l-0`} />
      <span className={`${corner} bottom-3.5 left-3.5 rounded-bl-[6px] border-t-0 border-r-0`} />
      <span className={`${corner} right-3.5 bottom-3.5 rounded-br-[6px] border-t-0 border-l-0`} />
      <div className="absolute inset-0 z-[1] -translate-x-4 -translate-y-[3px] min-[1200px]:translate-none">
        {WORDS.map((w) => (
          <span
            key={w.left}
            ref={w.hit ? wordRef : undefined}
            className={
              'absolute rotate-[17.7deg] rounded-[3px] ' +
              (w.hit ? 'border-2 border-cobalt bg-cobalt/12' : 'border-[1.5px] border-cobalt/55')
            }
            style={{ left: w.left, top: w.top, width: w.w, height: w.h }}
          />
        ))}
      </div>
      <span className="absolute bottom-4 left-[18px] z-[2] flex h-[30px] items-center gap-2 rounded-pill bg-white pr-3 pl-2.5 font-sans text-[13px] font-semibold leading-none text-ink shadow-1">
        <Dot className="bg-cobalt" />
        Batch found: {batch}
      </span>
    </div>
  )
}

// ------------------------------------------------------------------ MiniItem

export function MiniItem({ item, sourceCount, itemRef }: { item: HouseholdItem; sourceCount: number; itemRef?: Ref<HTMLDivElement> }) {
  const bought = item.purchase_date ? nb(`bought ${fmtDay(item.purchase_date)}`) : ''
  return (
    <div
      ref={itemRef}
      role="img"
      aria-label={`Your list: ${item.name}, batch ${item.batch ?? ''}, checking ${sourceCount} sources`}
      className="relative mt-[18px] w-full min-[1200px]:absolute min-[1200px]:top-[124px] min-[1200px]:left-0 min-[1200px]:mt-0 min-[1200px]:w-[360px]"
    >
      <Card className="px-[18px] py-4 shadow-2!">
        <div className="flex items-start gap-3">
          <KindTile kind={item.kind} />
          <div>
            <div className="mt-px mb-[3px] font-sans text-[17px] font-bold leading-[1.25] tracking-[-.01em] text-ink">{item.name}</div>
            <div className="font-sans text-[13.5px] leading-[1.35] text-ink-muted">
              {nb(item.brand ?? '')}
              {bought ? ` · ${bought}` : ''}
            </div>
          </div>
        </div>
        <div className="mt-3.5 flex items-center gap-2.5 border-t border-line pt-3.5">
          <span className="font-sans text-[12px] font-medium uppercase leading-none tracking-[.06em] text-ink-muted">Batch</span>
          <FoilChip code={item.batch ?? ''} size="md" className="text-[21px]!" />
          <span className="ml-auto inline-flex items-center gap-[7px] font-sans text-[13px] font-medium leading-none text-cobalt">
            {/* a picture of the checking ring: it does not spin */}
            <span aria-hidden="true" className="size-3.5 rounded-full border-2 border-cobalt-soft border-t-cobalt" />
            Checking {sourceCount} sources
          </span>
        </div>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------------ MiniAlert

/** A miniature of the /mine alert face: solid red band, white "On a notice" badge, the verdict. */
export function MiniAlert({
  notice,
  item,
  daysAfter,
  pulse = 0,
  alertRef,
}: {
  notice: NoticeLite
  item: HouseholdItem
  daysAfter: number
  /** Increment to play the 200 ms badge pulse (the tracer's arrival). */
  pulse?: number
  alertRef?: Ref<HTMLDivElement>
}) {
  const reason = lowerReason(notice.hazard_or_failed_test)
  const src = alertSourceLine(notice)
  return (
    <div
      ref={alertRef}
      role="img"
      aria-label={`On a notice: your batch ${item.batch ?? ''} failed a ${reason}, ${src.replace(/ · /g, ' ')}`}
      className="relative mt-[18px] w-full min-[1200px]:absolute min-[1200px]:top-[112px] min-[1200px]:left-0 min-[1200px]:mt-0 min-[1200px]:w-[344px]"
    >
      <Card className="overflow-hidden border-danger/28! shadow-[0_2px_4px_rgb(11_27_51/.05),0_22px_44px_-20px_rgb(179_18_30/.45)]!">
        <div className="flex h-12 items-center gap-2 bg-danger px-[18px]">
          <motion.span
            key={pulse}
            initial={{ scale: 1 }}
            animate={pulse ? { scale: [1, 1.06, 1] } : { scale: 1 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="inline-flex h-[26px] items-center gap-1.5 rounded-pill bg-white pr-2.5 pl-2 font-sans text-[12px] font-bold uppercase leading-none tracking-[.04em] text-danger"
          >
            <AlertGlyph size={14} />
            On a notice
          </motion.span>
          <span className="ml-auto whitespace-nowrap font-sans text-[12.5px] font-medium leading-none text-(--band-muted)">{src}</span>
        </div>
        <div className="px-[18px] pt-3.5 pb-[18px]">
          <div className="mb-1.5 font-sans text-[17px] font-bold leading-[1.3] tracking-[-.01em] text-ink text-balance">
            Your batch {item.batch} failed a {reason}
          </div>
          <p className="m-0 font-sans text-[14px] leading-[1.45] text-ink-muted">
            You bought it on <b className="font-semibold text-ink">{item.purchase_date ? nb(fmtDay(item.purchase_date)) : ''}</b>, {daysAfter} days
            after the alert was published.
          </p>
          <div className="mt-3.5 flex gap-2">
            <span className="inline-flex h-10 items-center whitespace-nowrap rounded-pill bg-cobalt px-4 font-sans text-[14px] font-semibold leading-none text-on-cobalt">
              Approve and seal evidence
            </span>
            <span className="inline-flex h-10 items-center whitespace-nowrap rounded-pill border border-line bg-surface-1 px-4 font-sans text-[14px] font-semibold leading-none text-ink">
              Not mine
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------------ SealSteps

export function SealSteps({
  pipelineSeconds,
  lockDays,
  row,
  sealRef,
}: {
  pipelineSeconds: number
  lockDays: number
  row: number
  sealRef?: Ref<HTMLDivElement>
}) {
  const steps = [
    { t: 'Evidence sealed', d: `S3 Object Lock, ${lockDays} days` },
    { t: 'Claim letter written', d: `Cites row ${row} as published` },
    { t: 'Signature verified', d: 'AWS KMS' },
  ]
  const secs = pipelineSeconds.toFixed(1)
  return (
    <div
      role="img"
      aria-label={`After approval: evidence sealed, claim letter written, signature verified, in ${pipelineSeconds} seconds`}
      className="relative mt-[22px] grid w-full grid-cols-[112px_1fr] items-center gap-[18px] min-[1200px]:absolute min-[1200px]:top-[508px] min-[1200px]:left-0 min-[1200px]:mt-0 min-[1200px]:w-[344px] min-[1200px]:grid-cols-[132px_1fr]"
    >
      <div ref={sealRef} className="-rotate-8">
        <Seal size={132} className="block size-[112px] min-[1200px]:size-[132px]" />
      </div>
      <ol className="m-0 grid list-none gap-2.5 p-0">
        {steps.map((st) => (
          <li key={st.t} className="flex items-start gap-2.5 font-sans text-[14px] font-medium leading-[1.35] text-ink">
            <TickDisc />
            <div>
              {st.t}
              <span className="block text-[12.5px] font-normal text-ink-muted">{st.d}</span>
            </div>
          </li>
        ))}
      </ol>
      <div className="col-span-2 flex items-center gap-2.5 border-t border-dashed border-line pt-3.5 font-sans text-[13.5px] font-medium leading-[1.3] text-ink-muted">
        <b className="font-display text-[20px] font-extrabold leading-none tracking-[-.02em] text-ink">{secs} s</b>
        end to end in the demo case
      </div>
    </div>
  )
}
