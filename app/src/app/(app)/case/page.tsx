import type { Metadata } from "next";
import { Suspense } from "react";

import { CaseWire, CaseWireFallback } from "./case-wire";

export const metadata: Metadata = { title: "Case" };

/** The (app) layout owns the shell and this page's <main>: the route renders content only. The case
 *  id is read from `?id=` on the client, so the boundary is what a static export needs. */
export default function CasePage() {
  return (
    <Suspense fallback={<CaseWireFallback />}>
      <CaseWire />
    </Suspense>
  );
}
