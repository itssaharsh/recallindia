import type { Metadata } from "next";

import { OgCanvas } from "./og-canvas";

export const metadata: Metadata = { title: "OG", robots: { index: false, follow: false } };

/** A bare 1200x630 page. `node scripts/og.mjs` screenshots it into public/og.png, because a
 *  static export cannot render opengraph-image.tsx at request time. */
export default function OgPage() {
  return <OgCanvas />;
}
