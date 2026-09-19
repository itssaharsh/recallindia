import type { Metadata } from "next";

import { ApiStub } from "./stub";

export const metadata: Metadata = { title: "API" };

export default function ApiPage() {
  return <ApiStub />;
}
