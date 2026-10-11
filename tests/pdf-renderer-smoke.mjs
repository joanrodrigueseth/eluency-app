// Optional desktop-browser smoke test. This does not replace Android/iOS WebView acceptance.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createPdfViewerHtml } from "../lib/offline/pdfViewer.ts";

const directory = resolve(".expo/pdf-viewer");
mkdirSync(directory, { recursive: true });
const stream = "BT /F1 20 Tf 40 120 Td (Offline lesson PDF) Tj ET";
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
];
let pdf = "%PDF-1.4\n";
const offsets = [0];
objects.forEach((object, index) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
let html = createPdfViewerHtml(Buffer.from(pdf).toString("base64"),
  readFileSync("node_modules/pdfjs-dist/legacy/build/pdf.min.mjs", "utf8"),
  readFileSync("node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", "utf8"),
  JSON.parse(readFileSync(".expo/pdf-viewer/resources.pdfjs", "utf8")));
html = html.replace('<script type="module">', `<script>window.ReactNativeWebView={postMessage:(raw)=>{const event=JSON.parse(raw);document.body.dataset.render=event.type;document.body.dataset.message=event.message||'';}};</script><script type="module">`);
const filename = resolve(directory, "smoke.html");
writeFileSync(filename, html);
const browser = process.env.ELUENCY_CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const result = spawnSync(browser, ["--headless", "--disable-gpu", "--no-first-run", "--disable-background-networking",
  `--user-data-dir=${resolve(directory, "chrome-profile")}`, "--dump-dom", "--virtual-time-budget=15000", pathToFileURL(filename).href],
  { encoding: "utf8", timeout: 45000, maxBuffer: 40 * 1024 * 1024, windowsHide: true });
if (result.error) throw result.error;
const state = result.stdout.match(/<body[^>]*data-render="([^"]+)"[^>]*>/)?.[0];
assert.ok(state?.includes('data-render="ready"'), state ?? result.stderr.slice(-1500));
assert.ok(result.stdout.includes("Offline lesson PDF"));
assert.ok(/<canvas[^>]+width="\d+"/.test(result.stdout));
console.log("Offline PDF rendered successfully with page text and a sized canvas in headless Chrome.");
