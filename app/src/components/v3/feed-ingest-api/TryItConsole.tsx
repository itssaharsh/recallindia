"use client";
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Calendar, Check, ChevronDown, Copy, Play } from "lucide-react";
import { Button, cn, Kbd } from "../ui";
import { buildCurl, ENDPOINTS, limitError, NOTICE_KEY_ORDER, queryParts } from "./apiRequest";
import { useCopy } from "./hooks";
import { JsonViewer } from "./JsonViewer";
import { springSnappy } from "./motion";
import { fieldShell, FieldLabel, Segmented, Skeleton } from "./primitives";
import { SOURCE_ORDER, SOURCES } from "./sources";
import type { ApiExample, Endpoint, SourceId, TryItRequest, TryItResult } from "./types";

export interface TryItConsoleProps {
  baseUrl: string;
  /** Controlled fields; the curl always mirrors them. */
  request: TryItRequest;
  result: TryItResult;
  examples: ApiExample[];
  activeExample: string | null;
  onRequestChange: (next: TryItRequest) => void;
  /** Run the request (the page does the fetch and times it with performance.now()). */
  onRun: () => void;
  /** Picking a chip fills the fields and runs. */
  onExample: (key: string) => void;
  /** "next_cursor for page 2": same request with cursor */
  onNextPage?: (cursor: string) => void;
  /** First auto-run: curl query mask-reveals, status pops, first 18 JSON lines fade up. */
  intro?: boolean;
}

export function MethodBadge({ className }: { className?: string }) {
  return <span className={cn("inline-flex h-[22px] shrink-0 items-center rounded-xs bg-success-soft px-[7px] font-mono text-[11.5px] leading-none font-bold tracking-[.04em] text-success", className)}>GET</span>;
}

/**
 * Form (334 px) + response (curl · status · JSON) in one 520 px card at 1536; stacked at 390 (spec 3.3).
 * Matches api-1536.png / api-390.png after the first request (200 · 48 ms · 5 notices).
 */
export function TryItConsole(p: TryItConsoleProps) {
  const { request: req } = p;
  const set = (patch: Partial<TryItRequest>) => p.onRequestChange({ ...req, ...patch, cursor: undefined });
  const running = p.result.state === "loading";
  const limitErr = limitError(req.limit);
  const [isMac, setIsMac] = React.useState(true);
  React.useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);

  return (
    <section
      aria-label="Try the API"
      className="grid overflow-hidden rounded-md border border-line bg-surface-1 shadow-2 lg:h-[520px] lg:grid-cols-[334px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:rounded-lg"
    >
      <form
        aria-label="Try a request"
        className="flex flex-col gap-3 border-b border-line p-4 lg:gap-3.5 lg:border-r lg:border-b-0 lg:px-5 lg:pt-[18px] lg:pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!limitErr) p.onRun();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (!limitErr) p.onRun();
          }
        }}
      >
        <h2 className="font-display text-[20px] leading-none font-extrabold tracking-[-.02em] text-ink">Try it</h2>
        <div role="group" aria-label="Examples" className="flex flex-wrap gap-1.5">
          {p.examples.map((ex) => (
            <button
              key={ex.key}
              type="button"
              aria-pressed={p.activeExample === ex.key}
              onClick={() => p.onExample(ex.key)}
              className={cn(
                "inline-flex h-[30px] items-center rounded-pill border px-[9px] text-[13px] leading-none font-medium whitespace-nowrap pointer-coarse:h-11",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
                p.activeExample === ex.key ? "border-transparent bg-cobalt-soft text-cobalt" : "border-line bg-surface-1 text-ink hover:bg-surface-2",
              )}
            >
              {ex.label}
            </button>
          ))}
        </div>

        <div>
          <FieldLabel htmlFor="api-endpoint" label="Endpoint" />
          <div className={cn(fieldShell, "relative")}>
            <MethodBadge />
            <span className="min-w-0 flex-1 truncate font-mono text-[14px]">{req.endpoint}</span>
            <ChevronDown aria-hidden className="size-[18px] shrink-0 text-ink-muted" />
            <select
              id="api-endpoint"
              value={req.endpoint}
              onChange={(e) => set({ endpoint: e.target.value as Endpoint })}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {ENDPOINTS.map((e) => (
                <option key={e} value={e}>
                  GET {e}
                </option>
              ))}
            </select>
          </div>
        </div>

        {req.endpoint === "/v1/notices" && (
          <>
            <div>
              <FieldLabel htmlFor="api-source" label="Source" />
              <div className={cn(fieldShell, "relative")} data-source={req.source || undefined}>
                {req.source && <span aria-hidden className="size-2.5 shrink-0 rounded-[3px] bg-src" />}
                <span className="min-w-0 flex-1 truncate">
                  {req.source ? (
                    <>
                      {SOURCES[req.source].label} <small className="font-mono text-[13px] text-ink-muted">· {req.source}</small>
                    </>
                  ) : (
                    "Any source"
                  )}
                </span>
                <ChevronDown aria-hidden className="size-[18px] shrink-0 text-ink-muted" />
                <select
                  id="api-source"
                  value={req.source}
                  onChange={(e) => set({ source: e.target.value as SourceId | "" })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  <option value="">Any source</option>
                  {SOURCE_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {SOURCES[s].label} · {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="api-since" label="Since" hint="published on or after" />
              <div className={fieldShell}>
                <Calendar aria-hidden className="size-[18px] shrink-0 text-ink-muted" />
                <input
                  id="api-since"
                  inputMode="numeric"
                  placeholder="YYYY-MM-DD"
                  pattern="\d{4}-\d{2}-\d{2}"
                  value={req.since}
                  onChange={(e) => set({ since: e.target.value })}
                  className="h-full min-w-0 flex-1 bg-transparent font-mono text-[14px] outline-none placeholder:text-ink-subtle"
                />
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_76px] gap-2.5">
              <div>
                <FieldLabel htmlFor="api-q" label="q" hint="search" />
                <div className={fieldShell}>
                  <input id="api-q" value={req.q} placeholder="e.g. FT5427" onChange={(e) => set({ q: e.target.value })} className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-subtle" />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="api-limit" label="limit" />
                <div className={cn(fieldShell, limitErr && "border-danger")}>
                  <input
                    id="api-limit"
                    inputMode="numeric"
                    value={req.limit}
                    aria-invalid={!!limitErr}
                    aria-describedby={limitErr ? "api-limit-err" : undefined}
                    onChange={(e) => set({ limit: e.target.value.replace(/\D/g, "") })}
                    className="h-full w-full min-w-0 bg-transparent font-mono text-[14px] outline-none"
                  />
                </div>
                {limitErr && (
                  <p id="api-limit-err" className="mt-1 text-[13px] text-danger">
                    {limitErr}
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {req.endpoint === "/v1/notices/{id}" && (
          <div>
            <FieldLabel htmlFor="api-id" label="id" hint="the notice pk" />
            <div className={fieldShell}>
              <input id="api-id" value={req.id} placeholder="e.g. cpsc#10984" onChange={(e) => set({ id: e.target.value })} className="h-full min-w-0 flex-1 bg-transparent font-mono text-[14px] outline-none placeholder:text-ink-subtle" />
            </div>
          </div>
        )}

        {(req.endpoint === "/v1/stats" || req.endpoint === "/v1/sources") && <p className="text-[14px] text-ink-muted">This endpoint takes no parameters.</p>}

        <Button type="submit" loading={running} disabled={running || !!limitErr} icon={<Play aria-hidden className="size-4" fill="currentColor" />} className="mt-1 w-full lg:mt-auto">
          {running ? "Running…" : "Run request"}
        </Button>
        <p className="-mt-1 hidden items-center justify-center gap-1 text-[12.5px] leading-none text-ink-muted lg:flex">
          <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>↵</Kbd> runs it from any field
        </p>
      </form>

      <Response {...p} />
    </section>
  );
}

function Response(p: TryItConsoleProps) {
  const reduced = useReducedMotion() ?? false;
  const { copied, copy } = useCopy();
  const [mode, setMode] = React.useState<"pretty" | "raw">("pretty");
  const parts = queryParts(p.request);
  const path = p.request.endpoint === "/v1/notices/{id}" ? `/v1/notices/${encodeURIComponent(p.request.id.trim())}` : p.request.endpoint;
  const r = p.result;
  const response = r.state === "done" ? r.response : r.state === "loading" ? r.previous : undefined;
  const body = response?.body;
  const count = response?.count ?? (body && typeof body === "object" && "count" in body ? Number((body as { count: unknown }).count) : null);
  const nextCursor = response?.next_cursor ?? (body && typeof body === "object" && "next_cursor" in body ? ((body as { next_cursor: unknown }).next_cursor as string | null) : null);
  const status = response?.status ?? 0;
  const tone = status >= 500 ? "bg-danger" : status >= 400 ? "bg-warning" : "bg-success";

  return (
    <div className="flex min-h-0 min-w-0 flex-col bg-wash">
      <div className="mx-3 mt-3 flex items-start gap-2.5 rounded-[10px] border border-line bg-surface-1 py-1.5 pr-1.5 pl-3.5 lg:mx-3.5 lg:mt-3.5">
        <span aria-hidden className="pt-2 font-mono text-[13px] leading-none text-ink-muted">
          $
        </span>
        <code className="min-w-0 flex-1 py-[3px] font-mono text-[12.5px] leading-5 [overflow-wrap:anywhere] text-ink">
          curl &quot;{p.baseUrl}
          {path}
          {parts.length > 0 && (
            <>
              ?<wbr />
              {/* inline-block so the mask reveal clips one box (an inline span clips to its first line) */}
              <motion.span
                className="inline-block max-w-full text-ink-muted"
                initial={p.intro ? (reduced ? { opacity: 0 } : { clipPath: "inset(0 100% 0 0)" }) : false}
                animate={reduced ? { opacity: 1 } : { clipPath: "inset(0 0% 0 0)" }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {parts.map((q, i) => (
                  <React.Fragment key={q.key}>
                    {i > 0 && "&"}
                    {q.key}=<FlashValue value={encodeURIComponent(q.value)} />
                  </React.Fragment>
                ))}
              </motion.span>
            </>
          )}
          &quot;
        </code>
        <Button variant="secondary" size="sm" onClick={() => copy(buildCurl(p.baseUrl, p.request))} icon={copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />} className="shrink-0 max-lg:px-2.5">
          <span className="max-lg:sr-only">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>

      <div role="status" className="flex flex-wrap items-center gap-2.5 px-3 py-2.5 text-[14px] leading-none text-ink-muted lg:flex-nowrap lg:px-4 lg:pt-3 lg:pb-2.5">
        {r.state === "idle" && <span className="inline-flex h-[26px] items-center rounded-pill bg-surface-2 px-2.5 font-mono text-[13px] font-bold text-ink-muted">…</span>}
        {r.state === "loading" && (
          <span className="inline-flex items-center gap-2 font-semibold text-ink">
            <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
            Running…
          </span>
        )}
        {r.state === "network-error" && (
          <>
            <span className="inline-flex h-[26px] items-center rounded-pill bg-danger px-2.5 text-[13px] font-bold text-white">Failed</span>
            <span className="leading-[1.35] text-ink">Couldn't reach the API from this page. The curl above works from any terminal.</span>
          </>
        )}
        {r.state === "done" && (
          <>
            <motion.span
              key={`${status}-${r.response.ms}`}
              className={cn("inline-flex h-[26px] items-center rounded-pill px-2.5 font-mono text-[13px] font-bold text-white", tone)}
              initial={p.intro ? { scale: 0.6, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...springSnappy, opacity: { duration: 0.16 } }}
            >
              {status}
            </motion.span>
            <b className="font-semibold text-ink">{Math.round(r.response.ms)} ms</b>
            {count != null && Number.isFinite(count) && (
              <>
                <span aria-hidden className="size-1 rounded-full bg-line-strong" />
                <b className="font-semibold text-ink">
                  {count} {count === 1 ? "notice" : "notices"}
                </b>
              </>
            )}
            {nextCursor && (
              <>
                <span aria-hidden className="hidden size-1 rounded-full bg-line-strong lg:block" />
                <button type="button" onClick={() => p.onNextPage?.(nextCursor)} className="hidden text-ink-muted underline-offset-2 hover:text-cobalt hover:underline lg:inline">
                  next_cursor for page 2
                </button>
              </>
            )}
          </>
        )}
        <span className="hidden flex-1 lg:block" />
        {response && (
          <Segmented
            label="Response format"
            value={mode}
            onChange={setMode}
            options={[
              { value: "pretty", label: "Pretty" },
              { value: "raw", label: "Raw" },
            ]}
            className="max-lg:hidden"
          />
        )}
      </div>

      {r.state === "done" && count === 0 && <p className="px-3 pb-2 text-[13.5px] text-ink lg:px-4">No notices match. Try an earlier date or fewer words.</p>}

      <div className="flex h-[496px] min-h-0 flex-col border-t border-line bg-surface-1 lg:h-auto lg:flex-1">
        {r.state === "idle" ? (
          <div aria-hidden className="space-y-[9px] px-4 py-3.5">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-3" />
            ))}
          </div>
        ) : r.state === "network-error" ? null : mode === "raw" && body !== undefined ? (
          <RawBody body={body} />
        ) : body !== undefined ? (
          <JsonViewer value={body} keyOrder={NOTICE_KEY_ORDER} dim={r.state === "loading"} intro={p.intro} className="flex-1" />
        ) : null}
      </div>
    </div>
  );
}

/** A query value in the curl: always highlighted; flashes when its field changes (600 ms). */
function FlashValue({ value }: { value: string }) {
  const first = React.useRef(true);
  const [flashKey, setFlashKey] = React.useState(0);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setFlashKey((k) => k + 1);
  }, [value]);
  return (
    <b className="relative rounded-[4px] bg-cobalt-soft px-0.5 font-normal text-cobalt">
      {flashKey > 0 && (
        <motion.span key={flashKey} aria-hidden className="absolute -inset-1 rounded-[6px] bg-cobalt-soft" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.6 }} />
      )}
      <span className="relative">{value}</span>
    </b>
  );
}

function RawBody({ body }: { body: unknown }) {
  const { copied, copy } = useCopy();
  const text = JSON.stringify(body, null, 2);
  return (
    <div className="relative min-h-0 flex-1">
      <pre className="absolute inset-0 overflow-auto p-4 font-mono text-[12.5px] leading-5 text-ink">{text}</pre>
      <Button variant="secondary" size="sm" onClick={() => copy(text)} icon={copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />} className="absolute top-2 right-3">
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
