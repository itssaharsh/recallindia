// Phase 0 acceptance for /ingest: the PDF pane must render (canvas or poster) with zero page
// errors, three loads in a row, on the plain route and on a replay.
//
//   node qa/ingest-check.mjs https://main.d2jn22qjgettr5.amplifyapp.com <run_id>
//
// Chromium comes from the Playwright cache (playwright-core is not a repo dependency: pass
// CHROME_PATH, or let it find the cached build).
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const BASE = (process.argv[2] ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const RUN = process.argv[3] ?? "";
const LOADS = 3;

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) throw new Error("no Playwright browser cache; set CHROME_PATH");
  const build = readdirSync(cache)
    .filter((d) => d.startsWith("chromium-"))
    .sort()
    .pop();
  if (!build) throw new Error("no chromium in the Playwright cache; set CHROME_PATH");
  return join(cache, build, "chrome-linux64", "chrome");
}

const { chromium } = require("playwright-core");

// The idle route has no run, so no PDF: it only has to load clean. The replay is where the PDF
// (or its poster) must actually render.
const replay = RUN ? `/ingest/?replay=${encodeURIComponent(RUN)}&speed=4&autoplay=1` : "";
const routes = [
  { name: "idle", path: "/ingest/", needsPage: false },
  { name: "replay", path: replay, needsPage: true },
  { name: "poster", path: replay && `${replay}&pdf=poster`, needsPage: true },
].filter((r) => r.path);

const browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox", "--disable-dev-shm-usage"] });
let failures = 0;

for (const route of routes) {
  for (let i = 1; i <= LOADS; i++) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    const workers = [];
    page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
    page.on("worker", (w) => workers.push(w.url()));
    let shown = "none";
    try {
      await page.goto(BASE + route.path, { waitUntil: "networkidle", timeout: 60_000 });
      // .ingest-layer is on both the checklist and the PDF pane: look at every match
      const rendered = () => {
        const wide = (el) => el.getBoundingClientRect().width > 100;
        if ([...document.querySelectorAll(".ingest-layer canvas")].some(wide)) return "canvas";
        if ([...document.querySelectorAll(".ingest-layer img")].some(wide)) return "poster";
        return "none";
      };
      if (route.needsPage) {
        await page
          .waitForFunction(
            () => [...document.querySelectorAll(".ingest-layer canvas, .ingest-layer img")].some((el) => el.getBoundingClientRect().width > 100),
            null,
            { timeout: 45_000 },
          )
          .catch(() => {});
      }
      shown = await page.evaluate(rendered);
      const caption = await page.locator("figcaption").first().innerText().catch(() => "");
      const bad = await page.getByText(/could not be shown|is not a function|Application error/i).count();
      const ok = (!route.needsPage || shown === "canvas" || shown === "poster") && errors.length === 0 && bad === 0;
      if (!ok) failures++;
      console.log(
        `${ok ? "PASS" : "FAIL"} ${route.name} load ${i}: showing ${shown}, ${errors.length} page errors` +
          `, worker ${workers.find((u) => u.includes("pdf.worker")) ?? "(none)"}` +
          (caption ? `, caption "${caption}"` : "") +
          (errors.length ? `\n      ${errors.join("\n      ")}` : ""),
      );
    } catch (e) {
      failures++;
      console.log(`FAIL ${route.name} load ${i}: ${String(e).split("\n")[0]}`);
    }
    await page.close();
  }
}

await browser.close();
console.log(failures === 0 ? "ingest-check: PASS" : `ingest-check: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
