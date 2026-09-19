import { MapPinOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <section aria-label="Not found" className="px-5 py-6">
      <EmptyState
        icon={MapPinOff}
        what="There is no page at this address"
        why="The link is wrong or the page moved. The feed, your things and the API are one click away in the menu."
        action={
          <Link
            href="/"
            className="inline-flex h-8 items-center rounded-sm bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            Go to the feed
          </Link>
        }
      />
    </section>
  );
}
