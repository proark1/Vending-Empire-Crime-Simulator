import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, "..", "dist", "assets");

const budgets = [
  { label: "vendor-three", pattern: /^vendor-three-[\w-]+\.js$/, maxBytes: 540_000 },
  { label: "game-systems", pattern: /^game-systems-[\w-]+\.js$/, maxBytes: 200_000 },
  { label: "index", pattern: /^index-[\w-]+\.js$/, maxBytes: 210_000 },
  { label: "game-content", pattern: /^game-content-[\w-]+\.js$/, maxBytes: 165_000 },
  { label: "vendor-react", pattern: /^vendor-react-[\w-]+\.js$/, maxBytes: 155_000 },
  { label: "ThreeScene", pattern: /^ThreeScene-[\w-]+\.js$/, maxBytes: 140_000 },
  { label: "Dashboard", pattern: /^Dashboard-[\w-]+\.js$/, maxBytes: 95_000 },
  { label: "LandingCinematicScene", pattern: /^LandingCinematicScene-[\w-]+\.js$/, maxBytes: 45_000 },
  { label: "css-total", pattern: /\.css$/, maxBytes: 130_000, total: true },
  { label: "js-total", pattern: /\.js$/, maxBytes: 1_750_000, total: true }
];

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

async function readAssets() {
  const names = await readdir(assetsDir);
  return Promise.all(
    names.map(async (name) => {
      const filePath = path.join(assetsDir, name);
      const stats = await stat(filePath);
      return { name, size: stats.size };
    })
  );
}

const assets = await readAssets();
let failed = false;

for (const budget of budgets) {
  const matches = assets.filter((asset) => budget.pattern.test(asset.name));
  if (matches.length === 0) {
    console.error(`Missing built asset for ${budget.label}.`);
    failed = true;
    continue;
  }

  const actualBytes = budget.total
    ? matches.reduce((sum, asset) => sum + asset.size, 0)
    : Math.max(...matches.map((asset) => asset.size));

  const ok = actualBytes <= budget.maxBytes;
  const line = `${ok ? "OK" : "FAIL"} ${budget.label}: ${formatBytes(actualBytes)} / ${formatBytes(budget.maxBytes)}`;
  if (ok) {
    console.log(line);
  } else {
    console.error(line);
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
}
