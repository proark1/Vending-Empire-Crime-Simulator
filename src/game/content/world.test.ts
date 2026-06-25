import { describe, expect, it } from "vitest";
import { machinePlacementAnchors, worldBuildings } from "./world";
import { createInitialState } from "./initialState";

function boxFromBuilding(building: { depth: number; width: number; x: number; z: number }) {
  return {
    maxX: building.x + building.width / 2,
    maxZ: building.z + building.depth / 2,
    minX: building.x - building.width / 2,
    minZ: building.z - building.depth / 2
  };
}

function contains(box: ReturnType<typeof boxFromBuilding>, point: { x: number; z: number }): boolean {
  return point.x >= box.minX && point.x <= box.maxX && point.z >= box.minZ && point.z <= box.maxZ;
}

describe("world content", () => {
  it("starts with multiple districts and enough open placement sites", () => {
    const state = createInitialState();
    const installableLocations = Object.values(state.locations).filter((location) => location.kind !== "garage" && location.kind !== "supplier");
    const openLocations = installableLocations.filter((location) => !Object.values(state.machines).some((machine) => machine.locationId === location.id));

    expect(Object.keys(state.districts).length).toBeGreaterThanOrEqual(4);
    expect(state.districtProgress.starter_suburb.access).toBe("unlocked");
    expect(state.districtProgress.industrial_yards.access).toBe("locked");
    expect(installableLocations.length).toBeGreaterThanOrEqual(12);
    expect(openLocations.length).toBeGreaterThanOrEqual(10);
  });

  it("defines placement anchors for every installable location", () => {
    const state = createInitialState();
    const installableLocationIds = Object.values(state.locations)
      .filter((location) => location.kind !== "garage" && location.kind !== "supplier")
      .map((location) => location.id);

    expect(installableLocationIds).toEqual(expect.arrayContaining(Object.keys(machinePlacementAnchors)));
    for (const locationId of installableLocationIds) {
      expect(machinePlacementAnchors[locationId]).toBeDefined();
    }
  });

  it("keeps machine centers and front service points out of buildings", () => {
    const buildingBoxes = worldBuildings.map(boxFromBuilding);

    for (const [locationId, anchor] of Object.entries(machinePlacementAnchors)) {
      const center = { x: anchor.x, z: anchor.z };
      const front = {
        x: anchor.x - Math.sin(anchor.rotationY) * 0.9,
        z: anchor.z - Math.cos(anchor.rotationY) * 0.9
      };

      expect(buildingBoxes.some((box) => contains(box, center)), `${locationId} machine center overlaps a building`).toBe(false);
      expect(buildingBoxes.some((box) => contains(box, front)), `${locationId} machine front faces into a building`).toBe(false);
    }
  });
});
