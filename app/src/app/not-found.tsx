import type { Metadata } from "next";

import { NotFoundWire } from "./not-found-view";

export const metadata: Metadata = { title: "Not on any list" };

export default function NotFound() {
  return <NotFoundWire />;
}
