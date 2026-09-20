/** Formatting helpers. Pure and timezone-explicit, so server HTML and hydration always agree. */
import type { HouseholdItem, LandingSource, NoticeLite, SourceId } from './types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** en-IN grouping (4,868; 1,00,000 above a lakh). */
export const LOCALE = 'en-IN'
const intFmt = new Intl.NumberFormat(LOCALE)
export const fmtInt = (n: number) => intFmt.format(n)

/** '2026-07-01' → '01 Jul 2026' (no Date parsing, so no timezone drift). */
export function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`
}
/** '2026-07-01' → '01 Jul' */
export function fmtDayShort(ymd: string): string {
  const [, m, d] = ymd.split('-')
  return `${d} ${MONTHS[Number(m) - 1]}`
}
/** 'JUL-2026' → 'July 2026' */
export function fmtAlertMonth(month: string): string {
  const [mon, y] = month.split('-')
  const i = MONTHS.findIndex((m) => m.toUpperCase() === mon.toUpperCase())
  return i < 0 ? month : `${MONTHS_LONG[i]} ${y}`
}

const istParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
function parts(iso: string) {
  const p = Object.fromEntries(istParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  // month names from our own table: ICU's en-GB "short" month is "Sept" in newer engines
  return { d: p.day, mon: MONTHS[Number(p.month) - 1], y: p.year, hh: p.hour, mm: p.minute }
}
/** ISO → '15:08' in IST */
export const fmtIstTime = (iso: string) => {
  const p = parts(iso)
  return `${p.hh}:${p.mm}`
}
/** '2026-09-19T23:58:00Z' → '2026-09-19 23:58 UTC (05:28 IST 20 Sep)' */
export function fmtSignedAt(iso: string): string {
  const utc = iso.replace('T', ' ').slice(0, 16)
  const p = parts(iso)
  return `${utc} UTC (${p.hh}:${p.mm} IST ${p.d} ${p.mon})`
}

/** ['CPSC', 'NHTSA', 'openFDA'] → 'CPSC, NHTSA and openFDA' */
export function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs.join('')
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/** 110 → '0x6e' */
export const hex = (b: number) => `0x${b.toString(16).padStart(2, '0')}`

export const SOURCE_LABEL: Record<SourceId, string> = { cdsco: 'CDSCO', cpsc: 'CPSC', nhtsa: 'NHTSA', openfda: 'openFDA' }
export const NOTICE_SOURCE_LABEL: Record<NoticeLite['source'], string> = { cdsco_nsq: 'CDSCO', cpsc: 'CPSC', nhtsa: 'NHTSA', openfda: 'openFDA' }

/**
 * Poll cadence copy for the hero stat and the proof footer, built from sources[].schedule.
 * → { fast: '15 min', fastNames: 'CPSC, NHTSA and openFDA', dailyNames: 'CDSCO' }
 */
export function pollSummary(sources: LandingSource[]) {
  const fast = sources.filter((s) => s.schedule !== 'daily')
  const daily = sources.filter((s) => s.schedule === 'daily')
  return {
    fast: fast[0]?.schedule ?? '15 min',
    fastNames: joinAnd(fast.map((s) => SOURCE_LABEL[s.id])),
    dailyNames: joinAnd(daily.map((s) => SOURCE_LABEL[s.id])),
  }
}

/** "CDSCO · July 2026 · row 12" */
export function alertSourceLine(n: NoticeLite): string {
  if (n.row_ref) return `${NOTICE_SOURCE_LABEL[n.source]} · ${fmtAlertMonth(n.row_ref.month)} · row ${n.row_ref.row}`
  return `${NOTICE_SOURCE_LABEL[n.source]} ${n.notice_id}`
}

/** Sentence case for a regulator's reason: 'Dissolution Test' → 'dissolution test'. */
export const lowerReason = (s: string | null) => (s ?? '').toLowerCase()

/** Household counts, derived the way /mine derives them. */
export function householdCounts(items: HouseholdItem[]) {
  return {
    total: items.length,
    onNotice: items.filter((i) => i.face === 'alert').length,
    nearMiss: items.filter((i) => i.face === 'near-miss').length,
    noMatch: items.filter((i) => i.face === 'clear').length,
  }
}

/** Non-breaking spaces, so a phrase never wraps inside itself ("bought 12 Jul 2026"). */
export const nb = (s: string) => s.replace(/ /g, ' ')
