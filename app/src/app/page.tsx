import type { Metadata } from "next";

import { LandingPage } from "./landing-page";

export const metadata: Metadata = {
  title: "RecallIndia — the day something you own is on a notice",
  description:
    "India publishes recalls as PDFs nobody reads. RecallIndia turns CDSCO, CPSC, NHTSA and openFDA into one live feed, and tells you the day something you own is on it.",
};

export default function Page() {
  return <LandingPage />;
}
