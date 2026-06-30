import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MachineModelId } from "../../game/core/types";
import { createMachineMesh, createStockCrateMesh } from "./ThreeScene";

function createCanvasContextStub(): Record<string, unknown> {
  const gradient = { addColorStop: vi.fn() };
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    bezierCurveTo: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    roundRect: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 10 }))
  };
}

function installCanvasDocumentStub(): void {
  vi.stubGlobal("document", {
    createElement: (tagName: string) => {
      if (tagName !== "canvas") {
        return {};
      }

      return {
        height: 0,
        width: 0,
        getContext: () => createCanvasContextStub()
      };
    }
  });
}

function collectUserDataValues(object: THREE.Object3D, key: string): string[] {
  const values: string[] = [];
  object.traverse((child) => {
    const value = child.userData[key];
    if (typeof value === "string") {
      values.push(value);
    }
  });
  return values;
}

describe("procedural visual assets", () => {
  beforeEach(() => {
    installCanvasDocumentStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["armored_unit", "armor-rail"],
    ["luxury_vendor", "luxury-glow-halo"],
    ["smart_vendor", "smart-signal-arc"],
    ["mobile_vendor", "mobile-wheel"],
    ["discreet_black_market", "stealth-louver"],
    ["drink_machine", "drink-chill-coil"],
    ["combo_machine", "combo-divider"]
  ] as Array<[MachineModelId, string]>)("adds distinct %s model identity detail", (modelId, expectedDetail) => {
    const mesh = createMachineMesh("#22c55e", 0, ["smart_lock"], "medium", 0.9, ["soda", "chips"], modelId);
    const detailTags = collectUserDataValues(mesh, "machineVisualDetail");

    expect(mesh.userData.machineModelId).toBe(modelId);
    expect(detailTags).toContain("model-badge");
    expect(detailTags).toContain(expectedDetail);
  });

  it("keeps low quality cabinets lightweight while preserving model metadata", () => {
    const mesh = createMachineMesh("#22c55e", 0, [], "low", 1, ["soda"], "armored_unit");

    expect(mesh.userData.machineModelId).toBe("armored_unit");
    expect(collectUserDataValues(mesh, "machineVisualDetail")).toHaveLength(0);
  });

  it("builds stock crates with labels, tape, handles, and corner guards", () => {
    const crate = createStockCrateMesh("energy", 9);
    const detailTags = collectUserDataValues(crate, "stockCrateDetail");

    expect(detailTags).toContain("shipping-label");
    expect(detailTags).toContain("packing-tape");
    expect(detailTags.filter((tag) => tag === "corner-guard")).toHaveLength(4);
    expect(detailTags.filter((tag) => tag === "carry-handle")).toHaveLength(2);
  });
});
