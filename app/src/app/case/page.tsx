import type { Metadata } from "next";

import { CaseStub } from "./stub";

export const metadata: Metadata = { title: "Case" };

export default function CasePage() {
  return <CaseStub />;
}
