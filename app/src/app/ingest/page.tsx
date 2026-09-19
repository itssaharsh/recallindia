import type { Metadata } from "next";
import { Suspense } from "react";

import { IngestView } from "@/components/ingest/ingest-view";

export const metadata: Metadata = { title: "Ingest" };

// useSearchParams (?replay= / ?run= / ?speed=) needs a Suspense boundary in a static export
export default function IngestPage() {
  return (
    <Suspense fallback={<div className="px-5 py-5 text-sm text-muted">Loading the ingest view…</div>}>
      <IngestView />
    </Suspense>
  );
}
