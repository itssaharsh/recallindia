"use client";
import * as React from "react";
import { MotionConfig } from "framer-motion";
import { FlightLayer } from "./FlightLayer";
import { monthStart } from "./format";
import { IngestHeader } from "./IngestHeader";
import type { IngestFrame } from "./ingestTimeline";
import { NoticesPane } from "./NoticesPane";
import { PdfStage, PdfStandIn } from "./PdfStage";
import { StepChecklist } from "./StepChecklist";
import type { IngestRun, IngestSpeed, IngestStepKey } from "./types";
import type { ReplayPhase } from "./useIngestReplay";

export interface IngestViewProps {
  /** The recorded run (replay bundle), see fixtures.ingest.ts and README "Wiring". */
  run: IngestRun;
  /** From useIngestReplay(run).frame, or ingestStill(run, "dissolving") for a still. */
  frame: IngestFrame;
  phase: ReplayPhase;
  speed: IngestSpeed;
  on: {
    toggle: () => void;
    restart: () => void;
    speed: (s: IngestSpeed) => void;
    retryStep?: (step: IngestStepKey) => void;
  };
  /**
   * The existing react-pdf viewer, kept as is: <Document> with a <Page> per page, each holding
   * <PageOverlay page={n} run={run} frame={frame} />. Omitted → the HTML stand-in (kit, video).
   */
  pdf?: React.ReactNode;
  /** Done state primary: "/feed?source=cdsco_nsq&since=2025-06-01" */
  feedHref?: string;
}

/**
 * /ingest (spec §2): a real CDSCO PDF read by Textract, every row boxed on the page and flown
 * into the notices list. Mockups: ingest-1536.png and ingest-390.png (?state=dissolving).
 */
export function IngestView({ run, frame, phase, speed, on, pdf, feedHref }: IngestViewProps) {
  const workspace = React.useRef<HTMLDivElement>(null);
  const [layoutKey, setLayoutKey] = React.useState(0);
  const onLayout = React.useCallback(() => setLayoutKey((n) => n + 1), []);
  const since = monthStart(run.month);
  const readRows = frame.rows.filter((r) => run.rows[r.index]?.notice);

  return (
    <MotionConfig reducedMotion="user">
      <main id="main" className="mx-auto w-full max-w-[1536px] px-4 pb-5 lg:px-8">
        <IngestHeader run={run} phase={phase} speed={speed} row={Math.min(run.rows_in, frame.processed + 1)} onToggle={on.toggle} onSpeed={on.speed} />
        <StepChecklist steps={frame.steps} onRetry={on.retryStep} />

        <div ref={workspace} className="relative mt-3.5 grid gap-12 lg:mt-4 lg:h-[528px] lg:grid-cols-[minmax(0,1fr)_430px] lg:gap-8">
          <PdfStage fileName={run.file_name} pages={run.pages} frame={frame} follow={phase !== "idle" || frame.rows.length > 0} onLayout={onLayout} className="h-[300px] lg:h-auto">
            {pdf ?? <PdfStandIn run={run} frame={frame} />}
          </PdfStage>
          <NoticesPane run={run} frame={frame} speed={speed} feedHref={feedHref ?? `/feed?source=cdsco_nsq&since=${since}`} onReplay={on.restart} />
          <FlightLayer frame={frame} workspace={workspace} month={run.month} layoutKey={layoutKey} />
        </div>

        <ol className="sr-only" aria-live="polite" aria-relevant="additions" aria-label="Rows read so far">
          {readRows.map((r) => {
            const n = run.rows[r.index].notice!;
            return <li key={r.index}>{`Row ${r.row}: ${n.product}${n.batch ? `, batch ${n.batch}` : ""}`}</li>;
          })}
        </ol>
      </main>
    </MotionConfig>
  );
}
