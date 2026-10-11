const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
// Treat PDF.js as WebView assets, not React Native modules. Generated locally
// from the locked dependency for every Metro start/export; no runtime CDN.
const pdfAssetDir = path.join(__dirname, ".expo/pdf-viewer");
mkdirSync(pdfAssetDir, { recursive: true });
for (const [source, target] of [["pdf.min.mjs", "library.pdfjs"], ["pdf.worker.min.mjs", "worker.pdfjs"]]) {
  copyFileSync(require.resolve(`pdfjs-dist/legacy/build/${source}`), path.join(pdfAssetDir, target));
}
const pdfPackageDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
const resources = {};
for (const folder of ["cmaps", "standard_fonts", "wasm"]) {
  for (const file of readdirSync(path.join(pdfPackageDir, folder))) {
    if (/\.(bcmap|ttf|pfb|wasm|js)$/.test(file) || file.startsWith("LICENSE")) {
      resources[file] = readFileSync(path.join(pdfPackageDir, folder, file)).toString("base64");
    }
  }
}
resources.LICENSE_PDFJS = readFileSync(path.join(pdfPackageDir, "LICENSE")).toString("base64");
writeFileSync(path.join(pdfAssetDir, "resources.pdfjs"), JSON.stringify(resources));
config.resolver.assetExts.push("pdfjs");

module.exports = withNativeWind(config, { input: "./global.css" });

