"use client";

import { FileScan } from "lucide-react";

import { StubPage } from "@/components/common/stub-page";

export function IngestStub() {
  return (
    <StubPage
      icon={FileScan}
      title="Ingest"
      what="A CDSCO alert PDF turning into feed rows goes here"
      why="This screen is the next build: the PDF on the left, its rows lifting into the feed on the right, and the pipeline's checklist. The pipeline already runs: every CDSCO row on the feed came through it, archive PDFs via Textract and current months via the portal's JSON."
      action={{ label: "See CDSCO rows on the feed", path: "/?source=cdsco_nsq" }}
    />
  );
}
