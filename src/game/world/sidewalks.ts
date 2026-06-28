import type { Bounds2 } from "../core/types";
import { buildingFootprintExtents, type WorldBuilding, type WorldRoad } from "../content/world";
import { WORLD_SCALE } from "./scale";
import { snapBounds } from "./rectGrid";
import { RectSpatialIndex } from "./spatialIndex";

export interface SidewalkFootprint {
  depth: number;
  sourceRoadId: string;
  width: number;
  x: number;
  z: number;
}

const minimumSegmentSize = 0.12;

function roadFootprint(road: WorldRoad): Bounds2 {
  return snapBounds({
    minX: road.x - road.width / 2,
    maxX: road.x + road.width / 2,
    minZ: road.z - road.depth / 2,
    maxZ: road.z + road.depth / 2
  });
}

function buildingFootprint(
  building: Pick<WorldBuilding, "depth" | "width" | "x" | "z"> & { facing?: WorldBuilding["facing"] }
): Bounds2 {
  const extents = buildingFootprintExtents(building);
  return snapBounds({
    minX: building.x - extents.x / 2,
    maxX: building.x + extents.x / 2,
    minZ: building.z - extents.z / 2,
    maxZ: building.z + extents.z / 2
  });
}

function footprintFromSidewalk(sidewalk: SidewalkFootprint): Bounds2 {
  return {
    minX: sidewalk.x - sidewalk.width / 2,
    maxX: sidewalk.x + sidewalk.width / 2,
    minZ: sidewalk.z - sidewalk.depth / 2,
    maxZ: sidewalk.z + sidewalk.depth / 2
  };
}

function sidewalkFromFootprint(rawBounds: Bounds2, sourceRoadId: string): SidewalkFootprint | null {
  const bounds = snapBounds(rawBounds);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (width < minimumSegmentSize || depth < minimumSegmentSize) {
    return null;
  }

  return {
    depth,
    sourceRoadId,
    width,
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2
  };
}

function rectsOverlap(a: Bounds2, b: Bounds2): boolean {
  return a.minX < b.maxX
    && a.maxX > b.minX
    && a.minZ < b.maxZ
    && a.maxZ > b.minZ;
}

function subtractRect(rect: Bounds2, blocker: Bounds2): Bounds2[] {
  if (!rectsOverlap(rect, blocker)) {
    return [rect];
  }

  const overlap = {
    minX: Math.max(rect.minX, blocker.minX),
    maxX: Math.min(rect.maxX, blocker.maxX),
    minZ: Math.max(rect.minZ, blocker.minZ),
    maxZ: Math.min(rect.maxZ, blocker.maxZ)
  };

  const pieces: Bounds2[] = [];
  if (rect.minX < overlap.minX) {
    pieces.push({ minX: rect.minX, maxX: overlap.minX, minZ: rect.minZ, maxZ: rect.maxZ });
  }
  if (overlap.maxX < rect.maxX) {
    pieces.push({ minX: overlap.maxX, maxX: rect.maxX, minZ: rect.minZ, maxZ: rect.maxZ });
  }
  if (rect.minZ < overlap.minZ) {
    pieces.push({ minX: overlap.minX, maxX: overlap.maxX, minZ: rect.minZ, maxZ: overlap.minZ });
  }
  if (overlap.maxZ < rect.maxZ) {
    pieces.push({ minX: overlap.minX, maxX: overlap.maxX, minZ: overlap.maxZ, maxZ: rect.maxZ });
  }

  return pieces.filter((piece) => piece.maxX - piece.minX >= minimumSegmentSize && piece.maxZ - piece.minZ >= minimumSegmentSize);
}

function subtractMany(rect: Bounds2, blockers: Bounds2[]): Bounds2[] {
  let pieces = [rect];
  for (const blocker of blockers) {
    pieces = pieces.flatMap((piece) => subtractRect(piece, blocker));
    if (pieces.length === 0) {
      break;
    }
  }
  return pieces;
}

export function sidewalkStripsForRoad(road: WorldRoad, sidewalkWidth = WORLD_SCALE.road.sidewalkWidth): SidewalkFootprint[] {
  if (road.width >= road.depth) {
    const offset = road.depth / 2 + sidewalkWidth / 2;
    return [
      { x: road.x, z: road.z - offset, width: road.width, depth: sidewalkWidth, sourceRoadId: road.id },
      { x: road.x, z: road.z + offset, width: road.width, depth: sidewalkWidth, sourceRoadId: road.id }
    ];
  }

  const offset = road.width / 2 + sidewalkWidth / 2;
  return [
    { x: road.x - offset, z: road.z, width: sidewalkWidth, depth: road.depth, sourceRoadId: road.id },
    { x: road.x + offset, z: road.z, width: sidewalkWidth, depth: road.depth, sourceRoadId: road.id }
  ];
}

export function sidewalkFootprintsForRoads(
  roads: WorldRoad[],
  blockingBuildings: Array<Pick<WorldBuilding, "depth" | "width" | "x" | "z">> = []
): SidewalkFootprint[] {
  type Blocker = { bounds: Bounds2; sourceRoadId?: string };
  const blockers: Blocker[] = [
    ...roads.map((road) => ({ bounds: roadFootprint(road), sourceRoadId: road.id })),
    ...blockingBuildings.map((building) => ({ bounds: buildingFootprint(building) }))
  ];
  const blockerIndex = new RectSpatialIndex(blockers.map((item) => ({ bounds: item.bounds, item })));

  return roads.flatMap((road) => {
    return sidewalkStripsForRoad(road).flatMap((strip) => {
      const stripBounds = snapBounds(footprintFromSidewalk(strip));
      const localBlockers = blockerIndex
        .query(stripBounds)
        .filter((entry) => entry.item.sourceRoadId !== road.id && rectsOverlap(stripBounds, entry.bounds))
        .map((entry) => entry.bounds);
      const pieces = subtractMany(stripBounds, localBlockers);
      return pieces
        .map((piece) => sidewalkFromFootprint(piece, road.id))
        .filter((piece): piece is SidewalkFootprint => Boolean(piece));
    });
  });
}

export function sidewalkFootprintBounds(sidewalk: SidewalkFootprint): Bounds2 {
  return footprintFromSidewalk(sidewalk);
}

export function roadFootprintBounds(road: WorldRoad): Bounds2 {
  return roadFootprint(road);
}
