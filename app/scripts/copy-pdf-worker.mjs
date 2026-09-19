// Copy the pdf.js worker that react-pdf resolves into public/ so it is served from our own origin
// (never a CDN) with a .js extension: a module worker needs a JavaScript MIME type, and not
// every static host maps .mjs to one. The worker must be the exact pdfjs-dist react-pdf uses.
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
copyFileSync(from, join(publicDir, "pdf.worker.min.js"));
console.log(`pdf.js worker ${version} -> public/pdf.worker.min.js`);
