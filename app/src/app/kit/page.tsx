import type { Metadata } from "next";

import { KitView } from "./kit-view";

export const metadata: Metadata = { title: "Kit", robots: { index: false, follow: false } };

export default function KitPage() {
  return <KitView />;
}
