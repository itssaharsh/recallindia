"use client";

import { Braces } from "lucide-react";

import { StubPage } from "@/components/common/stub-page";
import { API_URL } from "@/lib/api";

const base = API_URL || "https://<api>";
const EXAMPLES = [
  `curl "${base}/v1/notices?source=cdsco_nsq&since=2026-07-01"`,
  `curl "${base}/v1/notices?q=paracetamol&limit=5"`,
  `curl "${base}/v1/stats"`,
];

export function ApiStub() {
  return (
    <StubPage
      icon={Braces}
      title="API"
      what="The public API reference goes here"
      why="Every notice on the feed is on the HTTP API too, with no key. The reference page is a later build; the endpoints already answer."
      action={{ label: "See the same notices on the feed", path: "/" }}
    >
      <pre className="mx-auto max-w-lg overflow-x-auto rounded-sm border border-line bg-surface-1 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-text">
        {EXAMPLES.join("\n")}
      </pre>
    </StubPage>
  );
}
