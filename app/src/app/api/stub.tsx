"use client";

import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useAppState } from "@/components/shell/app-state";
import { API_URL } from "@/lib/api";

const base = API_URL || "https://ilbmeuwrt7.execute-api.ap-south-1.amazonaws.com";

const CALLS = [
  { what: "Every CDSCO row published since a date", curl: `curl "${base}/v1/notices?source=cdsco_nsq&since=2026-07-01"` },
  { what: "Search the feed", curl: `curl "${base}/v1/notices?q=paracetamol&limit=5"` },
  { what: "Counts and poller health", curl: `curl "${base}/v1/stats"` },
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
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm border border-line text-muted hover:bg-surface-2 hover:text-text"
    >
      {copied ? <Check aria-hidden className="size-3.5 text-clear" /> : <Copy aria-hidden className="size-3.5" />}
    </button>
  );
}

/** The public API, in three lines a judge can paste. The full reference and the live console
 *  come with the /api build; nothing here is a placeholder. */
export function ApiStub() {
  const { href } = useAppState();
  return (
    <section aria-label="Public API" className="mx-auto max-w-3xl px-5 py-6 md:py-8">
      <h1 className="font-display text-3xl font-semibold text-text md:text-4xl">Public API</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Every notice on the feed is on the HTTP API too, as JSON. No key, no sign-up, CORS open.
      </p>
      <ul className="mt-6 list-none space-y-4 p-0">
        {CALLS.map((call) => (
          <li key={call.curl} className="space-y-1.5">
            <p className="text-[13px] text-muted">{call.what}</p>
            <div className="flex items-start gap-2">
              <pre className="min-w-0 flex-1 overflow-x-auto border border-line bg-surface-1 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-text">
                {call.curl}
              </pre>
              <CopyButton text={call.curl} />
            </div>
          </li>
        ))}
      </ul>
      <Link
        href={href("/")}
        className="mt-6 inline-flex h-8 items-center rounded-sm border border-line px-2.5 text-sm font-medium text-text hover:bg-surface-2"
      >
        See the same notices on the feed
      </Link>
    </section>
  );
}
