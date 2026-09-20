import type { Metadata } from "next";
import { Suspense } from "react";

import { LandingPage } from "./landing-page";

export const metadata: Metadata = {
  // absolute: the root layout's "%s · RecallIndia" template must not run on the landing's own line
  title: { absolute: "RecallIndia — the day something you own is on a notice" },
  description:
    "India publishes recalls as PDFs nobody reads. RecallIndia turns CDSCO, CPSC, NHTSA and openFDA into one live feed, and tells you the day something you own is on it.",
  alternates: { canonical: "/" },
};

/**
 * "/" sits outside the (app) route group (docs/v3/INTEGRATION.md §3): no AppShell renders here, and
 * `LandingView` brings its own <header> nav, <main> and <footer>.
 *
 * This stays a server component so the whole landing — snapshot numbers included — is in the
 * exported HTML. The Suspense boundary is what `output: "export"` asks of anything below it that
 * reads the URL; the landing itself reads ?state= after hydration, so the prerender is the page and
 * never a fallback.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <LandingPage />
    </Suspense>
  );
}
