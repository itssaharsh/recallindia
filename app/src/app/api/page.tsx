import type { Metadata } from "next";

import { ApiView } from "./api-view";

export const metadata: Metadata = { title: "API" };

export default function ApiPage() {
  return <ApiView />;
}
