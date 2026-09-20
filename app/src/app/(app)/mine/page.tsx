import type { Metadata } from "next";
import { Suspense } from "react";

import { MineSkeleton, MineWire } from "./mine-wire";

export const metadata: Metadata = { title: "My things" };

// The wall reads ?add=, ?item=, ?show= and ?kind= with useSearchParams, which needs a Suspense
// boundary in a static export. The (app) layout renders the shell and this page's <main>.
export default function MinePage() {
  return (
    <Suspense fallback={<MineSkeleton />}>
      <MineWire />
    </Suspense>
  );
}
