"use client";

import { LandingView, landingSnapshot, landingStory } from "@/components/v3/landing";

/** Phase 1 placeholder: the landing renders from its snapshot. Phase 2 wires /v1/stats. */
export function LandingPage() {
  return <LandingView data={landingSnapshot} story={landingStory} />;
}
