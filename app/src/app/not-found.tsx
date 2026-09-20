import type { Metadata } from "next";
import Link from "next/link";

import { GNotice } from "@/components/brand/glyphs";
import { EmptyState } from "@/components/common/empty-state";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <section aria-label="Not found" className="px-5 py-6">
      <EmptyState
        icon={GNotice}
        what="There is no page at this address"
        why="The link is wrong or the page moved. The feed, your things and the API are one click away."
        action={
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-md border border-line-strong bg-surface-1 px-3 text-sm font-medium text-ink hover:bg-surface-2"
          >
            Go to the feed
          </Link>
        }
      />
    </section>
  );
}
