import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

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

const port = await findFreePort();
const output = [];
const child = spawn(process.execPath, ["server.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port)
  },
  stdio: ["ignore", "pipe", "pipe"]
});

child.stdout.on("data", (chunk) => output.push(chunk.toString()));
child.stderr.on("data", (chunk) => output.push(chunk.toString()));

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  await fetchOk(`${baseUrl}/api/health`);
  await fetchOk(`${baseUrl}/`);
  console.log(`Production server smoke passed on port ${port}.`);
} catch (error) {
  console.error(`Production server smoke failed: ${error.message}`);
  if (output.length > 0) {
    console.error(output.join("").slice(-4000));
  }
  process.exitCode = 1;
} finally {
  child.kill();
}
