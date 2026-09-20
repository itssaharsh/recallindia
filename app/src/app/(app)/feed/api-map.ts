/**
 * The live API shapes (`@/lib/types`, kept loose because the API is loose) mapped onto the
 * strict shapes the v3 components take (`components/v3/feed-ingest-api/types`). Nothing here
 * calls anything: the routes fetch with `apiGet` exactly as v2 did and pass the body through.
 */
import type {
  Notice as V3Notice,
  SourceHealth as V3Health,
  SourceId as V3SourceId,
  Stats as V3Stats,
} from "@/components/v3/feed-ingest-api/types";
import type { Item, Notice, SourceId, Stats } from "@/lib/types";

/** The four sources the v3 components know how to draw. A fifth would have no colour or tile. */
export const V3_SOURCES = ["cdsco_nsq", "cpsc", "nhtsa", "openfda"] as const;

export function isV3Source(source: SourceId | string | null | undefined): source is V3SourceId {
  return !!source && (V3_SOURCES as readonly string[]).includes(source);
}

/** The API notice, with every optional field filled in. Returns null for a source v3 can't draw. */
export function toV3Notice(n: Notice): V3Notice | null {
  if (!isV3Source(n.source)) return null;
  return {
    pk: n.pk,
    source: n.source,
    notice_id: n.notice_id,
    title: n.title,
    product: n.product || n.title || n.notice_id,
    brand: n.brand ?? null,
    batches: n.batches ?? [],
    model: n.model ?? null,
    vehicles: (n.vehicles ?? []).map((v) => ({
      make: v.make,
      model: v.model,
      year_from: v.year_from,
      year_to: v.year_to,
    })),
    row_ref: n.row_ref
      ? { month: n.row_ref.month ?? null, row: n.row_ref.row ?? null, page: n.row_ref.page ?? null }
      : null,
    hazard_or_failed_test: n.hazard_or_failed_test ?? null,
    remedy: n.remedy ?? null,
    published_at: n.published_at,
    first_seen_at: n.first_seen_at ?? n.published_at,
    url: n.url ?? null,
    raw_excerpt: n.raw_excerpt ?? null,
    mfg_date: n.mfg_date ?? null,
    exp_date: n.exp_date ?? null,
    lab: n.lab ?? null,
    serial_ranges: n.serial_ranges ?? [],
    adapter: n.adapter ?? null,
    pdf_s3_key: n.pdf_s3_key ?? null,
    source_confidence: n.source_confidence ?? undefined,
  };
}

export const toV3Notices = (rows: Notice[] | undefined): V3Notice[] =>
  (rows ?? []).map(toV3Notice).filter((n): n is V3Notice => n !== null);

/** `/v1/stats`. `pollers[]` is not in the live payload and no v3 component reads it. */
export function toV3Stats(s: Stats | null): V3Stats | null {
  if (!s) return null;
  return {
    total: s.total,
    sources_count: s.sources_count,
    sources: s.sources.filter((x) => isV3Source(x.source)).map((x) => ({
      source: x.source as V3SourceId,
      label: x.label,
      count: x.count,
      health: x.health as V3Health,
      last_run_at: x.last_run_at,
      last_success_at: x.last_success_at,
      last_error: x.last_error,
      polls_every: x.polls_every,
      pollers: [],
    })),
    cdsco_latest: s.cdsco_latest
      ? {
          month: s.cdsco_latest.month,
          count: s.cdsco_latest.count,
          published_at: s.cdsco_latest.published_at ?? "",
          complete: s.cdsco_latest.complete ?? false,
        }
      : undefined,
    last_poll_at: s.last_poll_at ?? "",
    generated_at: s.generated_at,
  };
}

/** "15 min" | "1 day" | "daily" → minutes. Null when the string says nothing we can add up. */
export function everyMinutes(every: string | null | undefined): number | null {
  if (!every) return null;
  if (/^daily$/i.test(every.trim())) return 24 * 60;
  const m = /^(\d+)\s*(min|minute|minutes|hour|hours|hr|day|days)\b/i.exec(every.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith("min")) return n;
  if (unit.startsWith("h")) return n * 60;
  return n * 24 * 60;
}

/** last_poll_at + the shortest poll interval on the stats payload (15 min). */
export function nextPollAt(stats: Stats | null): string | null {
  if (!stats?.last_poll_at) return null;
  const every = stats.sources
    .map((s) => everyMinutes(s.polls_every))
    .filter((m): m is number => m != null);
  if (!every.length) return null;
  const t = Date.parse(stats.last_poll_at);
  if (Number.isNaN(t)) return null;
  return new Date(t + Math.min(...every) * 60_000).toISOString();
}

/** The `/mine` household item, as the feed's banner and sheet read it. */
export function toV3Item(item: Item) {
  return {
    item_id: item.item_id,
    kind: item.kind,
    name: item.name,
    brand: item.brand ?? null,
    batch: item.batch ?? null,
    make: item.make ?? null,
    model: item.model ?? null,
    year: item.year ?? null,
    purchase_date: item.purchase_date ?? null,
    case_id: item.case_id ?? null,
  };
}
