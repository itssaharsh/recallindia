import type { Metadata } from "next";

import { IngestStub } from "./stub";

export const metadata: Metadata = { title: "Ingest" };

export default function IngestPage() {
  return <IngestStub />;
}
