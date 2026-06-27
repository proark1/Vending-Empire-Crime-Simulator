import { describe, expect, it } from "vitest";
import { generateCityPlan } from "./cityLayout";
import { connectedRoadComponents, roadBounds } from "./roadGraph";
import { buildingFootprint } from "./mapLayoutStorage";
import { districts, worldBounds } from "../content/world";
import { WORLD_SCALE } from "./scale";
import { inflate, rectsOverlap, rectContains } from "./rectGrid";

const SEEDS = Array.from({ length: 12 }, (_, index) => `seed_${index}`);
const MIN_GAP = WORLD_SCALE.layout.minBuildingGap;

describe("city layout engine", () => {
  it.each(SEEDS)("produces a single connected road network (%s)", (seed) => {
    const plan = generateCityPlan(seed);
    expect(connectedRoadComponents(plan.roads)).toHaveLength(1);
    expect(plan.roads.length).toBeGreaterThan(6);
  });

  it.each(SEEDS)("is deterministic for a given seed (%s)", (seed) => {
    expect(generateCityPlan(seed)).toEqual(generateCityPlan(seed));
  });

  it("produces different cities for different seeds", () => {
    const a = generateCityPlan("alpha");
    const b = generateCityPlan("bravo");
    expect(a.roads).not.toEqual(b.roads);
    expect(a.buildings).not.toEqual(b.buildings);
  });

  it.each(SEEDS)("places a dense set of buildings (%s)", (seed) => {
    const plan = generateCityPlan(seed);
    expect(plan.buildings.length).toBeGreaterThan(40);
  });

  it.each(SEEDS)("keeps every building off the road network (%s)", (seed) => {
    const plan = generateCityPlan(seed);
    for (const building of plan.buildings) {
      const footprint = buildingFootprint(building);
      for (const road of plan.roads) {
        expect(
          rectsOverlap(footprint, roadBounds(road)),
          `${building.id} overlaps ${road.id}`
        ).toBe(false);
      }
    }
  });

  it.each(SEEDS)("keeps a navigable gap between adjacent buildings (%s)", (seed) => {
    const plan = generateCityPlan(seed);
    const footprints = plan.buildings.map((building) => inflate(buildingFootprint(building), MIN_GAP / 2));
    for (let i = 0; i < footprints.length; i += 1) {
      for (let j = i + 1; j < footprints.length; j += 1) {
        expect(
          rectsOverlap(footprints[i], footprints[j]),
          `${plan.buildings[i].id} and ${plan.buildings[j].id} are closer than ${MIN_GAP}`
        ).toBe(false);
      }
    }
  });

  it.each(SEEDS)("keeps every building inside the world (%s)", (seed) => {
    const plan = generateCityPlan(seed);
    for (const building of plan.buildings) {
      expect(rectContains(worldBounds, buildingFootprint(building)), `${building.id} escapes world bounds`).toBe(true);
    }
  });

  it.each(SEEDS)("tags every building to a real district (%s)", (seed) => {
    const plan = generateCityPlan(seed);
    for (const building of plan.buildings) {
      expect(districts[building.districtId], `${building.id} has unknown district ${building.districtId}`).toBeDefined();
    }
  });
});
