// Derives machine anchors and location positions from a world layout.
//
// Anchors and locations[].position are authored as code constants that line up
// with the hand-authored buildings. When the procedural generator moves a
// location's building it stamps a derived `anchor` onto that building; these
// helpers let the validator, renderer and game state pick up the moved geometry
// while leaving the hand-authored default untouched (buildings without `anchor`
// fall back to the constants).

import type { Bounds2, Vec2 } from "../core/types";
import {
  buildingFootprintExtents,
  crimeContacts,
  facingOutwardUnit,
  facingToRotationY,
  locations,
  machinePlacementAnchors,
  neighborhoodHotspots,
  type BuildingFacing,
  type MachinePlacementAnchor,
  type WorldBuilding,
  type WorldMapLayout
} from "../content/world";
import { pointInRect, snap } from "./rectGrid";

function footprint(building: WorldBuilding): Bounds2 {
  const extents = buildingFootprintExtents(building);
  return {
    minX: building.x - extents.x / 2,
    maxX: building.x + extents.x / 2,
    minZ: building.z - extents.z / 2,
    maxZ: building.z + extents.z / 2
  };
}

// Half-extent of the building measured toward its street (the depth the door
// sits behind), accounting for the east/west width/depth swap.
function frontHalfDepth(building: WorldBuilding): number {
  const extents = buildingFootprintExtents(building);
  return building.facing === "east" || building.facing === "west" ? extents.x / 2 : extents.z / 2;
}

// Storefront front-centre — the point on the door wall, just outside the model.
export function frontCenter(building: WorldBuilding): Vec2 {
  const out = facingOutwardUnit(building.facing);
  const half = frontHalfDepth(building);
  return { x: snap(building.x + out.x * half), z: snap(building.z + out.z * half) };
}

const FACINGS: BuildingFacing[] = ["north", "south", "east", "west"];

function halfDepthForFacing(building: WorldBuilding, facing: BuildingFacing): number {
  const extents = buildingFootprintExtents(building);
  return facing === "east" || facing === "west" ? extents.x / 2 : extents.z / 2;
}

// A machine anchor sitting on the sidewalk in front of the storefront, facing
// the street. Prefers the building's own facing, but will try the other three
// sides (and push further out) until both the centre and the 0.9u service point
// clear every building — the validator enforces both (mapLayoutStorage.ts:402).
export function deriveBuildingAnchor(building: WorldBuilding, blockers: Bounds2[]): MachinePlacementAnchor {
  const order: BuildingFacing[] = [building.facing ?? "north", ...FACINGS.filter((f) => f !== (building.facing ?? "north"))];
  for (let gap = 1.1; gap <= 6.0; gap += 0.4) {
    for (const facing of order) {
      const out = facingOutwardUnit(facing);
      const half = halfDepthForFacing(building, facing);
      const cx = building.x + out.x * (half + gap);
      const cz = building.z + out.z * (half + gap);
      const front = { x: cx + out.x * 0.9, z: cz + out.z * 0.9 };
      const blocked = blockers.some((bounds) => pointInRect({ x: cx, z: cz }, bounds) || pointInRect(front, bounds));
      if (!blocked) {
        return { x: snap(cx), z: snap(cz), rotationY: facingToRotationY(facing) };
      }
    }
  }
  // Last resort: in front at the largest gap (rare; validation will surface it).
  const out = facingOutwardUnit(building.facing);
  const half = frontHalfDepth(building);
  return { x: snap(building.x + out.x * (half + 6.0)), z: snap(building.z + out.z * (half + 6.0)), rotationY: facingToRotationY(building.facing) };
}

export function buildingFootprintsForLayout(layout: WorldMapLayout): Bounds2[] {
  return layout.buildings.map(footprint);
}

// Effective machine anchors: code defaults overridden by any generated building
// that carries its own derived anchor.
export function anchorsForLayout(layout: WorldMapLayout): Record<string, MachinePlacementAnchor> {
  const result: Record<string, MachinePlacementAnchor> = { ...machinePlacementAnchors };
  for (const building of layout.buildings) {
    if (building.locationId && building.anchor) {
      result[building.locationId] = building.anchor;
    }
  }
  return result;
}

// Location foot-traffic centres overridden by generated location buildings only
// (presence of a derived `anchor` marks a building as generated). Hand-authored
// layouts produce no overrides, so the default game is unaffected.
export function locationPositionOverrides(layout: WorldMapLayout): Record<string, Vec2> {
  const overrides: Record<string, Vec2> = {};
  for (const building of layout.buildings) {
    if (building.locationId && building.anchor && locations[building.locationId]) {
      overrides[building.locationId] = frontCenter(building);
    }
  }
  return overrides;
}

// Neighbourhood hotspots and crime contacts are abstract in-district points, not
// buildings, so the generator can't move them directly. On a generated layout (a
// building carries a derived `anchor`) we pin each to the front of the nearest
// unused storefront in its own district — a real, walkable spot near actual shops
// — preserving id/flavour/radius. A hand-authored layout produces no overrides, so
// the default map keeps its authored positions untouched.
function poiOverrides(
  layout: WorldMapLayout,
  items: ReadonlyArray<{ id: string; districtId: string; x: number; z: number }>
): Record<string, Vec2> {
  const generated = layout.buildings.some((building) => building.locationId && building.anchor);
  if (!generated) {
    return {};
  }
  const overrides: Record<string, Vec2> = {};
  const usedByDistrict = new Map<string, Set<WorldBuilding>>();
  for (const item of items) {
    const used = usedByDistrict.get(item.districtId) ?? new Set<WorldBuilding>();
    let best: WorldBuilding | null = null;
    let bestDistance = Infinity;
    for (const building of layout.buildings) {
      if (building.districtId !== item.districtId || used.has(building)) {
        continue;
      }
      const distance = (building.x - item.x) ** 2 + (building.z - item.z) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = building;
      }
    }
    if (best) {
      used.add(best);
      usedByDistrict.set(item.districtId, used);
      overrides[item.id] = frontCenter(best);
    }
  }
  return overrides;
}

export function hotspotPositionOverrides(layout: WorldMapLayout): Record<string, Vec2> {
  return poiOverrides(layout, neighborhoodHotspots);
}

export function crimeContactPositionOverrides(layout: WorldMapLayout): Record<string, Vec2> {
  return poiOverrides(layout, crimeContacts);
}
