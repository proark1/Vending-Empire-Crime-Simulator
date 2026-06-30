import { expect, test } from "@playwright/test";

test("quick start renders the city and completes the first repair", async ({ page }) => {
  const consoleFailures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleFailures.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleFailures.push(error.message);
  });

  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
  await page.getByRole("button", { name: "Quick Start: Cause Problems" }).click();

  const missionTitle = page.locator(".mission-step-title");
  await expect(missionTitle).toHaveText("Repair Rusty Starter");
  const opsButton = page.locator("button.dashboard-toggle");
  await expect(opsButton).toBeVisible();

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const canvasSnapshotLength = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    return canvasElement.toDataURL("image/png").length;
  });
  expect(canvasSnapshotLength).toBeGreaterThan(20_000);

  const closeControls = page.getByRole("button", { name: "Close controls" });
  if (await closeControls.isVisible()) {
    await closeControls.click();
  }

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.keyboard.down("e");
  await expect(page.locator(".target-work-meter")).toBeVisible();
  await page.waitForTimeout(6_000);
  await page.keyboard.up("e");

  await expect(missionTitle).toHaveText("Place at Foam & Fold");

  await opsButton.click();
  await expect(page.getByRole("button", { name: "Advanced" })).toBeVisible();

  expect(consoleFailures).toEqual([]);
});
