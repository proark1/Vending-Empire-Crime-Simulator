import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 120_000,
  expect: {
    timeout: 20_000
  },
  use: {
    baseURL: "http://127.0.0.1:5175",
    viewport: {
      width: 1280,
      height: 720
    }
  },
  webServer: {
    command: "npm run dev -- --port 5175",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:5175/"
  }
});
