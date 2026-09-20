// The "/" route's numbers: the committed build-time snapshot, and the one adapter from the shell's
// /v1/stats poll to the landing's view model. Used only by the landing (app/page.tsx).
//
// landing.md §1.3: the page is statically exported, so every number is baked at build time and then
// refreshed on the client. The snapshot is a constant rather than a fetch in the server component,
// so `next build` never talks to the API (and CI can build with the API down). The client refresh
// flips `status` from 'snapshot' to 'live', or to 'stale' when it fails.
//
// GET /v1/sources returns 404 (docs/v3/code/README §7), so everything comes from /v1/stats through
// landing/api-map.ts. Nothing else on this route reads an endpoint of its own.

import { landingDataFromStats, type LandingData, type StatsResponse } from "@/components/v3/landing";
import type { Stats } from "@/lib/types";

/**
 * Approve → verified, measured on a live approval (11 s on 20 Sep 2026). No response carries it
 * (landing/README §Backend), so it is baked. It is not read off case_demo_ft5427: that record's
 * steps are stamped to the whole second by four Lambdas, so its stored span is 1 s, which measures
 * the stamping, not the work.
 */
export const PIPELINE_SECONDS = 11;

/**
 * GET /v1/stats, read 20 Sep 2026 15:08 IST, mapped through `landingDataFromStats`.
 * The counts match the recorded response in `app/public/fixtures/v1-stats-d902ca77.json`
 * (total 4868; cdsco_nsq 2696, cpsc 1852, openfda 282, nhtsa 38; sources_count 4) and the CDSCO
 * month is the JUL-2026 alert with 239 failed samples.
 *
 * To refresh it: `curl -s "$NEXT_PUBLIC_API_URL/v1/stats"` and re-map the fields exactly as
 * `landing/api-map.ts` does (source ids, `1 day` → `daily`, `generated_at` in IST).
 */
export const LANDING_SNAPSHOT: LandingData = {
  total: 4868,
  bySource: { cdsco: 2696, cpsc: 1852, openfda: 282, nhtsa: 38 },
  sourceCount: 4,
  cdscoLatest: { month: "JUL-2026", label: "July 2026", failed: 239 },
  asOf: "15:08",
  asOfDate: "20 Sep 2026",
  sources: [
    { id: "cdsco", schedule: "daily", status: "ok", lastRunAt: "2026-09-20T09:38:00Z" },
    { id: "cpsc", schedule: "15 min", status: "ok", lastRunAt: "2026-09-20T09:38:00Z" },
    { id: "nhtsa", schedule: "15 min", status: "ok", lastRunAt: "2026-09-20T09:38:00Z" },
    { id: "openfda", schedule: "15 min", status: "ok", lastRunAt: "2026-09-20T09:38:00Z" },
  ],
  pipelineSeconds: PIPELINE_SECONDS,
};

/** The four sources api-map.ts knows; anything else the API grows is ignored rather than mis-keyed. */
const API_SOURCES = ["cdsco_nsq", "cpsc", "nhtsa", "openfda"] as const;
type ApiSource = (typeof API_SOURCES)[number];
const isApiSource = (s: string): s is ApiSource => (API_SOURCES as readonly string[]).includes(s);

/**
 * `Stats` (lib/types, what the shell polls) → `LandingData`, by way of `landingDataFromStats`.
 * The two shapes differ only in what the API may leave out, so this fills those in from the
 * snapshot and hands the rest to the pack's mapper. Returns null when the response cannot be
 * mapped, which keeps the snapshot on screen instead of showing half a page of numbers.
 */
export function landingDataFromAppStats(stats: Stats, snapshot: LandingData = LANDING_SNAPSHOT): LandingData | null {
  const sources: StatsResponse["sources"] = [];
  for (const s of stats.sources) {
    const id = s.source;
    if (!isApiSource(id)) continue;
    sources.push({
      source: id,
      label: s.label,
      count: s.count,
      health: s.health,
      last_run_at: s.last_run_at,
      last_success_at: s.last_success_at,
      polls_every: s.polls_every,
    });
  }
  if (!sources.length || !stats.generated_at || Number.isNaN(Date.parse(stats.generated_at))) return null;

  const latest = stats.cdsco_latest;
  const response: StatsResponse = {
    total: stats.total,
    sources_count: stats.sources_count,
    sources,
    // The CDSCO callout is the one field the API may omit; the snapshot's month stands in for it.
    cdsco_latest: latest
      ? { month: latest.month, count: latest.count, published_at: latest.published_at ?? "", complete: latest.complete ?? true }
      : { month: snapshot.cdscoLatest.month, count: snapshot.cdscoLatest.failed, published_at: "", complete: true },
    last_poll_at: stats.last_poll_at ?? stats.generated_at,
    generated_at: stats.generated_at,
  };
  return landingDataFromStats(response, snapshot.pipelineSeconds);
}

/**
 * "See all {n} in the feed" → the CDSCO month that is actually on screen. The params are the ones
 * the /feed spec owns (feed-ingest-api.md: ?source=cdsco_nsq&month=JUL-2026); /feed reads ?source=
 * today and ignores ?month=.
 */
export function feedCdscoMonthHref(data: LandingData): string {
  return `/feed/?source=cdsco_nsq&month=${encodeURIComponent(data.cdscoLatest.month)}`;
}

/** The hero poster, shipped at app/public/strip/strip-poster-hero.png (the 3D fallback and the LCP image). */
export const HERO_POSTER = "/strip/strip-poster-hero.png";

/**
 * `/ingest/?replay=<run>`: a stored run is replayable exactly when the /ingest page offers "Replay"
 * for it (components/ingest/recent-runs.tsx). GET /ingest/runs is newest first (ingest_api.py), so
 * the first replayable row is the latest run.
 */
const REPLAYABLE = new Set(["SUCCEEDED", "FAILED"]);
export function latestReplayableRun(runs: { run_id: string; status: string }[]): string | null {
  return runs.find((r) => REPLAYABLE.has(r.status))?.run_id ?? null;
}
