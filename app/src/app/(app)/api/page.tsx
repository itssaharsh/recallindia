import type { Metadata } from "next";

import { ApiWire } from "./api-wire";

export const metadata: Metadata = { title: "API" };

// The (app) layout renders the shell and the page's <main>; this page is content only.
export default function ApiPage() {
  return <ApiWire />;
}
