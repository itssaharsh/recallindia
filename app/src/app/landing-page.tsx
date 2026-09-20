"use client";

import { useEffect, useMemo, useState } from "react";

import { useAppState } from "@/components/shell/app-state";
import {
  LandingView,
  applyLandingQa,
  landingLinks,
  landingStory,
  useLandingQaState,
  type LandingDataStatus,
  type LandingLinks,
} from "@/components/v3/landing";
import { apiGet } from "@/lib/api";
import type { RunsList } from "@/lib/ingest";

import { HERO_POSTER, LANDING_SNAPSHOT, feedCdscoMonthHref, landingDataFromAppStats, latestReplayableRun } from "./landing-data";

/**
 * The landing's one client wrapper (landing/README §Wiring).
 *
 * Numbers: the page ships with `LANDING_SNAPSHOT` baked in, so the exported HTML already has every
 * figure, and the first /v1/stats response replaces it and flips `status` to 'live' ('stale' if the
 * call fails, which shows the snapshot with its "Updated …" copy). That response is the shell's own
 * poll from `useAppState`, so "/" costs no extra request; every later tick just moves the numbers
 * the way the proof bars and NumberFlow already handle.
 *
 * Links: everything else comes from `landingLinks` (trailing slashes, the export is trailingSlash).
 * "Watch a PDF become the feed" upgrades to a replay of the newest stored run once GET /ingest/runs
 * answers, and stays plain /ingest/ until then.
 *
 * ?state= is read after hydration by `useLandingQaState`, not `useSearchParams`: reading the URL
 * during render would make `output: "export"` prerender the Suspense fallback instead of the page,
 * and "/" must be real HTML.
 */
export function LandingPage() {
  const { demo, ready, stats, statsError } = useAppState();
  const state = useLandingQaState();
  const [replayRun, setReplayRun] = useState<string | null>(null);

  // The newest replayable ingest run, picked the way /ingest's "Recent runs" picks one.
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    apiGet<RunsList>("/ingest/runs", demo, controller.signal)
      .then(({ runs }) => setReplayRun(latestReplayableRun(runs)))
      // no run list: the CTA keeps plain /ingest/, which starts its own replay
      .catch(() => undefined);
    return () => controller.abort();
  }, [ready, demo]);

  const live = useMemo(() => (stats ? landingDataFromAppStats(stats) : null), [stats]);
  const status: LandingDataStatus = live ? "live" : statsError ? "stale" : "snapshot";
  // ?state=source-down and ?state=stale are about the data, so they are applied here, not in the view
  const { data, status: shownStatus } = applyLandingQa(state, live ?? LANDING_SNAPSHOT, status);

  const links: Partial<LandingLinks> = useMemo(
    () => ({
      feedCdscoMonth: feedCdscoMonthHref(data),
      ingest: replayRun
        ? `/ingest/?replay=${encodeURIComponent(replayRun)}&speed=2&autoplay=1`
        : landingLinks.ingest,
    }),
    [data, replayRun],
  );

  return (
    <LandingView
      data={data}
      status={shownStatus}
      story={landingStory}
      links={links}
      state={state}
      assets={{ poster: HERO_POSTER }}
    />
  );
}
