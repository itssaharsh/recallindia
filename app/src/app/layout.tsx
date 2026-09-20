import type { Metadata, Viewport } from "next";
import { preconnect } from "react-dom";

import { AppStateProvider } from "@/components/shell/app-state";
import { SoundProvider } from "@/components/shell/sound";
import { TooltipProvider } from "@/components/ui/tooltip";
import { API_URL } from "@/lib/api";
import { fontVariables } from "@/lib/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RecallIndia", template: "%s · RecallIndia" },
  description:
    "India's recalls and drug-quality failures (CDSCO, CPSC, NHTSA, openFDA) as one live feed, matched against the things you own.",
  manifest: "/manifest.webmanifest",
  metadataBase: new URL("https://recallindia.d2jn22qjgettr5.amplifyapp.com"),
  openGraph: {
    type: "website",
    siteName: "RecallIndia",
    title: "RecallIndia",
    description: "India publishes recalls as PDFs nobody reads. RecallIndia turns them into a feed, and tells you the day something you own is on it.",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#F4F7FC", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // every page's first data waits on the API (client-side fetch): open that connection with the
  // HTML instead of after hydration (anonymous = the credential-less CORS fetches reuse it)
  if (API_URL) preconnect(API_URL, { crossOrigin: "anonymous" });
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <AppStateProvider>
          <SoundProvider>
            <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          </SoundProvider>
        </AppStateProvider>
      </body>
    </html>
  );
}
