"use client";
import * as React from "react";
import { MotionConfig } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { Button, cn } from "../ui";
import { EndpointDocs } from "./EndpointDocs";
import { useCopy } from "./hooks";
import { SourcesTable } from "./SourcesTable";
import { TryItConsole } from "./TryItConsole";
import type { ApiExample, Stats, TryItRequest, TryItResult } from "./types";

export interface ApiViewProps {
  /** https://ilbmeuwrt7.execute-api.ap-south-1.amazonaws.com */
  baseUrl: string;
  now: string;
  console: {
    request: TryItRequest;
    result: TryItResult;
    examples: ApiExample[];
    activeExample: string | null;
    /** The first auto-run of "CPSC this week" plays the page's load sequence. */
    intro?: boolean;
  };
  stats: Stats | null;
  statsState: "loading" | "ready" | "error";
  /** Render as the page's `<main>` (default) or a `<div>` when the shell already provides `<main>`. */
  as?: "main" | "div";
  on: {
    requestChange: (next: TryItRequest) => void;
    run: () => void;
    example: (key: string) => void;
    nextPage?: (cursor: string) => void;
    retryStats?: () => void;
  };
}

/**
 * /api (spec §3): try it, read it, trust it. Presentational; the route runs fetch() and times it.
 * Mockups: api-1536.png and api-390.png.
 */
export function ApiView(p: ApiViewProps) {
  const Tag = p.as ?? "main";
  return (
    <MotionConfig reducedMotion="user">
      {/* as="div": the app shell already draws the page gutter and max width on its <main>. */}
      <Tag id={Tag === "main" ? "main" : undefined} className={cn("mx-auto w-full", Tag === "main" && "max-w-[1536px] px-4 lg:px-8")}>
        <header className="mt-[18px] flex flex-col gap-3 lg:mt-[22px] lg:flex-row lg:items-end lg:gap-6">
          <div className="min-w-0">
            <h1 className="font-display text-[28px] leading-[1.05] font-extrabold tracking-[-.03em] text-ink lg:text-[34px]">The same notices, as an API</h1>
            <p className="mt-1.5 text-[14.5px] leading-[1.45] text-ink-muted lg:mt-2 lg:text-[15.5px]">Every notice in the feed, with the row or page it was read from. Public, no key, JSON.</p>
          </div>
          <BaseUrl url={p.baseUrl} />
        </header>

        <div className="mt-3.5 grid gap-5 lg:mt-[18px] lg:grid-cols-[minmax(0,1fr)_392px] lg:items-stretch">
          <TryItConsole
            baseUrl={p.baseUrl}
            request={p.console.request}
            result={p.console.result}
            examples={p.console.examples}
            activeExample={p.console.activeExample}
            intro={p.console.intro}
            onRequestChange={p.on.requestChange}
            onRun={p.on.run}
            onExample={p.on.example}
            onNextPage={p.on.nextPage}
          />
          <EndpointDocs open={p.console.request.endpoint} onOpenChange={(endpoint) => p.on.requestChange({ ...p.console.request, endpoint, cursor: undefined })} />
        </div>

        <SourcesTable stats={p.stats} state={p.statsState} now={p.now} onRetry={p.on.retryStats} />
      </Tag>
    </MotionConfig>
  );
}

/** 48 px pill at 1536 (644 px), a card at 390: label + Copy on one line, the URL below at 12 px. */
function BaseUrl({ url }: { url: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2.5 rounded-md border border-line bg-surface-1 py-2.5 pr-2.5 pl-3.5 lg:ml-auto lg:w-[644px] lg:flex-nowrap lg:rounded-pill lg:py-[5px] lg:pr-[5px] lg:pl-4">
      <span className="text-[12px] leading-none font-semibold tracking-[.05em] whitespace-nowrap text-ink-muted uppercase">Base URL</span>
      <span className="order-3 min-w-0 basis-full truncate font-mono text-[12px] text-ink lg:order-none lg:flex-1 lg:basis-auto lg:text-[13.5px]">{url}</span>
      <Button variant="secondary" size="sm" onClick={() => copy(url)} icon={copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />} className="ml-auto lg:ml-0">
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
