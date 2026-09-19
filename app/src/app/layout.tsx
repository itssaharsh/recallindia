import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { AppStateProvider } from "@/components/shell/app-state";
import { Rail } from "@/components/shell/rail";
import { TopBar } from "@/components/shell/top-bar";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

// Bricolage Grotesque for headings: the slightly bureaucratic, stamped feel of a notice.
// IBM Plex Sans: the face of documentation and ledgers. Plex Mono: every identifier.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600"], variable: "--font-bricolage", display: "swap" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Feed · RecallIndia", template: "%s · RecallIndia" },
  description:
    "India's recalls and drug-quality failures (CDSCO, CPSC, NHTSA, openFDA) as one live feed, matched against the things you own.",
};

export const viewport: Viewport = { themeColor: "#0d1117", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${bricolage.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only z-50 bg-surface-3 px-3 py-2 text-text focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <AppStateProvider>
          <TooltipProvider delayDuration={200}>
            <div className="min-h-dvh md:grid md:grid-cols-[13rem_minmax(0,1fr)]">
              <Rail />
              <div className="flex min-w-0 flex-col">
                <TopBar />
                <main id="main" className="flex-1">
                  {children}
                </main>
              </div>
            </div>
          </TooltipProvider>
        </AppStateProvider>
      </body>
    </html>
  );
}
