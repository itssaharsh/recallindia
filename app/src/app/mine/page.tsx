import type { Metadata } from "next";

import { MineView } from "@/components/mine/mine-view";

export const metadata: Metadata = { title: "My things" };

export default function MinePage() {
  return <MineView />;
}
