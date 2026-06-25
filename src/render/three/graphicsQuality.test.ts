import { describe, expect, it, vi } from "vitest";
import { defaultWorldMapLayout } from "../../game/content/world";
import { isGraphicsQuality, loadGraphicsQuality, resolveGraphicsProfile, saveGraphicsQuality } from "./graphicsQuality";

describe("graphics quality profiles", () => {
  it("scales render budgets from low to high", () => {
    const low = resolveGraphicsProfile("low", defaultWorldMapLayout);
    const medium = resolveGraphicsProfile("medium", defaultWorldMapLayout);
    const high = resolveGraphicsProfile("high", defaultWorldMapLayout);

    expect(low.enableShadows).toBe(false);
    expect(high.enableShadows).toBe(true);
    expect(low.maxTrafficLoops).toBeLessThan(medium.maxTrafficLoops);
    expect(medium.maxTrafficLoops).toBeLessThanOrEqual(high.maxTrafficLoops);
    expect(low.maxAmbientNpcs).toBeLessThan(medium.maxAmbientNpcs);
    expect(medium.maxAmbientNpcs).toBeLessThan(high.maxAmbientNpcs);
    expect(low.chunkRadius).toBeLessThan(medium.chunkRadius);
    expect(medium.chunkRadius).toBeLessThan(high.chunkRadius);
    expect(high.maxBackdropBuildings).toBe(defaultWorldMapLayout.backdropBuildings.length);
  });

  it("validates supported mode ids", () => {
    expect(isGraphicsQuality("low")).toBe(true);
    expect(isGraphicsQuality("medium")).toBe(true);
    expect(isGraphicsQuality("high")).toBe(true);
    expect(isGraphicsQuality("ultra")).toBe(false);
  });

  it("falls back to medium when storage has an invalid value", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => "ultra",
        setItem: vi.fn()
      }
    });

    expect(loadGraphicsQuality()).toBe("medium");
    saveGraphicsQuality("high");
    expect(window.localStorage.setItem).toHaveBeenCalledWith("vending-empire.graphics-quality", "high");

    vi.unstubAllGlobals();
  });
});
