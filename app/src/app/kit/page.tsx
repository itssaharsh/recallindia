import type { Metadata } from "next";

import { KitWire } from "./kit-wire";

export const metadata: Metadata = { title: "Kit", robots: { index: false, follow: false } };

export default function KitPage() {
  return <KitWire />;
}
