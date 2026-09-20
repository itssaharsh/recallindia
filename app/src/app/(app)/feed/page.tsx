import type { Metadata } from "next";
import { Suspense } from "react";

import { FeedWire } from "./feed-wire";

export const metadata: Metadata = { title: "Feed" };

// useSearchParams (?source= / ?since= / ?q= / ?notice= / ?replay=) needs a Suspense boundary in
// a static export. The (app) layout renders the shell and the page's <main>.
export default function FeedPage() {
  return (
    <Suspense fallback={<div className="py-8 text-[15px] text-ink-muted">Loading the feed…</div>}>
      <FeedWire />
    </Suspense>
  );
}
