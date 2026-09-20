/**
 * Landing view model (landing.md §1.3) plus the demo records the page illustrates.
 * `LandingData` is camelCase because lib/api.ts maps /v1/stats + /v1/sources into it (the spec's shape).
 * Notice, item and case records keep the API's own snake_case field names so fixtures can be pasted
 * straight from GET /v1/notices/{id}, the /mine item list and GET /cases/{id}.
 */

export type SourceId = 'cdsco' | 'cpsc' | 'nhtsa' | 'openfda'

export interface LandingSource {
  id: SourceId
  /** Poll cadence shown on the page: '15 min' or 'daily' (from /v1/stats sources[].polls_every). */
  schedule: string
  status: 'ok' | 'down'
  /** ISO 8601 (UTC) of the last successful poll. */
  lastRunAt: string
}

export interface LandingData {
  /** 4868 ← GET /v1/stats (all notices) */
  total: number
  /** 2696, 1852, 282, 38 ← GET /v1/stats per source */
  bySource: Record<SourceId, number>
  /** 4 ← GET /v1/stats sources_count */
  sourceCount: number
  /** 'JUL-2026', 'July 2026', 239 ← GET /v1/stats (latest CDSCO month) */
  cdscoLatest: { month: string; label: string; failed: number }
  /** '15:08' (IST, HH:MM) ← stats generation time */
  asOf: string
  /** '20 Sep 2026' (IST) ← same timestamp; used only by the stale copy. Addition to the spec's shape. */
  asOfDate: string
  /** ← GET /v1/stats sources[] (GET /v1/sources returns 404 today), in API order */
  sources: LandingSource[]
  /** 9 ← demo case case_demo_ft5427 timing (approve → verified), baked in the snapshot */
  pipelineSeconds: number
}

/** Where the numbers came from. 'snapshot' = build-time JSON, 'live' = client refresh landed, 'stale' = refresh failed. */
export type LandingDataStatus = 'snapshot' | 'live' | 'stale'

/** QA states (landing.md §1.4). The route reads ?state= and passes it down. */
export type LandingState =
  | 'default'
  | 'static'
  | 'poster'
  | 'reduced'
  | 'stale'
  | 'source-down'
  | 'highlight-batch'
  | 'highlight-pill'
  | 'scrolled'
  | 'traced'

/** Subset of GET /v1/notices/{id}. `source` uses the API ids (cdsco_nsq, cpsc, nhtsa, openfda). */
export interface NoticeLite {
  notice_id: string
  source: 'cdsco_nsq' | 'cpsc' | 'nhtsa' | 'openfda'
  product: string
  brand: string | null
  batches: string[]
  hazard_or_failed_test: string | null
  lab: string | null
  /** CDSCO only: the monthly alert and row the notice was read from. */
  row_ref: { month: string; row: number } | null
  /** YYYY-MM-DD */
  published_at: string
  /** Not in the API yet: town + state of the maker, e.g. "Baddi, HP" (parsed from raw_excerpt). See README. */
  maker_place?: string
  /** NHTSA only: the plain-language part of the summary, e.g. "rearview camera". Not in the API yet. */
  hazard_short?: string
}

export type ItemKind = 'medicine' | 'vehicle' | 'appliance' | 'other'

/** Subset of a /mine item (mine.md §1 Data). `face` is derived exactly as /mine derives it. */
export interface HouseholdItem {
  item_id: string
  kind: ItemKind
  name: string
  brand: string | null
  batch: string | null
  /** YYYY-MM-DD */
  purchase_date: string | null
  notice_id: string | null
  case_id: string | null
  face: 'alert' | 'near-miss' | 'clear'
}

/** Subset of GET /cases/{id} (case.md §data) that the artifact section prints. */
export interface DemoCase {
  case_id: string
  /** Days between the notice's published_at and the item's purchase_date (case.sold_after_notice). */
  sold_after_notice: number
  claim_addressee: string
  claim_subject: string
  /** Paragraphs of claim_text, in order. */
  claim_paragraphs: string[]
  /** YYYY-MM-DD, the letter's date. */
  claim_date: string
  evidence: {
    sha256: string
    /** ISO 8601 UTC */
    signed_at: string
    /** YYYY-MM-DD */
    locked_until: string
    lock_mode: 'governance' | 'compliance'
    lock_days: number
    kms_key_alias: string
    signing_algorithm: string
  }
  /** GET /cases/{id}/verify-evidence?tamper=1 → flipped_byte_index, byte_before, byte_after */
  tamper: { flipped_byte_index: number; byte_before: number; byte_after: number }
}

/** A neighbouring feed row shown around the focus card in "Every row becomes a notice". */
export interface FeedNeighbour {
  notice: NoticeLite
  /** "17 Sep" / "01 Jul": the feed's short date. */
  dateLabel: string
}

/** Everything How it works, The artifact and the footer preview illustrate. Real demo records, not copy. */
export interface LandingStory {
  /** The CDSCO row the whole page follows (JUL-2026, row 12). */
  notice: NoticeLite
  /** The PDF the row was read from. */
  pdf: { fileName: string; title: string; subtitle: string }
  /** Feed rows above and below the focus card. */
  neighbours: { before: FeedNeighbour; after: FeedNeighbour }
  /** The household item that matched (batch FT5427). */
  item: HouseholdItem
  case: DemoCase
  household: {
    name: string
    readOnly: boolean
    /** All 15 things; counts are derived from `face`. */
    items: HouseholdItem[]
    /** item_ids shown in the footer preview, in order. */
    previewIds: string[]
    /** Notices referenced by household items, keyed by notice_id. */
    notices: Record<string, NoticeLite>
  }
}

export interface LandingLinks {
  mine: string
  feed: string
  /** The FT5427 CDSCO month in the feed (feed spec owns the params). */
  feedCdscoMonth: string
  ingest: string
  api: string
  case: string
}
