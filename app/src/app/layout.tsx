import type { Metadata, Viewport } from "next";
import { preconnect } from "react-dom";

import { AppStateProvider } from "@/components/shell/app-state";
import { CommandPalette } from "@/components/shell/command-palette";
import { Rail } from "@/components/shell/rail";
import { SoundProvider } from "@/components/shell/sound";
import { TopBar } from "@/components/shell/top-bar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { API_URL } from "@/lib/api";
import { fontVariables } from "@/lib/fonts";

import "./globals.css";

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
    <html lang="en" className={fontVariables}>
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
                <main id="main" className="flex-1 pb-20 md:pb-0">
                  {children}
                </main>
              </div>
            </div>
              <CommandPalette />
            </TooltipProvider>
          </SoundProvider>
        </AppStateProvider>
      </body>
    </html>
  );
}
