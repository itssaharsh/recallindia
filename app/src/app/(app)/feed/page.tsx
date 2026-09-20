import type { Metadata } from "next";

import { FeedView } from "@/components/feed/feed-view";

export const metadata: Metadata = { title: "Feed" };

export default function FeedPage() {
  return <FeedView />;
}
