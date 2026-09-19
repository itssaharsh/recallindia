import type { NextConfig } from "next";

// Static export: the app is plain files on Amplify Hosting and talks to the HTTP API from the
// browser (NEXT_PUBLIC_API_URL is inlined at build time). No SSR, no API routes.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true, // /mine -> out/mine/index.html, served as-is by static hosting
  images: { unoptimized: true },
  poweredByHeader: false,
  // WSL box with ~2 GB free: one build worker keeps `next build` from spawning a process per CPU.
  experimental: { cpus: 1 },
};

export default nextConfig;
