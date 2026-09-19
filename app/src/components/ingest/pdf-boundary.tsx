"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * pdf.js runs third-party code on a worker and throws from inside render. A throw here used to
 * take the whole route down ("Application error: a client-side exception has occurred"), so the
 * PDF pane gets its own boundary: it reports the error and the stage falls back to the poster.
 */
export class PdfErrorBoundary extends Component<{ onError: (error: Error) => void; children: ReactNode }, { dead: boolean }> {
  state = { dead: false };

  static getDerivedStateFromError() {
    return { dead: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== "production") console.warn("pdf.js failed, showing the poster:", error, info.componentStack);
    this.props.onError(error);
  }

  render() {
    return this.state.dead ? null : this.props.children;
  }
}

/** Cancellations are how pdf.js says "you turned the page": they are not failures. */
export function isBenignPdfError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name ?? "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /AbortException|RenderingCancelledException|TransportInitialized|Worker was destroyed/i.test(`${name} ${message}`);
}
