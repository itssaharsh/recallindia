import type { Metadata } from "next";

import { CaseView } from "@/components/case/case-view";

export const metadata: Metadata = { title: "Case" };

export default function CasePage() {
  return <CaseView />;
}
