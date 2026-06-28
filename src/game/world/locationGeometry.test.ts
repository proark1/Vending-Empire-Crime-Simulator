import { describe, it, expect } from "vitest";
import { regenerateCity } from "./cityRegenerator";
import { crimeContactPositionOverrides, hotspotPositionOverrides } from "./locationGeometry";
import { crimeContacts, defaultWorldMapLayout, neighborhoodHotspots, worldBounds, type WorldBuilding } from "../content/world";

const inBounds = (p: { x: number; z: number }) =>
  p.x >= worldBounds.minX && p.x <= worldBounds.maxX && p.z >= worldBounds.minZ && p.z <= worldBounds.maxZ;

// Each POI maps to a distinct same-district building, so the number repositioned is
// sum over districts of min(POIs in district, buildings in district).
function expectedCount(items: ReadonlyArray<{ districtId: string }>, buildings: WorldBuilding[]): number {
  const byDistrict = (list: ReadonlyArray<{ districtId: string }>) =>
    list.reduce<Record<string, number>>((acc, item) => {
      acc[item.districtId] = (acc[item.districtId] ?? 0) + 1;
      return acc;
    }, {});
  const buildingsPer = byDistrict(buildings);
  const itemsPer = byDistrict(items);
  return Object.entries(itemsPer).reduce((total, [district, count]) => total + Math.min(count, buildingsPer[district] ?? 0), 0);
}

describe("POI (hotspot / crime-contact) position overrides", () => {
  it("returns no overrides for the hand-authored default map (authored positions preserved)", () => {
    expect(hotspotPositionOverrides(defaultWorldMapLayout)).toEqual({});
    expect(crimeContactPositionOverrides(defaultWorldMapLayout)).toEqual({});
  });

  it("repositions hotspots and contacts on a generated map, by valid id", () => {
    const layout = regenerateCity("seed-poi-1");
    const hotspots = hotspotPositionOverrides(layout);
    const contacts = crimeContactPositionOverrides(layout);

    expect(Object.keys(hotspots)).toHaveLength(expectedCount(neighborhoodHotspots, layout.buildings));
    expect(Object.keys(contacts)).toHaveLength(expectedCount(crimeContacts, layout.buildings));
    expect(Object.keys(hotspots).length).toBeGreaterThan(0);

    const hotspotIds = new Set(neighborhoodHotspots.map((h) => h.id));
    const contactIds = new Set(crimeContacts.map((c) => c.id));
    expect(Object.keys(hotspots).every((id) => hotspotIds.has(id))).toBe(true);
    expect(Object.keys(contacts).every((id) => contactIds.has(id))).toBe(true);
  });

  it("places overrides in-world and never stacks two POIs on the same spot", () => {
    const layout = regenerateCity("seed-poi-2");
    for (const overrides of [hotspotPositionOverrides(layout), crimeContactPositionOverrides(layout)]) {
      const points = Object.values(overrides);
      for (const point of points) {
        expect(inBounds(point)).toBe(true);
      }
      const unique = new Set(points.map((p) => `${p.x},${p.z}`));
      expect(unique.size).toBe(points.length);
    }
  });

  it("is deterministic for a given seed", () => {
    expect(hotspotPositionOverrides(regenerateCity("seed-poi-3"))).toEqual(hotspotPositionOverrides(regenerateCity("seed-poi-3")));
    expect(crimeContactPositionOverrides(regenerateCity("seed-poi-3"))).toEqual(crimeContactPositionOverrides(regenerateCity("seed-poi-3")));
  });
});
