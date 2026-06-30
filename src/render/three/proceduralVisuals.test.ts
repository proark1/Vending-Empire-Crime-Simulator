import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MachineModelId } from "../../game/core/types";
import { createBuilding, createBush, createNpcCharacter, createParkBench, createParkLamp, createStreetProps, createTree } from "./proceduralArt";
import { createMachineMesh, createStockCrateMesh, createVehicleMesh } from "./ThreeScene";

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

  it("adds real-world cabinet hardware to medium and high quality vending machines", () => {
    const mesh = createMachineMesh("#22c55e", 0, ["cashless_terminal"], "medium", 1, ["soda", "chips"], "basic_snack");
    const detailTags = collectUserDataValues(mesh, "machineVisualDetail");

    expect(detailTags).toContain("machine-glass-gasket");
    expect(detailTags).toContain("machine-payment-bezel");
    expect(detailTags).toContain("machine-compressor-grille");
    expect(detailTags).toContain("machine-screw-head");
    expect(detailTags).toContain("machine-leveling-foot");
  });

  it("adds automotive details that make route vehicles read as real cars", () => {
    const vehicle = createVehicleMesh("medium");
    const detailTags = collectUserDataValues(vehicle, "vehicleVisualDetail");

    expect(detailTags).toContain("vehicle-hood-crease");
    expect(detailTags).toContain("vehicle-windshield-wiper");
    expect(detailTags).toContain("vehicle-side-mirror-glass");
    expect(detailTags).toContain("vehicle-wheel-arch");
    expect(detailTags).toContain("vehicle-headlight-lens");
    expect(detailTags).toContain("vehicle-license-plate");
  });

  it("builds stock crates with labels, tape, handles, guards, and barcode details", () => {
    const crate = createStockCrateMesh("energy", 9);
    const detailTags = collectUserDataValues(crate, "stockCrateDetail");

    expect(detailTags).toContain("shipping-label");
    expect(detailTags).toContain("packing-tape");
    expect(detailTags).toContain("barcode-sticker");
    expect(detailTags).toContain("barcode-line");
    expect(detailTags).toContain("quantity-count-bar");
    expect(detailTags.filter((tag) => tag === "reinforced-strap")).toHaveLength(2);
    expect(detailTags.filter((tag) => tag === "corner-guard")).toHaveLength(4);
    expect(detailTags.filter((tag) => tag === "carry-handle")).toHaveLength(2);
  });

  it("adds polished real-world cues to shared procedural city models", () => {
    const modelTags = [
      ...collectUserDataValues(createTree("medium", 4), "modelPolishDetail"),
      ...collectUserDataValues(createBush("medium", 4), "modelPolishDetail"),
      ...collectUserDataValues(createParkBench(), "modelPolishDetail"),
      ...collectUserDataValues(createParkLamp(false), "modelPolishDetail"),
      ...collectUserDataValues(createNpcCharacter("worker", "medium"), "modelPolishDetail"),
      ...collectUserDataValues(createNpcCharacter("scout", "medium"), "modelPolishDetail"),
      ...collectUserDataValues(createNpcCharacter("customer", "medium"), "modelPolishDetail"),
      ...collectUserDataValues(createBuilding(4, 3, 4, "laundromat", "SOAP", "medium"), "modelPolishDetail"),
      ...collectUserDataValues(createStreetProps({ enableLocalLights: false, maxNpcs: 0, quality: "medium" }), "modelPolishDetail")
    ];

    expect(modelTags).toContain("tree-root-flare");
    expect(modelTags).toContain("tree-bark-ridge");
    expect(modelTags).toContain("tree-visible-branch");
    expect(modelTags).toContain("bush-highlight-leaf");
    expect(modelTags).toContain("bench-seat-slat");
    expect(modelTags).toContain("bench-metal-armrest");
    expect(modelTags).toContain("lamp-cage-bar");
    expect(modelTags).toContain("npc-jacket-zipper");
    expect(modelTags).toContain("npc-shoe-sole");
    expect(modelTags).toContain("npc-worker-crate-label");
    expect(modelTags).toContain("npc-tablet-antenna");
    expect(modelTags).toContain("npc-shopping-bag-label");
    expect(modelTags).toContain("building-door-gasket");
    expect(modelTags).toContain("building-window-gasket");
    expect(modelTags).toContain("building-sign-trim");
    expect(modelTags).toContain("building-awning-scallop");
    expect(modelTags).toContain("building-security-camera");
    expect(modelTags).toContain("street-box-label");
    expect(modelTags).toContain("street-cone-reflective-band");
    expect(modelTags).toContain("street-bus-route-map");
    expect(modelTags).toContain("street-utility-hinge");
    expect(modelTags).toContain("street-planter-rim");
    expect(modelTags).toContain("street-bollard-reflective-band");
    expect(modelTags).toContain("street-lamp-glass-ring");
  });
});
