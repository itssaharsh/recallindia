"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

import { Num } from "@/components/common/num";
import { useAppState } from "@/components/shell/app-state";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import { fmtCount, fmtWhen, sourceLabel } from "@/lib/format";

const BASE = API_URL || "https://ilbmeuwrt7.execute-api.ap-south-1.amazonaws.com";

const ENDPOINTS = [
  {
    method: "GET",
    path: "/v1/notices",
    what: "Every notice, newest first, one page at a time.",
    params: [
      ["source", "cdsco_nsq | cpsc | nhtsa | openfda"],
      ["since", "2026-07-01 (published on or after)"],
      ["q", "paracetamol (matches product, brand, batch)"],
      ["limit", "50 (max 100)"],
      ["cursor", "the previous page's next_cursor"],
    ],
    returns: "notices[], count, next_cursor",
  },
  {
    method: "GET",
    path: "/v1/notices/{id}",
    what: "One notice by its key, e.g. cdsco_nsq#JUL-2026-cdsco_portal-b75cfffe3713.",
    params: [],
    returns: "the notice, including raw_excerpt and row_ref",
  },
  {
    method: "GET",
    path: "/v1/stats",
    what: "Counts per source, each poller's health, and the newest CDSCO month.",
    params: [],
    returns: "total, sources[], cdsco_latest, last_poll_at",
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy this command"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface-1 text-muted hover:bg-surface-2 hover:text-ink"
    >
      {copied ? <Check aria-hidden className="size-4 text-success" /> : <Copy aria-hidden className="size-4" />}
    </button>
  );
}

/** C-21: the feed is a public API, and here is the request that proves it. */
export function ApiView() {
  const { stats } = useAppState();
  const [source, setSource] = useState("cdsco_nsq");
  const [since, setSince] = useState("2026-07-01");
  const [q, setQ] = useState("");
  const [state, setState] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [result, setResult] = useState<{ status: number; ms: number; count: number; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const path = `/v1/notices?${new URLSearchParams(
    Object.entries({ source, since, q, limit: "5" }).filter(([, v]) => v) as [string, string][],
  ).toString()}`;
  const curl = `curl "${BASE}${path}"`;

  const run = useCallback(async () => {
    setState("running");
    setError(null);
    const started = performance.now();
    try {
      const resp = await fetch(`${BASE}${path}`, { cache: "no-store" });
      const body = await resp.json();
      setResult({
        status: resp.status,
        ms: Math.round(performance.now() - started),
        count: Array.isArray(body?.notices) ? body.notices.length : 0,
        body: JSON.stringify(body, null, 2),
      });
      setState(resp.ok ? "ok" : "error");
      if (!resp.ok) setError(`The API returned ${resp.status}. Try again in a moment.`);
    } catch (err) {
      setState("error");
      setError(`The API didn't answer (${err instanceof Error ? err.message : String(err)}). Try again.`);
    }
  }, [path]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-10 px-5 py-8 md:px-8">
      <header className="space-y-2">
        <h1 className="font-display text-[40px] leading-[1.1] font-extrabold tracking-[-0.03em] text-ink">Public API</h1>
        <p className="max-w-2xl text-[18px] text-muted">
          Every notice on the feed, as JSON. No key needed, CORS open, and the same request works from a terminal.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[440px_minmax(0,1fr)]">
        <section aria-labelledby="endpoints" className="space-y-5">
          <h2 id="endpoints" className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">
            Endpoints
          </h2>
          {ENDPOINTS.map((ep) => (
            <article key={ep.path} className="space-y-2 border-t border-line pt-4">
              <p className="font-mono text-[14px] text-ink">
                <span className="text-success">{ep.method}</span> {ep.path}
              </p>
              <p className="text-[14px] text-muted">{ep.what}</p>
              {ep.params.length > 0 && (
                <dl className="space-y-1">
                  {ep.params.map(([name, example]) => (
                    <div key={name} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2 text-[13px]">
                      <dt className="font-mono text-ink">{name}</dt>
                      <dd className="text-muted">{example}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="text-[13px] text-muted">
                Returns <span className="font-mono text-ink">{ep.returns}</span>
              </p>
            </article>
          ))}
        </section>

        <section aria-labelledby="console" className="space-y-4">
          <h2 id="console" className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">
            Try it
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-[13px] text-muted">
              <span className="block">Source</span>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="h-10 rounded-md border border-line-strong bg-surface-1 px-3 text-[15px] text-ink"
              >
                <option value="">all</option>
                {(stats?.sources ?? []).map((s) => (
                  <option key={s.source} value={s.source}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-[13px] text-muted">
              <span className="block">Published since</span>
              <input
                type="date"
                value={since}
                onChange={(e) => setSince(e.target.value)}
                className="h-10 rounded-md border border-line-strong bg-surface-1 px-3 text-[15px] text-ink"
              />
            </label>
            <label className="min-w-40 flex-1 space-y-1 text-[13px] text-muted">
              <span className="block">Search</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="paracetamol"
                className="h-10 w-full rounded-md border border-line-strong bg-surface-1 px-3 text-[15px] text-ink"
              />
            </label>
            <Button onClick={run} disabled={state === "running"} aria-busy={state === "running"}>
              {state === "running" ? "Requesting…" : "Run request"}
            </Button>
          </div>

          <div className="flex items-start gap-2">
            <pre className="min-w-0 flex-1 overflow-x-auto border border-line bg-surface-1 px-3 py-2.5 font-mono text-[13px] text-ink">
              {curl}
            </pre>
            <CopyButton text={curl} />
          </div>

          <p className="text-[13px] text-muted" role="status">
            {state === "running" && "Requesting…"}
            {state !== "running" && result && (
              <>
                <span className={result.status === 200 ? "text-success" : "text-warning"}>{result.status}</span> ·{" "}
                <Num value={result.ms} /> ms · <Num value={result.count} /> notices
              </>
            )}
            {state === "idle" && !result && "Run the request to see the JSON."}
          </p>
          {error && <p className="text-[13px] text-warning">{error}</p>}
          {result && (
            <pre className="max-h-[480px] overflow-auto border border-line bg-surface-1 p-4 font-mono text-[13px] leading-relaxed text-ink">
              {result.body}
            </pre>
          )}
        </section>
      </div>

      <section aria-labelledby="sources" className="space-y-3">
        <h2 id="sources" className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">
          Sources
        </h2>
        <div role="table" className="w-full border-t border-line text-[14px]">
          <div role="row" className="grid grid-cols-[1fr_7rem_7rem_9rem_minmax(0,1fr)] gap-3 border-b border-line bg-surface-1 px-3 py-2 text-[12px] font-bold tracking-[0.08em] text-muted uppercase">
            <span role="columnheader">Source</span>
            <span role="columnheader">Notices</span>
            <span role="columnheader">Health</span>
            <span role="columnheader">Polls every</span>
            <span role="columnheader">Last success</span>
          </div>
          {(stats?.sources ?? []).map((s) => (
            <div key={s.source} role="row" className="grid grid-cols-[1fr_7rem_7rem_9rem_minmax(0,1fr)] gap-3 border-b border-line px-3 py-2.5">
              <span role="cell" className="text-ink">
                {sourceLabel(s.source)}
              </span>
              <span role="cell" className="text-ink">
                <Num value={fmtCount(s.count)} />
              </span>
              <span role="cell" className={s.health === "healthy" ? "text-success" : s.health === "degraded" ? "text-warning" : "text-danger"}>
                {s.health}
              </span>
              <span role="cell" className="text-muted">
                {s.polls_every}
              </span>
              <span role="cell" className="text-muted">
                {s.last_success_at ? `${fmtWhen(s.last_success_at)} IST` : "—"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
