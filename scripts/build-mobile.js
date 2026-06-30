const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "www");
const files = [
  "index.html",
  "style.css",
  "main.js",
  "three.module.js",
  "manifest.webmanifest",
  "sw.js",
  "icon.svg",
  "privacy-policy.html"
];

fs.mkdirSync(outDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(outDir, file));
}

fs.cpSync(path.join(root, "assets"), path.join(outDir, "assets"), { recursive: true });

console.log(`Built mobile web bundle in ${outDir}`);
