import { describe, expect, it } from "vitest";
import { regenerateCity } from "./cityRegenerator";
import { validateWorldMapLayout, buildingFootprint } from "./mapLayoutStorage";
import { anchorsForLayout } from "./locationGeometry";
import { connectedRoadComponents, roadBounds } from "./roadGraph";
import {
  districts,
  facingToRotationY,
  locations,
  worldBounds,
  worldBuildings,
  worldInteriors
} from "../content/world";
import { pointInRect, rectContains, rectsOverlap } from "./rectGrid";

const SEEDS = Array.from({ length: 20 }, (_, index) => `regen_${index}`);

const namedLocationIds = worldBuildings
  .filter((building) => building.locationId)
  .map((building) => building.locationId as string);

const installableLocationIds = Object.values(locations)
  .filter((location) => location.kind !== "garage" && location.kind !== "supplier")
  .map((location) => location.id);

function anchorInsideAnyBuilding(anchor: { x: number; z: number; rotationY: number }, buildingBounds: ReturnType<typeof buildingFootprint>[]): boolean {
  const center = { x: anchor.x, z: anchor.z };
  const front = { x: anchor.x - Math.sin(anchor.rotationY) * 0.9, z: anchor.z - Math.cos(anchor.rotationY) * 0.9 };
  return buildingBounds.some((bounds) => pointInRect(center, bounds) || pointInRect(front, bounds));
}

describe("city regenerator", () => {
  it.each(SEEDS)("produces a layout with zero validation errors (%s)", (seed) => {
    const issues = validateWorldMapLayout(regenerateCity(seed)).filter((issue) => issue.severity === "error");
    expect(issues).toEqual([]);
  });

  it.each(SEEDS)("is deterministic for a given seed (%s)", (seed) => {
    expect(regenerateCity(seed)).toEqual(regenerateCity(seed));
  });

  it("produces different cities for different seeds", () => {
    expect(regenerateCity("one").roads).not.toEqual(regenerateCity("two").roads);
  });

  it.each(SEEDS)("keeps every named location present (%s)", (seed) => {
    const layout = regenerateCity(seed);
    const present = new Set(layout.buildings.map((building) => building.locationId).filter(Boolean));
    for (const locationId of namedLocationIds) {
      expect(present.has(locationId), `missing ${locationId}`).toBe(true);
    }
  });

  it.each(SEEDS)("gives every installable location a valid machine anchor (%s)", (seed) => {
    const layout = regenerateCity(seed);
    const anchors = anchorsForLayout(layout);
    const buildingBounds = layout.buildings.map(buildingFootprint);
    for (const locationId of installableLocationIds) {
      const anchor = anchors[locationId];
      expect(anchor, `no anchor for ${locationId}`).toBeDefined();
      expect(anchorInsideAnyBuilding(anchor, buildingBounds), `${locationId} anchor blocked`).toBe(false);
    }
  });

  it.each(SEEDS)("rebuilds walkable interiors to match their building (%s)", (seed) => {
    const layout = regenerateCity(seed);
    const buildingByLocation = new Map(layout.buildings.filter((b) => b.locationId).map((b) => [b.locationId, b]));
    for (const template of worldInteriors) {
      const interior = layout.interiors.find((entry) => entry.locationId === template.locationId);
      const building = buildingByLocation.get(template.locationId);
      expect(interior, `missing interior for ${template.locationId}`).toBeDefined();
      expect(building, `missing building for ${template.locationId}`).toBeDefined();
      if (interior && building) {
        expect(interior.x).toBe(building.x);
        expect(interior.z).toBe(building.z);
        expect(interior.width).toBe(building.width);
        expect(interior.depth).toBe(building.depth);
        expect(interior.openSide).toBe(building.facing ?? "north");
      }
    }
  });

  it.each(SEEDS)("keeps a single connected road network (%s)", (seed) => {
    expect(connectedRoadComponents(regenerateCity(seed).roads)).toHaveLength(1);
  });

  it.each(SEEDS)("keeps every building off the roads and inside the world (%s)", (seed) => {
    const layout = regenerateCity(seed);
    for (const building of layout.buildings) {
      const footprint = buildingFootprint(building);
      expect(rectContains(worldBounds, footprint), `${building.id} escapes world`).toBe(true);
      for (const road of layout.roads) {
        expect(rectsOverlap(footprint, roadBounds(road)), `${building.id} on ${road.id}`).toBe(false);
      }
    }
  });

  it.each(SEEDS)("orients each location storefront toward its street (%s)", (seed) => {
    const layout = regenerateCity(seed);
    const anchors = anchorsForLayout(layout);
    for (const building of layout.buildings) {
      if (!building.locationId || !anchors[building.locationId]) {
        continue;
      }
      // The anchor faces the same way the storefront does.
      expect(anchors[building.locationId].rotationY).toBeCloseTo(facingToRotationY(building.facing ?? "north"), 5);
    }
  });

  it.each(SEEDS)("tags every building to a real district it lies within (%s)", (seed) => {
    const layout = regenerateCity(seed);
    for (const building of layout.buildings) {
      const district = districts[building.districtId];
      expect(district, `${building.id} unknown district`).toBeDefined();
      expect(pointInRect({ x: building.x, z: building.z }, district.bounds), `${building.id} off-district`).toBe(true);
    }
  });
});
