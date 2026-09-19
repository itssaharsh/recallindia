"use client";

import { Scale } from "lucide-react";
import { useEffect, useState } from "react";

import { StubPage } from "@/components/common/stub-page";

/** A static export has no /case/[id] pages to pre-render, so the id comes from ?id= or, behind
 *  the Amplify rewrite /case/<id> -> /case/, from the path itself. */
function caseIdFromLocation(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get("id");
  if (fromQuery) return fromQuery;
  const match = window.location.pathname.match(/^\/case\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function CaseStub() {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => setId(caseIdFromLocation()), []);
  if (id === undefined) return null;

  return (
    <StubPage
      icon={Scale}
      title="Case"
      what={id ? `The case file for ${id} goes here` : "No case chosen"}
      why={
        id
          ? "This page is the next build: the notice and your item side by side, the claim letter to approve, and the signed evidence certificate with its tamper test. The decision itself is already recorded on the item's card."
          : "A case opens from an item on a notice, on My things."
      }
      action={{ label: "Back to my things", path: "/mine/" }}
    />
  );
}
