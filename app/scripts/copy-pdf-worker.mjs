// Copy the pdf.js worker that react-pdf resolves into public/, so it is served from our own
// origin (never a CDN) and always matches the API version react-pdf ships.
//
// Two copies, same bytes: `.mjs` is the real extension, `.js` is the fallback for hosts that do
// not map .mjs to a JavaScript MIME type (a module worker is refused with the wrong type).
// pdf-stage.tsx loads the .mjs one; the check in qa/ingest-check.mjs asserts what is served.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const reactPdf = require.resolve("react-pdf");
const pkg = require.resolve("pdfjs-dist/package.json", { paths: [dirname(reactPdf)] });
const { version } = require(pkg);
const from = join(dirname(pkg), "build", "pdf.worker.min.mjs");
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(publicDir, { recursive: true });
for (const name of ["pdf.worker.min.mjs", "pdf.worker.min.js"]) copyFileSync(from, join(publicDir, name));
console.log(`pdf.js worker ${version} -> public/pdf.worker.min.{mjs,js}`);
