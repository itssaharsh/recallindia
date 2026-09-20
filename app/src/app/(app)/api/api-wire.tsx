"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppState } from "@/components/shell/app-state";
import { apiExamples, emptyRequest, requestPath } from "@/components/v3/feed-ingest-api/apiRequest";
import { ApiView } from "@/components/v3/feed-ingest-api/ApiView";
import type { TryItRequest, TryItResponse, TryItResult } from "@/components/v3/feed-ingest-api/types";
import { API_URL } from "@/lib/api";

import { toV3Stats } from "../feed/api-map";

/** The same base the curl line prints, so a copied command is the request the page just ran. */
const BASE = API_URL || "https://ilbmeuwrt7.execute-api.ap-south-1.amazonaws.com";

const EPOCH = new Date(0).toISOString();

/** A page clock. Epoch until the client mounts, so the prerendered HTML and hydration agree. */
function useNow(ms = 60_000): string {
  const [now, setNow] = useState(EPOCH);
  useEffect(() => {
    setNow(new Date().toISOString());
    const id = setInterval(() => setNow(new Date().toISOString()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** `count` when the body has one, else the length of `notices[]`, else null (stats, one notice). */
function countOf(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { count?: unknown; notices?: unknown };
  if (typeof b.count === "number") return b.count;
  if (Array.isArray(b.notices)) return b.notices.length;
  return null;
}

function cursorOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const c = (body as { next_cursor?: unknown }).next_cursor;
  return typeof c === "string" ? c : null;
}

/**
 * /api (v3). The console runs the same public endpoints the page documents — `GET /v1/notices`,
 * `/v1/notices/{id}` and `/v1/stats` — straight from the browser, timed with performance.now(),
 * so the ms it reports is the request the curl line copies. The sources table reads the
 * `/v1/stats` the app state already polls.
 */
export function ApiWire() {
  const { stats: rawStats, statsError, refreshStats } = useAppState();
  const now = useNow();
  const examples = useMemo(() => apiExamples(now), [now]);

  // The fields start empty and the mount effect fills them from the first example: a date built
  // from `new Date()` here would differ between the prerendered HTML and hydration.
  const [request, setRequest] = useState<TryItRequest>(emptyRequest);
  const [activeExample, setActiveExample] = useState<string | null>(null);
  const [result, setResult] = useState<TryItResult>({ state: "idle" });
  const [intro, setIntro] = useState(true);
  const requestRef = useRef(request);
  requestRef.current = request;

  const run = useCallback(async (req: TryItRequest) => {
    setResult((prev) => ({ state: "loading", previous: prev.state === "done" ? prev.response : undefined }));
    const started = performance.now();
    try {
      const resp = await fetch(`${BASE}${requestPath(req)}`, { cache: "no-store" });
      const text = await resp.text();
      const ms = Math.round(performance.now() - started);
      let body: unknown = {};
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      const response: TryItResponse = {
        status: resp.status,
        ms,
        body,
        count: countOf(body),
        next_cursor: cursorOf(body),
      };
      setResult({ state: "done", response });
    } catch (err) {
      setResult({ state: "network-error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // the first example runs once on load, so the console is never empty (spec 3.1)
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || now === EPOCH) return;
    autoRan.current = true;
    const first = apiExamples(now)[0];
    setRequest(first.request);
    setActiveExample(first.key);
    void run(first.request);
    const id = setTimeout(() => setIntro(false), 2500);
    return () => clearTimeout(id);
  }, [now, run]);

  const stats = useMemo(() => toV3Stats(rawStats), [rawStats]);

  return (
    <ApiView
      as="div"
      baseUrl={BASE}
      now={now}
      console={{ request, result, examples, activeExample, intro }}
      stats={stats}
      statsState={rawStats ? "ready" : statsError ? "error" : "loading"}
      on={{
        requestChange: (next) => {
          setRequest(next);
          setActiveExample(null);
          setIntro(false);
        },
        run: () => void run(requestRef.current),
        example: (key) => {
          const ex = examples.find((e) => e.key === key);
          if (!ex) return;
          setRequest(ex.request);
          setActiveExample(ex.key);
          setIntro(false);
          void run(ex.request);
        },
        nextPage: (cursor) => {
          const next = { ...requestRef.current, cursor };
          setRequest(next);
          setActiveExample(null);
          setIntro(false);
          void run(next);
        },
        retryStats: refreshStats,
      }}
    />
  );
}
