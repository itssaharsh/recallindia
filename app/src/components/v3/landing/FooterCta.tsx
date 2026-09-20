/**
 * Footer CTA (landing.md §8): cobalt, rounded top overlapping the artifact section by the sheet radius.
 * H2 + sub + CTAs + API line on the left, the demo household preview on the right (the same records
 * and words /mine uses), then "Built on AWS" and the legal row with the footer nav.
 */
import Link from 'next/link'
import { Button, Chip, type ChipTone } from '../ui'
import { fmtAlertMonth, householdCounts, NOTICE_SOURCE_LABEL } from './format'
import { KindTile, LogoMark } from './glyphs'
import s from './landing.module.css'
import { CTA_XL } from './styles'
import type { HouseholdItem, LandingData, LandingLinks, LandingStory, NoticeLite } from './types'

export interface FooterCtaProps {
  data: Pick<LandingData, 'sourceCount' | 'asOf'>
  story: Pick<LandingStory, 'household'>
  links: Pick<LandingLinks, 'mine' | 'feed' | 'api' | 'ingest'>
}

export const AWS_SERVICES = ['EventBridge', 'Lambda', 'Step Functions', 'Textract', 'DynamoDB', 'S3 Object Lock', 'KMS', 'API Gateway', 'Amplify'] as const

export function FooterCta({ data, story, links }: FooterCtaProps) {
  const hh = story.household
  const count = householdCounts(hh.items)
  return (
    <footer data-surface="cobalt" className={`${s.footer} text-on-cobalt`}>
      <div className={`${s.wrap} pt-16 min-[1200px]:pt-28`}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 min-[1200px]:grid-cols-[1fr_520px] min-[1200px]:items-center min-[1200px]:gap-20">
          <div className="min-w-0">
            <h2 className="m-0 font-display text-[48px] font-extrabold leading-[.98] tracking-[-.04em] text-white min-[701px]:text-[64px] min-[1200px]:text-[80px]">
              Check what you own.
            </h2>
            <p className="mt-[22px] mb-[34px] max-w-[540px] font-sans text-[16px] leading-[1.5] text-on-cobalt-muted min-[1200px]:text-[19px]">
              Open the demo household: {count.total} things checked against {data.sourceCount} sources, with {count.onNotice} on a notice. Or make your
              own copy and add your strips, your car and your appliances.
            </p>
            <div className="flex flex-col gap-2 min-[701px]:flex-row min-[701px]:items-center min-[1200px]:gap-3">
              <Button variant="onBlue" href={links.mine} className={`${CTA_XL} min-[701px]:max-[1199px]:flex-1`}>
                Open the demo household
              </Button>
              <Button variant="outlineOnBlue" href={links.feed} className={`${CTA_XL} hover:border-white/70! hover:bg-white/8! min-[701px]:max-[1199px]:flex-1`}>
                Browse the live feed
              </Button>
            </div>
            <p className="m-0 mt-[22px] flex flex-wrap items-center gap-2.5 font-sans text-[14px] leading-[1.4] text-on-cobalt-muted min-[1200px]:flex-nowrap">
              Build on it:
              <Link
                href={links.api}
                className="inline-flex items-center rounded-sm font-semibold text-white underline decoration-white/50 underline-offset-3 pointer-coarse:min-h-11"
              >
                Read the API docs
              </Link>
              <code className="rounded-[8px] bg-[rgb(0_30_90/.28)] px-2.5 py-[7px] font-mono text-[13px] leading-none text-white">
                GET /v1/notices?source=cdsco
              </code>
            </p>
          </div>

          <HouseholdPreview household={hh} counts={count} sourceCount={data.sourceCount} asOf={data.asOf} />
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-2.5 border-t border-white/20 pt-7 pb-[30px] min-[1200px]:mt-24">
          <p id="aws-l" className="m-0 mr-2.5 font-sans text-[14px] font-semibold leading-none text-white">
            Built on AWS
          </p>
          {/* display: contents lets the chips wrap on the label's line, as in the mockup; role keeps the list semantics */}
          <ul role="list" aria-labelledby="aws-l" className="contents">
            {AWS_SERVICES.map((svc) => (
              <li
                key={svc}
                className="inline-flex h-8 items-center rounded-pill border border-on-cobalt-line px-[13px] font-sans text-[13.5px] font-medium leading-none text-white"
              >
                {svc}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/14 pt-[22px] pb-[30px] font-sans text-[13.5px] leading-[1.4] text-on-cobalt-muted min-[1200px]:flex-nowrap min-[1200px]:gap-6">
          <span className="flex items-center gap-2.5 font-display text-[17px] font-extrabold leading-none tracking-[-.03em] text-white">
            <LogoMark size={24} />
            RecallIndia
          </span>
          <span>Built for WeMakeDevs × AWS First Commit</span>
          <nav aria-label="Footer" className="-ml-2.5 flex w-full gap-1 min-[1200px]:ml-auto min-[1200px]:w-auto">
            {[
              ['Feed', links.feed],
              ['Ingest', links.ingest],
              ['My things', links.mine],
              ['API', links.api],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="inline-flex min-h-11 items-center rounded-sm px-2.5 font-medium text-white hover:underline hover:underline-offset-3"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  )
}

// ------------------------------------------------------------------ HouseholdPreview

const FACE: Record<HouseholdItem['face'], { tone: ChipTone; label: string }> = {
  alert: { tone: 'alert', label: 'On a notice' },
  'near-miss': { tone: 'hold', label: 'Near-miss' },
  clear: { tone: 'clear', label: 'No match' },
}

/** One line under the item name, built from the item and its notice. */
export function itemDetail(item: HouseholdItem, notice: NoticeLite | undefined, sourceCount: number, asOf: string): string {
  if (item.face === 'clear' || !notice) return `No match in ${sourceCount} sources as of ${asOf}`
  if (item.face === 'near-miss') return `Batch ${item.batch} · listed batch is ${notice.batches[0] ?? ''}`
  const src = NOTICE_SOURCE_LABEL[notice.source]
  if (notice.row_ref) return `Batch ${item.batch} · ${src} ${fmtAlertMonth(notice.row_ref.month)}, row ${notice.row_ref.row}`
  return `${src} ${notice.notice_id}${notice.hazard_short ? ` · ${notice.hazard_short}` : ''}`
}

export function HouseholdPreview({
  household,
  counts,
  sourceCount,
  asOf,
}: {
  household: LandingStory['household']
  counts: ReturnType<typeof householdCounts>
  sourceCount: number
  asOf: string
}) {
  const rows = household.previewIds
    .map((id) => household.items.find((i) => i.item_id === id))
    .filter((i): i is HouseholdItem => Boolean(i))
  return (
    <div
      role="group"
      aria-label={`Preview of the ${household.name.toLowerCase()}`}
      className="min-w-0 rounded-lg bg-surface-1 px-4 pt-[18px] pb-2 text-ink shadow-[0_30px_60px_-24px_rgb(0_20_70/.55)] min-[701px]:rotate-[1.5deg] min-[1200px]:px-[22px] min-[1200px]:pt-[22px] min-[1200px]:pb-3"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <b className="font-sans text-[16px] font-bold leading-[1.2]">{household.name}</b>
        <span className="rounded-pill border border-line px-2.5 py-[7px] font-sans text-[12.5px] font-medium leading-none text-ink-muted">
          {household.readOnly ? 'Read-only · ' : ''}
          {counts.total} things
        </span>
      </div>
      <p className="m-0 mb-3 font-sans text-[14px] leading-[1.4] text-ink-muted">
        <b className="font-semibold text-danger">{counts.onNotice} on a notice</b> · {counts.nearMiss} near-miss · {counts.noMatch} with no match in{' '}
        {sourceCount} sources as of {asOf}
      </p>
      <ul className="m-0 list-none p-0">
        {rows.map((item) => {
          const face = FACE[item.face]
          const notice = item.notice_id ? household.notices[item.notice_id] : undefined
          return (
            <li key={item.item_id} className="flex items-start gap-3 border-t border-line py-[11px] min-[1200px]:items-center">
              <KindTile kind={item.kind} size={38} />
              <div className="min-w-0 flex-1">
                <b className="block font-sans text-[14.5px] font-semibold leading-[1.25] min-[1200px]:truncate">{item.name}</b>
                <span className="mt-0.5 block font-sans text-[12.5px] leading-[1.35] text-ink-muted">{itemDetail(item, notice, sourceCount, asOf)}</span>
              </div>
              <Chip tone={face.tone} className="mt-0.5 flex-none min-[1200px]:mt-0">
                {face.label}
              </Chip>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
