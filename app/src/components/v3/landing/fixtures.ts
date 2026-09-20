/**
 * Real demo data for the landing (BRIEF "Real data"), so /kit and the video render it without the API.
 * Numbers: GET /v1/stats + /v1/sources on 20 Sep 2026, 15:08 IST. Records: the seeded demo household
 * (/mine), the CDSCO JUL-2026 alert row 12 and case case_demo_ft5427 (/case).
 *
 * Ids: notice ids and case_demo_ft5427 / demo-alert are the live ids. The other item_ids are slugs:
 * replace them with the seed's ids when you wire /mine's fixture in (they are never displayed).
 */
import type { HouseholdItem, LandingData, LandingLinks, LandingStory, NoticeLite } from './types'

export const landingSnapshot: LandingData = {
  total: 4868,
  bySource: { cdsco: 2696, cpsc: 1852, openfda: 282, nhtsa: 38 },
  sourceCount: 4,
  cdscoLatest: { month: 'JUL-2026', label: 'July 2026', failed: 239 },
  asOf: '15:08',
  asOfDate: '20 Sep 2026',
  sources: [
    { id: 'cdsco', schedule: 'daily', status: 'ok', lastRunAt: '2026-09-20T09:38:00Z' },
    { id: 'cpsc', schedule: '15 min', status: 'ok', lastRunAt: '2026-09-20T09:38:00Z' },
    { id: 'nhtsa', schedule: '15 min', status: 'ok', lastRunAt: '2026-09-20T09:38:00Z' },
    { id: 'openfda', schedule: '15 min', status: 'ok', lastRunAt: '2026-09-20T09:38:00Z' },
  ],
  pipelineSeconds: 9,
}

/** ?state=source-down: CPSC missed its 15:08 poll; last good run one poll earlier (14:53 IST). */
export const landingSnapshotSourceDown: LandingData = {
  ...landingSnapshot,
  sources: landingSnapshot.sources.map((s) =>
    s.id === 'cpsc' ? { ...s, status: 'down', lastRunAt: '2026-09-20T09:23:00Z' } : s,
  ),
}

// ---------------------------------------------------------------- notices (GET /v1/notices/{id})

/** CDSCO JUL-2026 alert, row 12. Raw row: "Paracetamol Tablets IP 650mg | FT5427 | Oct-2025 | Sep-2027 | Forgo
 *  Pharmaceuticals, 27, DIC Ind Area, Barotiwala, Teh: Baddi, Distt. Solan (HP) 174103 | The sample does not
 *  conforms to the I.P. with respect to Dissolution Test. | State Lab | DTL Bikaner | JUL-2026" */
export const noticeFt5427: NoticeLite = {
  notice_id: 'JUL-2026-cdsco_portal-b75cfffe3713',
  source: 'cdsco_nsq',
  product: 'Paracetamol Tablets IP 650mg',
  brand: 'Forgo Pharmaceuticals',
  batches: ['FT5427'],
  hazard_or_failed_test: 'Dissolution Test',
  lab: 'DTL Bikaner',
  row_ref: { month: 'JUL-2026', row: 12 },
  published_at: '2026-07-01',
  maker_place: 'Baddi, HP',
}

/** NHTSA 24V436000: "The radio software may prevent the rearview image from displaying." (2021–2023 Jeep Compass) */
export const noticeJeep: NoticeLite = {
  notice_id: '24V436000',
  source: 'nhtsa',
  product: 'Jeep Compass',
  brand: 'Jeep',
  batches: [],
  hazard_or_failed_test: 'The radio software may prevent the rearview image from displaying.',
  lab: null,
  row_ref: null,
  published_at: '2024-06-13',
  hazard_short: 'rearview camera',
}

export const noticeSaunas: NoticeLite = {
  notice_id: '10984',
  source: 'cpsc',
  product: 'Infrared Saunas, Hybrid Infrared Saunas and Infrared Kits',
  brand: 'Sauna360 Inc.',
  batches: [],
  hazard_or_failed_test: 'Panels can short circuit: fire and burn hazards',
  lab: null,
  row_ref: null,
  published_at: '2026-09-17',
}

export const noticeAceclofenac: NoticeLite = {
  notice_id: 'JUL-2026-cdsco_portal-005f85bb4ee1',
  source: 'cdsco_nsq',
  product: 'Aceclofenac & Paracetamol Tablets IP',
  brand: 'Oxford Pharma',
  batches: ['MT250239'],
  hazard_or_failed_test: 'Content of Aceclofenac (82.94%)',
  lab: 'Drugs Testing Laboratory, Madurai-19',
  row_ref: { month: 'JUL-2026', row: 129 },
  published_at: '2026-07-01',
}

// ---------------------------------------------------------------- demo household (15 things, /mine)

const clear = (item_id: string, kind: HouseholdItem['kind'], name: string, brand: string | null): HouseholdItem => ({
  item_id, kind, name, brand, batch: null, purchase_date: null, notice_id: null, case_id: null, face: 'clear',
})

export const itemFt5427: HouseholdItem = {
  item_id: 'demo-alert',
  kind: 'medicine',
  name: 'Paracetamol Tablets IP 650mg',
  brand: 'Forgo Pharmaceuticals',
  batch: 'FT5427',
  purchase_date: '2026-07-12',
  notice_id: noticeFt5427.notice_id,
  case_id: 'case_demo_ft5427',
  face: 'alert',
}

export const demoHouseholdItems: HouseholdItem[] = [
  itemFt5427,
  {
    item_id: 'demo-jeep-compass', kind: 'vehicle', name: 'Jeep Compass 2022', brand: 'Jeep', batch: null,
    purchase_date: null, notice_id: noticeJeep.notice_id, case_id: null, face: 'alert',
  },
  {
    item_id: 'demo-near-miss', kind: 'medicine', name: 'Paracetamol Tablets IP 650mg', brand: 'Forgo Pharmaceuticals',
    batch: 'FT5428', purchase_date: null, notice_id: noticeFt5427.notice_id, case_id: null, face: 'near-miss',
  },
  clear('demo-bajaj-iron', 'appliance', 'Bajaj Majesty DX-6 Dry Iron', 'Bajaj'),
  clear('demo-boat-airdopes', 'appliance', 'boAt Airdopes 141 Earbuds', 'boAt'),
  clear('demo-butterfly-stove', 'appliance', 'Butterfly Smart Glass 3 Burner Gas Stove', 'Butterfly'),
  clear('demo-crocin', 'medicine', 'Crocin Advance 500mg Tablets', 'GSK'),
  clear('demo-crompton-geyser', 'appliance', 'Crompton Arno Neo Storage Geyser', 'Crompton'),
  clear('demo-dolo', 'medicine', 'Dolo 650', 'Micro Labs'),
  clear('demo-havells-fan', 'appliance', 'Havells Efficiencia Neo Ceiling Fan', 'Havells'),
  clear('demo-hawkins-cooker', 'other', 'Hawkins Contura Hard Anodised Cooker', 'Hawkins'),
  clear('demo-swift', 'vehicle', 'Maruti Suzuki Swift', 'Maruti Suzuki'),
  clear('demo-milton-flask', 'other', 'Milton Thermosteel Flip Lid Flask', 'Milton'),
  clear('demo-pigeon-induction', 'appliance', 'Pigeon Cruise Induction Cooktop', 'Pigeon'),
  clear('demo-prestige-cooker', 'other', 'Prestige Deluxe Plus Pressure Cooker', 'Prestige'),
]

// ---------------------------------------------------------------- the story the page follows

export const landingStory: LandingStory = {
  notice: noticeFt5427,
  pdf: {
    fileName: 'NSQ-JUL-2026.pdf',
    title: 'Drugs declared Not of Standard Quality',
    subtitle: 'Alert for the month of July 2026 · state and central labs',
  },
  neighbours: {
    before: { notice: noticeSaunas, dateLabel: '17 Sep' },
    after: { notice: noticeAceclofenac, dateLabel: '01 Jul' },
  },
  item: itemFt5427,
  case: {
    case_id: 'case_demo_ft5427',
    sold_after_notice: 11,
    claim_addressee: 'The pharmacy',
    claim_subject:
      'Refund or replacement: Paracetamol Tablets IP 650mg, batch FT5427, failed CDSCO quality test (July 2026 alert, row 12)',
    claim_paragraphs: [
      'I bought Paracetamol Tablets IP 650mg made by Forgo Pharmaceuticals, batch FT5427, on 12 Jul 2026.',
      'This batch is listed in the CDSCO July 2026 alert, row 12, published on 01 Jul 2026. The sample failed the Dissolution Test at DTL Bikaner.',
      'Please refund or replace it.',
    ],
    claim_date: '2026-09-20',
    evidence: {
      sha256: '56237b4d612cf0bcd7e97aa1d6ddb88ebdb31f3f23708a6028ac10ab4b9c29a7',
      signed_at: '2026-09-19T23:58:00Z',
      locked_until: '2026-10-19',
      lock_mode: 'governance',
      lock_days: 30,
      kms_key_alias: 'alias/recallindia-signing',
      signing_algorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
    },
    tamper: { flipped_byte_index: 335, byte_before: 0x6e, byte_after: 0x6f },
  },
  household: {
    name: 'Demo household',
    readOnly: true,
    items: demoHouseholdItems,
    previewIds: ['demo-alert', 'demo-jeep-compass', 'demo-near-miss', 'demo-havells-fan'],
    notices: { [noticeFt5427.notice_id]: noticeFt5427, [noticeJeep.notice_id]: noticeJeep },
  },
}

export const landingLinks: LandingLinks = {
  mine: '/mine/',
  feed: '/feed/',
  // The /feed spec owns these params (feed-ingest-api.md: ?source=cdsco_nsq&month=JUL-2026).
  feedCdscoMonth: '/feed/?source=cdsco_nsq&month=JUL-2026',
  // /ingest autostarts its replay 400 ms after the PDF's first page renders, so no flag is needed.
  ingest: '/ingest/',
  api: '/api/',
  case: '/case/?id=case_demo_ft5427',
}
