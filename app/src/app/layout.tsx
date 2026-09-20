import type { Metadata, Viewport } from "next";
import { Doto, IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import { preconnect } from "react-dom";

import { AppStateProvider } from "@/components/shell/app-state";
import { Rail } from "@/components/shell/rail";
import { SoundProvider } from "@/components/shell/sound";
import { TopBar } from "@/components/shell/top-bar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { API_URL } from "@/lib/api";

import "./globals.css";

// Schibsted Grotesk (a newspaper publisher's grotesk) is the voice: display 800, headings 700,
// body 400. IBM Plex Mono is the supporting role: hashes, ids, log lines, curl. Doto (dot-matrix,
// 900) appears only inside a foil chip -- a batch code, never a word (DESIGN.md).
const display = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--ff-display",
  display: "swap",
});
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--ff-mono", display: "swap" });
const foil = Doto({ subsets: ["latin"], weight: ["900"], variable: "--ff-foil", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Feed · RecallIndia", template: "%s · RecallIndia" },
  description:
    "India's recalls and drug-quality failures (CDSCO, CPSC, NHTSA, openFDA) as one live feed, matched against the things you own.",
  manifest: "/manifest.webmanifest",
  metadataBase: new URL("https://main.d2jn22qjgettr5.amplifyapp.com"),
  openGraph: {
    type: "website",
    siteName: "RecallIndia",
    title: "RecallIndia",
    description: "India publishes recalls as PDFs nobody reads. RecallIndia turns them into a feed, and tells you the day something you own is on it.",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#ECEEEA", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // every page's first data waits on the API (client-side fetch): open that connection with the
  // HTML instead of after hydration (anonymous = the credential-less CORS fetches reuse it)
  if (API_URL) preconnect(API_URL, { crossOrigin: "anonymous" });
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${foil.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only z-50 bg-surface-1 px-3 py-2 text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <AppStateProvider>
          <SoundProvider>
            <TooltipProvider delayDuration={200}>
            <div className="min-h-dvh md:grid md:grid-cols-[13rem_minmax(0,1fr)]">
              {/* the column carries the rail's surface so it runs the page's full height */}
              <div className="border-b border-line bg-canvas md:border-r md:border-b-0">
                <Rail />
              </div>
              <div className="flex min-w-0 flex-col">
                <TopBar />
                <main id="main" className="flex-1">
                  {children}
                </main>
              </div>
            </div>
            </TooltipProvider>
          </SoundProvider>
        </AppStateProvider>
      </body>
    </html>
  );
}
