import { describe, expect, it } from "vitest";
import { defaultWorldMapLayout, locations, machinePlacementAnchors, patrolZones, policePatrolPaths, trafficLoops, worldBuildings, worldDecorations, worldInteriors, worldRoads } from "./world";
import { createInitialState } from "./initialState";
import { pathOnRoads, pointOnRoad } from "../world/roadGraph";
import { rectsIntersect, validateWorldMapLayout } from "../world/mapLayoutStorage";
import { WORLD_SCALE } from "../world/scale";
import { roadFootprintBounds, sidewalkFootprintBounds, sidewalkFootprintsForRoads } from "../world/sidewalks";

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

  it("keeps every traffic loop on authored street rectangles", () => {
    for (const loop of trafficLoops) {
      for (const point of loop.path) {
        expect(pointOnRoad(point, worldRoads), `${loop.id} has a path point off-road at ${point.x},${point.z}`).toBe(true);
      }

      expect(pathOnRoads(loop.path, worldRoads), `${loop.id} drives outside road geometry`).toBe(true);
    }
  });

  it("keeps authored roads clear of building footprints", () => {
    const blockingIssues = validateWorldMapLayout(defaultWorldMapLayout).filter((issue) => issue.severity === "error");

    expect(blockingIssues).toEqual([]);
  });

  it("keeps world proportions anchored to human scale", () => {
    expect(WORLD_SCALE.building.door.height / WORLD_SCALE.human.height).toBeGreaterThanOrEqual(1.18);
    expect(WORLD_SCALE.building.door.width).toBeGreaterThanOrEqual(WORLD_SCALE.human.radius * 2);
    expect(WORLD_SCALE.vehicle.length / WORLD_SCALE.human.height).toBeGreaterThanOrEqual(2.4);
    expect(WORLD_SCALE.vehicle.width / WORLD_SCALE.human.height).toBeGreaterThanOrEqual(1);

    for (const building of worldBuildings) {
      expect(building.height, `${building.signText} is too short for human-scale storefronts`).toBeGreaterThanOrEqual(WORLD_SCALE.building.minimumStorefrontHeight);
    }

    for (const road of worldRoads) {
      const crossSection = Math.min(road.width, road.depth);
      expect(crossSection, `${road.id} is too narrow for human-scale streets`).toBeGreaterThanOrEqual(WORLD_SCALE.road.minimumStreetWidth);
      expect(crossSection, `${road.id} cannot fit a car with clearance`).toBeGreaterThanOrEqual(WORLD_SCALE.vehicle.width + WORLD_SCALE.vehicle.clearance * 2);
    }
  });

  it("clips generated sidewalks away from roads and buildings", () => {
    const sidewalks = sidewalkFootprintsForRoads(worldRoads, worldBuildings);
    expect(sidewalks.length).toBeGreaterThan(worldRoads.length);

    const buildingBoxes = worldBuildings.map(boxFromBuilding);
    for (const sidewalk of sidewalks) {
      const sidewalkBounds = sidewalkFootprintBounds(sidewalk);
      for (const road of worldRoads) {
        expect(rectsIntersect(sidewalkBounds, roadFootprintBounds(road)), `${sidewalk.sourceRoadId} sidewalk crosses ${road.id}`).toBe(false);
      }
      expect(buildingBoxes.some((box) => rectsIntersect(sidewalkBounds, box)), `${sidewalk.sourceRoadId} sidewalk overlaps a building`).toBe(false);
    }
  });

  it("keeps police patrol cars and foot patrols inside police spaces", () => {
    for (const loop of trafficLoops.filter((trafficLoop) => trafficLoop.kind === "police")) {
      expect(pathOnRoads(loop.path, worldRoads), `${loop.id} police car leaves the road network`).toBe(true);
    }

    for (const patrol of policePatrolPaths) {
      const zone = patrolZones.find((candidate) => candidate.id === patrol.zoneId);
      expect(zone, `${patrol.id} references an unknown patrol zone`).toBeDefined();

      if (!zone) {
        continue;
      }

      for (const point of patrol.path) {
        const distance = Math.hypot(point.x - zone.x, point.z - zone.z);
        expect(distance, `${patrol.id} foot patrol leaves ${zone.id}`).toBeLessThanOrEqual(zone.radius + 0.1);
      }
    }
  });

  it("ties walkable interiors to real locations and cutaway buildings", () => {
    for (const interior of worldInteriors) {
      expect(locations[interior.locationId], `${interior.id} references an unknown location`).toBeDefined();
      expect(
        worldBuildings.some((building) => building.locationId === interior.locationId),
        `${interior.id} has no matching cutaway building`
      ).toBe(true);
    }
  });

  it("defines editable decoration props with stable ids", () => {
    const ids = new Set<string>();
    for (const decoration of worldDecorations) {
      expect(decoration.id).toBeTruthy();
      expect(ids.has(decoration.id), `${decoration.id} is duplicated`).toBe(false);
      ids.add(decoration.id);
      expect(Number.isFinite(decoration.x), `${decoration.id} has invalid x`).toBe(true);
      expect(Number.isFinite(decoration.z), `${decoration.id} has invalid z`).toBe(true);
    }
  });
});
