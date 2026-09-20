// Screenshot /kit/og into public/og.png (a static export cannot render opengraph-image.tsx at
// request time). Serve app/out first, then:
//
//   node scripts/og.mjs http://127.0.0.1:3100
//
// Chromium comes from the Playwright cache; pass CHROME_PATH to override.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const BASE = (process.argv[2] ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "og.png");

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) throw new Error("no Playwright browser cache; set CHROME_PATH");
  const build = readdirSync(cache)
    .filter((d) => d.startsWith("chromium-"))
    .sort()
    .pop();
  return join(cache, build, "chrome-linux64", "chrome");
}

const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`${BASE}/kit/og/`, { waitUntil: "networkidle", timeout: 60_000 });
// the counts are fetched in the browser: wait for them rather than shipping a placeholder
await page.waitForSelector('[data-og-ready="1"]', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(500);
await page.locator("[data-og-ready]").screenshot({ path: OUT });
console.log(`og.png written from ${BASE}/kit/og/`);
await browser.close();
