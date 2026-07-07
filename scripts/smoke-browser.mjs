import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const distIndex = path.join(repoRoot, "dist", "index.html");
const gameSaveLimitBytes = 2 * 1024 * 1024;

function fail(message) {
  throw new Error(message);
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }
        reject(new Error("Could not allocate a local port."));
      });
    });
  });
}

async function fetchOk(url, attempts = 50) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw lastError ?? new Error(`${url} did not respond.`);
}

function watchPageErrors(page, label) {
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(`${label} page error: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      const optionalConfigFetch =
        message.text().includes("Failed to load resource") &&
        (location.url.includes("/api/map-layout") || location.url.includes("/api/audio-config"));
      if (optionalConfigFetch) {
        return;
      }
      errors.push(`${label} console error: ${message.text()}`);
    }
  });
  return errors;
}

function assertNoErrors(errors) {
  if (errors.length > 0) {
    fail(errors.join("\n"));
  }
}

async function waitForCanvasPixels(page) {
  const hasPixels = await page.waitForFunction(
    () => {
      const canvas = globalThis.document.querySelector(".scene-mount canvas");
      if (!(canvas instanceof globalThis.HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
        return false;
      }

      const probe = globalThis.document.createElement("canvas");
      probe.width = Math.min(128, canvas.width);
      probe.height = Math.min(128, canvas.height);
      const context = probe.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return false;
      }

      context.drawImage(canvas, 0, 0, probe.width, probe.height);
      const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
      let visiblePixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3];
        const lit = pixels[index] > 8 || pixels[index + 1] > 8 || pixels[index + 2] > 8;
        if (alpha > 0 && lit) {
          visiblePixels += 1;
        }
      }

      return visiblePixels > (pixels.length / 4) * 0.02;
    },
    undefined,
    { timeout: 20_000 }
  ).catch(() => null);

  if (!hasPixels) {
    fail("Scene canvas did not produce nonblank pixels.");
  }
}

async function waitForPerfMetric(page, metricName, minCount = 1) {
  const handle = await page.waitForFunction(
    ({ name, count }) => {
      const hook = globalThis.__vendettaPerf;
      const metric = hook?.getSnapshot?.()[name];
      return Boolean(metric && metric.count >= count);
    },
    { name: metricName, count: minCount },
    { timeout: 25_000 }
  ).catch(() => null);

  if (!handle) {
    fail(`Performance metric "${metricName}" did not appear.`);
  }
}

function assertMetricBudget(snapshot, name, field, maxValue) {
  const metric = snapshot[name];
  if (!metric) {
    return;
  }
  const value = metric[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`Performance metric "${name}.${field}" is not finite.`);
  }
  if (value > maxValue) {
    fail(`Performance budget failed: ${name}.${field} ${value.toFixed(1)} > ${maxValue}.`);
  }
}

async function runDesktopSmoke(browser, baseUrl) {
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { height: 768, width: 1365 }
  });
  const page = await context.newPage();
  const errors = watchPageErrors(page, "desktop");

  await page.goto(`${baseUrl}/?perf`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Vendetta Vending" }).waitFor({ timeout: 15_000 });
  assertNoErrors(errors);

  await page.locator(".access-demo-button").click();
  await page.locator(".scene-mount canvas").waitFor({ timeout: 25_000 });
  await waitForCanvasPixels(page);
  await page.getByLabel("Performance metrics").waitFor({ timeout: 10_000 });
  await waitForPerfMetric(page, "scene.dynamic.rebuild", 1);

  const snapshot = await page.evaluate(() => globalThis.__vendettaPerf?.getSnapshot?.() ?? {});
  assertMetricBudget(snapshot, "scene.frame.avg", "max", 80);
  assertMetricBudget(snapshot, "scene.frame.max", "last", 180);
  assertMetricBudget(snapshot, "scene.dynamic.rebuild", "max", 250);
  assertMetricBudget(snapshot, "save.local.bytes", "last", gameSaveLimitBytes);

  await page.getByLabel("Open operations dashboard").click();
  await page.locator(".dashboard").waitFor({ timeout: 15_000 });
  assertNoErrors(errors);

  const downloadPromise = page.waitForEvent("download", { timeout: 5_000 }).catch(() => null);
  await page.getByLabel("Save a screenshot").click();
  const download = await downloadPromise;
  if (!download) {
    await page.getByText("Photo saved").waitFor({ timeout: 5_000 });
  }
  assertNoErrors(errors);

  await context.close();
}

async function runTouchGateSmoke(browser, baseUrl) {
  const context = await browser.newContext({
    ...devices["Pixel 5"]
  });
  const page = await context.newPage();
  const errors = watchPageErrors(page, "touch");

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("dialog", { name: "Desktop recommended" }).waitFor({ timeout: 10_000 });
  await page.getByRole("heading", { name: "This build needs a keyboard & mouse." }).waitFor({ timeout: 10_000 });
  assertNoErrors(errors);

  await context.close();
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(2_000).then(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    })
  ]);
}

try {
  await stat(distIndex);
} catch {
  fail("dist/index.html is missing. Run `npm run build` before `npm run smoke:browser`.");
}

const port = await findFreePort();
const output = [];
const child = spawn(process.execPath, ["server.js"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port)
  },
  stdio: ["ignore", "pipe", "pipe"]
});

child.stdout.on("data", (chunk) => output.push(chunk.toString()));
child.stderr.on("data", (chunk) => output.push(chunk.toString()));

let browser;
try {
  const baseUrl = `http://127.0.0.1:${port}`;
  await fetchOk(`${baseUrl}/api/health`);

  try {
    browser = await chromium.launch();
  } catch (error) {
    fail(`Could not launch Playwright Chromium. Run \`npx playwright install chromium\` and try again.\n${error.message}`);
  }

  await runDesktopSmoke(browser, baseUrl);
  await runTouchGateSmoke(browser, baseUrl);
  console.log(`Browser runtime smoke passed on port ${port}.`);
} catch (error) {
  console.error(`Browser runtime smoke failed: ${error.message}`);
  const tail = output.join("").slice(-4000);
  if (tail) {
    console.error(tail);
  }
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopServer(child);
}
