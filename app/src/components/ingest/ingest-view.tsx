"use client";

import { AlertTriangle, ArrowUpRight, CheckCircle2, Play } from "lucide-react";
import { useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { useAppState } from "@/components/shell/app-state";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import {
  IDLE_STATE,
  PlayStore,
  coarse,
  isTerminal,
  methodLabel,
  monthLabel,
  stateAt,
  stateFromStatus,
  type PlayState,
  type RunSummary,
  type RunView,
  type RunsList,
  type StartBody,
  type StatusBody,
} from "@/lib/ingest";
import { usePoll } from "@/lib/use-poll";

import { DissolveColumn, type ColumnHandle } from "./dissolve-column";
import { runDissolve } from "./dissolve-engine";
import { IngestChecklist } from "./ingest-checklist";
import type { StageHandle } from "./pdf-stage";
import { RecentRuns } from "./recent-runs";

// pdf.js is browser-only: the stage never renders on the server (static export)
const PdfStage = dynamic(() => import("./pdf-stage").then((m) => memo(m.PdfStage)), {
  ssr: false,
  loading: () => <div className="aspect-[1.414] w-full bg-surface-1" />,
});

/** The run the button starts (live) and the run demo mode replays. */
const JUNE_2025 = { month: "JUN-2025", key: "cdsco/CDSCO_NSQ_june25.pdf" };
export const DEMO_RUN = "ingest-20260919084944-ab53";
const POLL_MS = 1500;
const TICK_MS = 100;
const CAPTION = "archive PDF via Textract · current months via portal JSON";

type Mode = "idle" | "live" | "replay";
type Phase = "waiting" | "running" | "done";

const runEnd = (view: RunView) => Math.max(0, ...view.steps.map((s) => s.end_ms ?? 0));
const IDLE_COARSE = coarse(IDLE_STATE);

export function IngestView() {
  const { demo, ready, href } = useAppState();
  const router = useRouter();
  const search = useSearchParams();
  const replayId = search.get("replay");
  const liveId = search.get("run");
  const speed = Math.min(8, Math.max(0.25, Number(search.get("speed")) || 1));
  const reduce = useReducedMotion() ?? false;

  const [mode, setMode] = useState<Mode>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [view, setView] = useState<RunView | null>(null);
  const [status, setStatus] = useState<{ body: StatusBody; at: number } | null>(null);
  const [clock, setClock] = useState<number | null>(null);
  const store = useMemo(() => new PlayStore(IDLE_STATE), []);
  // the page re-renders when a step changes state, not when a running step's clock ticks
  useSyncExternalStore(
    store.subscribe,
    () => coarse(store.get()),
    () => IDLE_COARSE,
  );
  const play: PlayState = store.get();
  const [phase, setPhase] = useState<Phase>("waiting");
  const [pdfKey, setPdfKey] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [stageReady, setStageReady] = useState(false);
  const [page, setPage] = useState(1);
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stage = useRef<StageHandle | null>(null);
  const column = useRef<ColumnHandle | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const cancel = useRef<(() => void) | null>(null);
  const viewRef = useRef<RunView | null>(null);

  const reset = useCallback(() => {
    cancel.current?.();
    cancel.current = null;
    column.current?.reset();
    viewRef.current = null;
    setView(null);
    setStatus(null);
    setClock(null);
    store.set(IDLE_STATE);
    setPhase("waiting");
    setPage(1);
    setError(null);
  }, [store]);
  useEffect(() => () => cancel.current?.(), []);

  const loadRuns = useCallback(() => {
    apiGet<RunsList>("/ingest/runs", demo)
      .then((list) => {
        setRuns(list.runs);
        setRunsError(null);
      })
      .catch((err) => setRunsError(err instanceof Error ? err.message : String(err)));
  }, [demo]);

  // which run this URL is about: ?replay=<id> plays a stored run, ?run=<id> follows a live one
  useEffect(() => {
    if (!ready) return;
    reset();
    loadRuns();
    if (replayId) {
      setMode("replay");
      setRunId(replayId);
      apiGet<RunView>(`/ingest/runs/${encodeURIComponent(replayId)}`, demo)
        .then((v) => {
          viewRef.current = v;
          setView(v);
          setPdfKey(v.pdf_s3_key ?? JUNE_2025.key);
        })
        .catch((err) => setError(`Could not load run ${replayId}: ${err instanceof Error ? err.message : err}`));
    } else if (liveId) {
      setMode("live");
      setRunId(liveId);
      setPdfKey((key) => key ?? JUNE_2025.key);
    } else {
      setMode("idle");
      setRunId(null);
      setPdfKey((key) => key ?? JUNE_2025.key);
    }
  }, [ready, replayId, liveId, demo, reset, loadRuns]);

  // the PDF: a presigned S3 URL (live) or the recorded copy under /fixtures (demo)
  useEffect(() => {
    if (!ready || !pdfKey) return;
    let stale = false;
    setStageReady(false);
    apiGet<{ url: string }>(`/ingest/pdf?key=${encodeURIComponent(pdfKey)}`, demo)
      .then(({ url }) => !stale && setPdfUrl(url))
      .catch((err) => !stale && setError(`Could not open the PDF: ${err instanceof Error ? err.message : err}`));
    return () => {
      stale = true;
    };
  }, [ready, pdfKey, demo]);

  // replay: the clock starts once the PDF is on screen
  useEffect(() => {
    if (mode === "replay" && view && stageReady && clock === null) setClock(performance.now());
  }, [mode, view, stageReady, clock]);

  // live: the status every 1.5 s; the rows (with their notices) once Extract has written them
  usePoll(
    async (signal) => {
      if (!runId) return;
      const body = await apiGet<StatusBody>(`/ingest/status/${encodeURIComponent(runId)}`, demo, signal);
      setStatus({ body, at: Date.now() });
      if (body.pdf?.pdf_s3_key) setPdfKey(body.pdf.pdf_s3_key);
      const extractDone = body.steps.find((s) => s.name === "Extract")?.state === "done";
      if (extractDone && !viewRef.current) {
        const v = await apiGet<RunView>(`/ingest/runs/${encodeURIComponent(runId)}`, demo, signal);
        if (v.rows_ready) {
          viewRef.current = v;
          setView(v);
        }
      }
      if (isTerminal(body.status)) loadRuns();
    },
    POLL_MS,
    mode === "live" && !!runId && !(status && isTerminal(status.body.status) && (viewRef.current || !play.rowsReady)),
  );

  // the play state, 10 times a second while something is moving
  useEffect(() => {
    const compute = (): boolean => {
      let next: PlayState | null = null;
      let over = false;
      if (mode === "replay" && view && clock !== null) {
        const t = (performance.now() - clock) * speed;
        next = stateAt(view, t);
        over = t > runEnd(view);
      } else if (mode === "live" && status) {
        next = stateFromStatus(status.body, Date.now() - status.at);
        over = isTerminal(status.body.status);
      } else {
        return true;
      }
      store.set(next);
      return over;
    };
    if (compute()) return;
    const id = setInterval(() => compute() && clearInterval(id), TICK_MS);
    return () => clearInterval(id);
  }, [mode, view, clock, speed, status, store]);

  // the dissolve starts when the run's rows exist and every page is rendered
  const rows = view?.rows_ready && play.rowsReady ? view.rows : null;
  useEffect(() => {
    if (phase !== "waiting" || !rows || !stageReady) return;
    const s = stage.current;
    const c = column.current;
    const l = layer.current;
    if (!s || !c || !l) return;
    setPhase("running");
    cancel.current = runDissolve({
      rows,
      stage: s,
      column: c,
      layer: l,
      showPage: setPage,
      reduce,
      onDone: () => setPhase("done"),
    });
  }, [phase, rows, stageReady, reduce]);

  const start = async () => {
    if (demo) {
      // demo data has no API to run against: play the recorded run instead
      router.replace(href(`/ingest/?replay=${DEMO_RUN}`));
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const out = await apiPost<StartBody>("/ingest/run", { force: true, month: JUNE_2025.month }, demo);
      router.replace(`/ingest/?run=${encodeURIComponent(out.run_id)}`);
    } catch (err) {
      setError(`Could not start a run: ${err instanceof Error ? err.message : err}`);
    } finally {
      setStarting(false);
    }
  };

  const onReady = useCallback(() => setStageReady(true), []);
  const onPage = useCallback((n: number) => setPage(n), []);
  const busy = starting || (mode !== "idle" && !isTerminal(play.status) && play.status !== "IDLE") || phase === "running";
  const month = monthLabel(play.month ?? view?.month ?? JUNE_2025.month);
  const failedStep = play.steps.find((s) => s.state === "failed");
  const title = useMemo(() => `CDSCO NSQ ${month}`, [month]);

  return (
    <section aria-labelledby="ingest-title" className="flex flex-col gap-4 px-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="ingest-title" className="m-0 font-display text-2xl leading-tight font-semibold text-ink md:text-3xl">
            A CDSCO alert PDF, becoming the feed
          </h1>
          <p className="mt-1 mb-0 text-sm text-muted">
            {title} · the regulator&apos;s monthly list of drugs that failed quality tests, read row by row
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {runId && (
            <span className="font-mono text-xs text-muted">
              {mode === "replay" ? "replay of " : ""}
              {runId}
              {mode === "replay" && speed !== 1 ? ` · ×${speed}` : ""}
            </span>
          )}
          <Button variant="outline" onClick={start} disabled={busy} title={demo ? "Demo data: plays the recorded run" : undefined}>
            <Play aria-hidden /> {starting ? "Starting…" : busy && mode === "live" ? "Running…" : "Run ingest"}
          </Button>
        </div>
      </div>

      <IngestChecklist store={store} />

      {error && (
        <p
          role="alert"
          className="m-0 flex items-center gap-2 border border-danger/60 bg-danger px-3 py-2 text-[13px] text-ink"
        >
          <AlertTriangle aria-hidden className="size-4 text-danger" /> {error}
        </p>
      )}
      {play.status === "SUCCEEDED" && phase === "done" && (
        <div
          role="status"
          className="ingest-fade-in flex flex-wrap items-center gap-x-3 gap-y-2 border border-line bg-surface-1 px-4 py-3"
        >
          <CheckCircle2 aria-hidden className="size-5 text-success" />
          <p className="m-0 text-sm text-ink">
            <span className="font-display text-lg font-semibold">{play.noticesOut ?? "—"} notices</span>
            <span className="text-muted"> · </span>
            {methodLabel(play.method)}
            <span className="text-muted"> · </span>CDSCO NSQ {month}
            <span className="text-muted"> · </span>
            {play.newSinceLast ?? "—"} new since last run
          </p>
          <Link
            prefetch={false}
            href={href("/?source=cdsco_nsq")}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-sm border border-line px-3 text-[13px] text-primary hover:bg-surface-2"
          >
            Open in feed <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        </div>
      )}
      {failedStep && isTerminal(play.status) && (
        <p role="alert" className="m-0 border border-danger/60 bg-danger px-3 py-2 text-[13px] text-ink">
          The run stopped at {failedStep.name}: {play.error ?? "see the step above"}. Nothing new was published.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <PdfStage
          handle={stage}
          url={pdfUrl}
          rows={rows}
          page={page}
          onPage={onPage}
          locked={phase === "running"}
          onReady={onReady}
          caption={CAPTION}
          pages={play.pages}
        />
        <DissolveColumn
          ref={column}
          title={`Notices · ${title}`}
          rowsIn={play.rowsIn}
          settled={phase === "done"}
          reduce={reduce}
          empty={
            mode === "idle"
              ? "Run ingest: each table row on the left lifts off the page and lands here as a notice."
              : "Rows land here as soon as Textract has read the tables."
          }
        />
      </div>

      <RecentRuns runs={runs} error={runsError} active={runId} />
      {/* flights live here, above everything, never catching the pointer */}
      <div ref={layer} aria-hidden className="ingest-layer pointer-events-none fixed inset-0 z-40 overflow-hidden" />
    </section>
  );
}
