"use client";
import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "../ui";
import { springSnappy } from "./motion";
import { MethodBadge } from "./TryItConsole";
import type { Endpoint } from "./types";

export interface EndpointDocsProps {
  /** The open endpoint; kept in sync with the console's endpoint field. */
  open: Endpoint;
  onOpenChange: (e: Endpoint) => void;
  className?: string;
}

interface Doc {
  endpoint: Endpoint;
  description: React.ReactNode;
  params: [string, React.ReactNode][];
}

const mono = (s: string) => <span className="font-mono text-[12.5px]">{s}</span>;

const DOCS: Doc[] = [
  {
    endpoint: "/v1/notices",
    description: "Notices, newest first. Filter, search and page through them.",
    params: [
      ["source", "cdsco_nsq, cpsc, nhtsa or openfda"],
      ["since", "YYYY-MM-DD, published on or after"],
      ["q", "Words in product, brand, batch or model"],
      ["limit", "1 to 100 · default 50"],
      ["cursor", <>{mono("next_cursor")} from the page before</>],
    ],
  },
  { endpoint: "/v1/notices/{id}", description: <>One notice with its raw row, e.g. {mono("cpsc%2310984")}</>, params: [["id", <>the notice {mono("pk")}, URL-encoded</>]] },
  { endpoint: "/v1/stats", description: "Totals and poller health for each source", params: [] },
  { endpoint: "/v1/sources", description: "Sources, what they cover and how often they’re polled", params: [] },
];

/** Accordion of the four endpoints, one open at a time (spec 3.4). 392 × 520 card at 1536. */
export function EndpointDocs({ open, onOpenChange, className }: EndpointDocsProps) {
  const reduced = useReducedMotion() ?? false;
  return (
    <section aria-labelledby="api-endpoints" className={cn("rounded-md border border-line bg-surface-1 px-[18px] pt-[18px] pb-2.5 shadow-1 lg:rounded-lg", className)}>
      <h2 id="api-endpoints" className="font-display text-[20px] leading-none font-extrabold tracking-[-.02em] text-ink">
        Endpoints
      </h2>
      <div className="mt-3">
        {DOCS.map((d, i) => {
          const isOpen = d.endpoint === open;
          const prevOpen = i > 0 && DOCS[i - 1].endpoint === open;
          const id = `ep-${i}`;
          return (
            <div key={d.endpoint} className={cn(isOpen ? "-mx-1 mb-1 rounded-[12px] bg-cobalt-soft p-3" : cn("px-1 py-3", i > 0 && !prevOpen && "border-t border-line"))}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={id}
                onClick={() => onOpenChange(d.endpoint)}
                className="block w-full rounded-xs text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cobalt"
              >
                <span className="flex items-center gap-2">
                  <MethodBadge />
                  <code className="font-mono text-[14px] text-ink">{d.endpoint}</code>
                </span>
                <span className={cn("mt-1.5 block text-[13.5px] leading-[1.4]", isOpen ? "text-ink-on-cobalt-soft" : "text-ink-muted")}>{d.description}</span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && d.params.length > 0 && (
                  <motion.div
                    id={id}
                    role="region"
                    aria-label={`${d.endpoint} parameters`}
                    className="overflow-hidden"
                    initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                    exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={{ height: springSnappy, opacity: { duration: 0.16 } }}
                  >
                    <dl className="mt-2.5 grid grid-cols-[62px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-[13px] leading-[1.35]">
                      {d.params.map(([k, v]) => (
                        <React.Fragment key={k}>
                          <dt className="font-mono text-[12.5px] text-cobalt">{k}</dt>
                          <dd className="text-ink">{v}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
