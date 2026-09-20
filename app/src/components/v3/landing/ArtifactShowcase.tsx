/**
 * The artifact (landing.md §7): what you walk away with. FactList + CTA on the left, a desk with the
 * claim letter, the evidence certificate and the VERIFIED seal on the right.
 * Desk hover (desktop, fine pointer, motion allowed): letter −4° → −2.5°, certificate 3.5° → 2°,
 * seal −10° → −6°, on the spring easing token over 300 ms. Nothing moves on scroll.
 */
import { Activity, KeyRound, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../ui'
import { fmtDay, fmtSignedAt, hex, NOTICE_SOURCE_LABEL } from './format'
import { LogoMark } from './glyphs'
import { H2, LEDE } from './styles'
import { Seal } from './Seal'
import s from './landing.module.css'
import type { LandingLinks, LandingStory } from './types'

export interface ArtifactShowcaseProps {
  story: Pick<LandingStory, 'case' | 'notice'>
  links: Pick<LandingLinks, 'case'>
}

const PAPER = 'absolute rounded-[6px] bg-white shadow-[0_1px_0_rgb(11_27_51/.04),0_3px_8px_rgb(11_27_51/.08),0_36px_60px_-24px_rgb(0_40_110/.38)]'
/** hover tilt only where it can be seen and is wanted */
const TILT = 'transition-[rotate] duration-300 ease-spring'

export function ArtifactShowcase({ story, links }: ArtifactShowcaseProps) {
  const c = story.case
  const ev = c.evidence
  const n = story.notice
  const batch = n.batches[0] ?? ''
  const shaShort = `${ev.sha256.slice(0, 8)}…${ev.sha256.slice(-8)}`
  const ref = n.row_ref ? `${NOTICE_SOURCE_LABEL[n.source]} · ${n.row_ref.month} · row ${n.row_ref.row}` : n.notice_id
  return (
    <section aria-labelledby="art-h" className="pb-24 min-[1200px]:pb-[140px]">
      <div className={`${s.wrap} grid grid-cols-[minmax(0,1fr)] gap-7 min-[1200px]:grid-cols-[500px_1fr] min-[1200px]:items-center min-[1200px]:gap-[72px]`}>
        <div>
          <h2 id="art-h" className={H2}>
            You walk away with a letter and sealed proof.
          </h2>
          <p className={`${LEDE} mt-[22px]`}>
            The letter cites the notice exactly as {NOTICE_SOURCE_LABEL[n.source]} published it. RecallIndia locks that copy and signs it, so your
            pharmacy can check it for itself.
          </p>
          <ul className="mt-[34px] mb-9 grid list-none p-0">
            <Fact icon={<Lock size={20} strokeWidth={1.8} />} title={`Locked until ${fmtDay(ev.locked_until)}`}>
              S3 Object Lock, {ev.lock_mode} mode, {ev.lock_days} days
            </Fact>
            <Fact icon={<KeyRound size={20} strokeWidth={1.8} />} title="Signed with AWS KMS">
              <code className="font-mono text-[12.5px] leading-none text-ink">{ev.kms_key_alias}</code> · {ev.signing_algorithm}
            </Fact>
            <Fact icon={<Activity size={20} strokeWidth={1.8} />} title="Tamper test built in">
              Change byte {c.tamper.flipped_byte_index} from {hex(c.tamper.byte_before)} to {hex(c.tamper.byte_after)} and the seal turns INVALID.
              Verify again: VERIFIED.
            </Fact>
          </ul>
          <Button variant="primary" href={links.case} className="h-[54px]! px-[26px]! text-[17px]!">
            Open the {batch} case
          </Button>
        </div>

        <div
          role="img"
          aria-label={`Claim letter and evidence certificate for batch ${batch}, sealed and verified`}
          className="group/desk relative -mx-4 h-[548px] overflow-hidden bg-cobalt-soft min-[701px]:mx-0 min-[701px]:h-[640px] min-[701px]:rounded-lg min-[1200px]:h-[600px]"
        >
          {/* letter: scaled from its top-left on stacked layouts, rotated about its centre on desktop */}
          <div
            className={`${PAPER} ${TILT} top-[34px] left-3.5 h-[500px] w-[372px] origin-top-left rotate-[-4deg] scale-[.72] p-[34px] min-[701px]:top-10 min-[701px]:left-[30px] min-[701px]:scale-[.92] min-[1200px]:top-[46px] min-[1200px]:left-11 min-[1200px]:origin-center min-[1200px]:scale-100 min-[1200px]:pointer-fine:motion-safe:group-hover/desk:rotate-[-2.5deg]`}
          >
            <div className="mb-[22px] flex justify-between font-sans text-[11px] font-medium leading-[1.4] text-ink-muted">
              <span>Claim letter</span>
              <span>{fmtDay(c.claim_date)}</span>
            </div>
            <div className="font-sans text-[12px] font-medium leading-[1.5] text-ink">To: {c.claim_addressee}</div>
            <div className="mt-3 mb-3.5 font-sans text-[13px] font-bold leading-[1.4] text-ink">Subject: {c.claim_subject}</div>
            {c.claim_paragraphs.map((p) => (
              <p key={p} className="m-0 mb-2.5 font-sans text-[11.5px] leading-[1.6] text-(--paper-ink)">
                {p}
              </p>
            ))}
            <div className="mt-[18px] font-sans text-[11.5px] leading-[1.6] text-(--paper-ink)">
              Yours sincerely,
              <i className="mt-1.5 mb-1 block h-[26px] w-[120px] border-b border-(--paper-rule)" />
            </div>
            <div className="absolute right-[34px] bottom-7 left-[34px] flex items-center gap-2 rounded-[8px] bg-surface-2 px-3 py-2.5 font-sans text-[11px] font-medium leading-[1.3] text-ink">
              <Lock size={16} strokeWidth={1.8} className="flex-none text-success" aria-hidden="true" />
              <div>
                Attached: sealed notice
                <br />
                <code className="font-mono text-[10px] leading-none text-ink-muted">sha256 {shaShort}</code>
              </div>
            </div>
          </div>

          {/* evidence certificate */}
          <div
            className={`${PAPER} ${TILT} top-[214px] left-[132px] h-[440px] w-[352px] origin-top-left rotate-[3.5deg] scale-[.66] border-t-[6px] border-success px-7 py-[26px] min-[701px]:top-[176px] min-[701px]:left-[262px] min-[701px]:scale-[.88] min-[1200px]:top-[92px] min-[1200px]:left-[398px] min-[1200px]:origin-center min-[1200px]:scale-100 min-[1200px]:pointer-fine:motion-safe:group-hover/desk:rotate-[2deg]`}
          >
            <div className="mb-[18px] flex items-center gap-2.5">
              <LogoMark size={28} className="text-ink" />
              <div>
                <b className="font-display text-[19px] font-extrabold leading-[1.1] tracking-[-.02em] text-ink">Evidence certificate</b>
                <span className="block font-sans text-[11px] font-medium leading-[1.3] text-ink-muted">{ref}</span>
              </div>
            </div>
            <dl className="m-0 grid gap-3">
              <Kv k="SHA-256">
                <code className="block break-all font-mono text-[11px] leading-[1.5] text-ink">{ev.sha256}</code>
              </Kv>
              <Kv k="Signed">{fmtSignedAt(ev.signed_at)}</Kv>
              <Kv k="Key">{ev.kms_key_alias}</Kv>
              <Kv k="Locked until">
                {ev.locked_until} · {ev.lock_mode} mode
              </Kv>
            </dl>
          </div>

          <div
            className={`${TILT} absolute right-2.5 bottom-[22px] size-[124px] rotate-[-10deg] drop-shadow-[0_10px_18px_rgb(18_122_85/.25)] min-[701px]:right-[22px] min-[701px]:bottom-[26px] min-[701px]:size-[156px] min-[1200px]:top-[352px] min-[1200px]:right-auto min-[1200px]:bottom-auto min-[1200px]:left-[586px] min-[1200px]:size-[176px] min-[1200px]:pointer-fine:motion-safe:group-hover/desk:rotate-[-6deg]`}
          >
            <Seal size={176} className="block size-full" />
          </div>
        </div>
      </div>
    </section>
  )
}

function Fact({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[40px_1fr] items-start gap-3.5 border-t border-line py-4 last:border-b">
      <span aria-hidden="true" className="grid size-10 place-items-center rounded-[12px] bg-cobalt-soft text-cobalt">
        {icon}
      </span>
      <div>
        <b className="block font-sans text-[16px] font-semibold leading-[1.3] text-ink">{title}</b>
        <span className="font-sans text-[14px] leading-[1.45] text-ink-muted">{children}</span>
      </div>
    </li>
  )
}

function Kv({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="font-sans text-[11px] leading-[1.45] text-ink-muted">
      <dt className="font-sans text-[12.5px] font-semibold leading-[1.4] text-ink">{k}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  )
}
