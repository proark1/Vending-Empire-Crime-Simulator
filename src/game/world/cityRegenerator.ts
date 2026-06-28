// Turns the raw geometry from generateCityPlan into a complete, game-coherent
// WorldMapLayout: it keeps every named location's identity, re-derives the
// coupled machine anchors / interiors, and re-anchors decorations, patrol zones,
// patrol paths and traffic loops onto the freshly generated street network.
//
// Pure and deterministic (same seed -> same layout), so the editor "Generate"
// button and the property tests share one code path.

import type { Bounds2, Vec2 } from "../core/types";
import {
  districts,
  facingOutwardUnit,
  patrolZones as defaultPatrolZones,
  policePatrolPaths as defaultPolicePatrolPaths,
  trafficLoops as defaultTrafficLoops,
  worldBuildings,
  worldBounds,
  worldInteriors,
  worldParks,
  type BuildingFacing,
  type CityBackdropBuilding,
  type PatrolZone,
  type PolicePatrolPath,
  type TrafficLoop,
  type WorldBuilding,
  type WorldDecoration,
  type WorldDecorationKind,
  type WorldInterior,
  type WorldMapLayout,
  type WorldPark,
  type WorldRoad
} from "../content/world";
import { WORLD_SCALE } from "./scale";
import { generateCityPlan, relaxBuildings, type CityBlock } from "./cityLayout";
import { deriveBuildingAnchor } from "./locationGeometry";
import { sidewalkFootprintsForRoads } from "./sidewalks";
import { createRng, type Rng } from "./rng";
import {
  boundsArea,
  boundsCenter,
  inflate,
  pointInRect,
  rectContains,
  rectsOverlap,
  snap,
  snapBounds
} from "./rectGrid";
import { createRectSpatialIndex, RectSpatialIndex } from "./spatialIndex";

const SIDEWALK = WORLD_SCALE.road.sidewalkWidth;
const SETBACK = WORLD_SCALE.layout.placementSetback;
const MIN_GAP = WORLD_SCALE.layout.minBuildingGap;
// The street-view player spawn (ThreeScene.tsx) — kept clear of buildings so the
// validator's spawn-blocked check never fires on a generated layout.
const PLAYER_SPAWN: Vec2 = { x: -9, z: 5.9 };
const SPAWN_CLEAR = 0.35;

function roadFootprint(road: WorldRoad): Bounds2 {
  return {
    minX: road.x - road.width / 2,
    maxX: road.x + road.width / 2,
    minZ: road.z - road.depth / 2,
    maxZ: road.z + road.depth / 2
  };
}

interface RoadGeometry {
  bounds: Bounds2;
  center: Vec2;
  horizontal: boolean;
  road: WorldRoad;
}

interface PlacementContext {
  roadGeometry: RoadGeometry[];
  roadIndex: RectSpatialIndex<RoadGeometry>;
}

function createPlacementContext(roads: WorldRoad[]): PlacementContext {
  const roadGeometry = roads.map((road) => {
    const bounds = roadFootprint(road);
    return {
      bounds,
      center: boundsCenter(bounds),
      horizontal: road.width >= road.depth,
      road
    };
  });
  return {
    roadGeometry,
    roadIndex: new RectSpatialIndex(roadGeometry.map((item) => ({ bounds: item.bounds, item })))
  };
}

function footprint(building: WorldBuilding): Bounds2 {
  const swap = building.facing === "east" || building.facing === "west";
  const x = swap ? building.depth : building.width;
  const z = swap ? building.width : building.depth;
  return { minX: building.x - x / 2, maxX: building.x + x / 2, minZ: building.z - z / 2, maxZ: building.z + z / 2 };
}

function candidateFootprint(candidate: ForcedCandidate): Bounds2 {
  const swap = candidate.facing === "east" || candidate.facing === "west";
  const x = swap ? candidate.depth : candidate.width;
  const z = swap ? candidate.width : candidate.depth;
  return { minX: candidate.x - x / 2, maxX: candidate.x + x / 2, minZ: candidate.z - z / 2, maxZ: candidate.z + z / 2 };
}

function footprintCoversSpawn(bounds: Bounds2): boolean {
  return pointInRect(PLAYER_SPAWN, inflate(bounds, SPAWN_CLEAR));
}

function coversSpawn(building: WorldBuilding): boolean {
  return footprintCoversSpawn(footprint(building));
}

function normalized(point: Vec2, bounds: Bounds2): Vec2 {
  const w = bounds.maxX - bounds.minX || 1;
  const d = bounds.maxZ - bounds.minZ || 1;
  return { x: (point.x - bounds.minX) / w, z: (point.z - bounds.minZ) / d };
}

// Cardinal direction from a point toward the nearest road.
function facingTowardNearestRoad(point: Vec2, roadGeometry: RoadGeometry[]): BuildingFacing {
  let best: RoadGeometry | null = null;
  let bestDistance = Infinity;
  for (const road of roadGeometry) {
    const distance = Math.hypot(road.center.x - point.x, road.center.z - point.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = road;
    }
  }
  if (!best) {
    return "north";
  }
  if (best.horizontal) {
    return best.road.z <= point.z ? "north" : "south";
  }
  return best.road.x <= point.x ? "west" : "east";
}

// ---------------------------------------------------------------------------
// Buildings — assign named identities, fill the rest, derive anchors
// ---------------------------------------------------------------------------
interface NamedTemplate {
  districtId: string;
  height: number;
  locationId: string;
  signText: string;
  style: WorldBuilding["style"];
  origin: Vec2;
}

function namedTemplates(): NamedTemplate[] {
  return worldBuildings
    .filter((building) => building.locationId)
    .map((building) => ({
      districtId: building.districtId,
      height: building.height,
      locationId: building.locationId as string,
      signText: building.signText,
      style: building.style,
      origin: { x: building.x, z: building.z }
    }));
}

interface ForcedCandidate {
  facing: BuildingFacing;
  width: number;
  depth: number;
  x: number;
  z: number;
}

// Candidate building slots lined up along the building-side of every nearby
// road, facing the road. Because the front (road side) is always free of
// buildings, the derived machine anchor never lands inside a neighbour — which
// the plain grid scan could not guarantee.
function* alongRoadCandidates(region: Bounds2, roadGeometry: RoadGeometry[], w: number, d: number): Iterable<ForcedCandidate> {
  const offset = SIDEWALK + SETBACK + d / 2;
  for (const roadInfo of roadGeometry) {
    const { bounds: rb, road } = roadInfo;
    if (!rectsOverlap(inflate(rb, 24), region)) {
      continue;
    }
    if (roadInfo.horizontal) {
      for (const side of [-1, 1] as const) {
        const z = snap(road.z + side * (road.depth / 2 + offset));
        const facing: BuildingFacing = side < 0 ? "south" : "north";
        for (let x = region.minX + w / 2; x <= region.maxX - w / 2; x += w + MIN_GAP) {
          yield { facing, width: w, depth: d, x: snap(x), z };
        }
      }
    } else {
      for (const side of [-1, 1] as const) {
        const x = snap(road.x + side * (road.width / 2 + offset));
        const facing: BuildingFacing = side < 0 ? "east" : "west";
        for (let z = region.minZ + w / 2; z <= region.maxZ - w / 2; z += w + MIN_GAP) {
          yield { facing, width: w, depth: d, x, z: snap(z) };
        }
      }
    }
  }
}

function* gridCandidates(region: Bounds2, roadGeometry: RoadGeometry[], w: number, d: number, step: number): Iterable<ForcedCandidate> {
  for (let x = region.minX + w / 2; x <= region.maxX - w / 2; x += step) {
    for (let z = region.minZ + d / 2; z <= region.maxZ - d / 2; z += step) {
      yield { facing: facingTowardNearestRoad({ x, z }, roadGeometry), width: w, depth: d, x: snap(x), z: snap(z) };
    }
  }
}

function* nearRoadGridCandidates(region: Bounds2, roadGeometry: RoadGeometry[], w: number, d: number, step: number): Iterable<ForcedCandidate> {
  const seen = new Set<string>();
  const baseOffset = SIDEWALK + SETBACK + d / 2;
  const maxSpan = Math.max(region.maxX - region.minX, region.maxZ - region.minZ);
  const rings = Math.ceil(maxSpan / step);
  const emit = function* (candidate: ForcedCandidate): Iterable<ForcedCandidate> {
    if (
      candidate.x < region.minX + w / 2
      || candidate.x > region.maxX - w / 2
      || candidate.z < region.minZ + d / 2
      || candidate.z > region.maxZ - d / 2
    ) {
      return;
    }
    const key = `${candidate.x}:${candidate.z}:${candidate.facing}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    yield candidate;
  };

  for (let ring = 0; ring <= rings; ring += 1) {
    const offset = baseOffset + ring * step;
    for (const roadInfo of roadGeometry) {
      const { road } = roadInfo;
      if (roadInfo.horizontal) {
        const xStart = Math.max(region.minX + w / 2, road.x - road.width / 2);
        const xEnd = Math.min(region.maxX - w / 2, road.x + road.width / 2);
        for (const side of [-1, 1] as const) {
          const z = snap(road.z + side * (road.depth / 2 + offset));
          const facing: BuildingFacing = side < 0 ? "south" : "north";
          for (let x = xStart; x <= xEnd; x += step) {
            yield* emit({ facing, width: w, depth: d, x: snap(x), z });
          }
        }
      } else {
        const zStart = Math.max(region.minZ + d / 2, road.z - road.depth / 2);
        const zEnd = Math.min(region.maxZ - d / 2, road.z + road.depth / 2);
        for (const side of [-1, 1] as const) {
          const x = snap(road.x + side * (road.width / 2 + offset));
          const facing: BuildingFacing = side < 0 ? "east" : "west";
          for (let z = zStart; z <= zEnd; z += step) {
            yield* emit({ facing, width: w, depth: d, x, z: snap(z) });
          }
        }
      }
    }
  }
}

function forcePlaceNamed(
  template: NamedTemplate,
  context: PlacementContext,
  placed: WorldBuilding[]
): WorldBuilding | null {
  const district = districts[template.districtId];
  if (!district) {
    return null;
  }
  const region = district.bounds;
  const clear = SETBACK + 0.05;
  const placedFootprints = placed.map((building) => ({ bounds: footprint(building), building }));
  const placedIndex = new RectSpatialIndex(placedFootprints.map((item) => ({ bounds: item.bounds, item })));
  const placedGapIndex = new RectSpatialIndex(placedFootprints.map((item) => ({ bounds: inflate(item.bounds, MIN_GAP / 2), item })));
  const namedGapIndex = new RectSpatialIndex(
    placedFootprints
      .filter((item) => item.building.locationId)
      .map((item) => ({ bounds: inflate(item.bounds, MIN_GAP / 2), item }))
  );
  // A spot stays "walkable-between" from every other storefront when no already-
  // placed named footprint sits within the navigable gap of it. Every gap warning
  // is location-vs-location, so honouring this in the fallbacks removes them.
  const keepsNamedGap = (fp: Bounds2): boolean => {
    const gapFp = inflate(fp, MIN_GAP / 2);
    return !namedGapIndex.some(gapFp, (entry) => rectsOverlap(gapFp, entry.bounds));
  };
  // Prefer street-facing row slots (clean anchor fronts); fall back to a packed
  // grid scan, with progressively smaller footprints / finer steps so even a
  // crammed starter suburb fits its last named location.
  const attempts: Array<{ size: [number, number]; step: number }> = [
    { size: [5, 5], step: 1.5 },
    { size: [4.5, 4.5], step: 1.5 },
    { size: [4, 4], step: 1.25 },
    { size: [3.5, 3.5], step: 1 },
    { size: [3, 3], step: 0.75 }
  ];
  const tryCandidate = (candidate: ForcedCandidate, roadClearance: number, requireGap: boolean): WorldBuilding | null => {
    if (!pointInRect({ x: candidate.x, z: candidate.z }, region)) {
      return null;
    }
    const fp = candidateFootprint(candidate);
    if (footprintCoversSpawn(fp) || !rectContains(worldBounds, fp)) {
      return null;
    }
    const roadBounds = inflate(fp, roadClearance);
    if (context.roadIndex.some(roadBounds, (entry) => rectsOverlap(roadBounds, entry.bounds))) {
      return null;
    }
    if (requireGap) {
      const gapFp = inflate(fp, MIN_GAP / 2);
      if (placedGapIndex.some(gapFp, (entry) => rectsOverlap(gapFp, entry.bounds))) {
        return null;
      }
    } else if (placedIndex.some(fp, (entry) => rectsOverlap(fp, entry.bounds))) {
      return null;
    }
    return {
      id: `${template.locationId}_building`,
      locationId: template.locationId,
      districtId: template.districtId,
      facing: candidate.facing,
      height: Math.max(template.height, WORLD_SCALE.building.minimumStorefrontHeight),
      signText: template.signText,
      style: template.style,
      width: candidate.width,
      depth: candidate.depth,
      x: candidate.x,
      z: candidate.z
    };
  };

  for (const { size: [w, d], step } of attempts) {
    for (const candidate of alongRoadCandidates(region, context.roadGeometry, w, d)) {
      const building = tryCandidate(candidate, clear, true);
      if (building) {
        return building;
      }
    }
    for (const candidate of gridCandidates(region, context.roadGeometry, w, d, step)) {
      const building = tryCandidate(candidate, clear, true);
      if (building) {
        return building;
      }
    }
  }

  // Packed district: take over a SAME-district filler's clean, street-facing slot
  // (never relabel a building from another district — that would strand it
  // outside its district bounds).
  // Prefer stealing a filler slot that keeps a clear gap from placed locations;
  // only take a flush one if no spaced filler is left in the district.
  let stealIndex = placed.findIndex((b) => !b.locationId && b.districtId === template.districtId && keepsNamedGap(footprint(b)));
  if (stealIndex < 0) {
    stealIndex = placed.findIndex((b) => !b.locationId && b.districtId === template.districtId);
  }
  if (stealIndex >= 0) {
    const filler = placed[stealIndex];
    placed.splice(stealIndex, 1);
    return {
      ...filler,
      id: `${template.locationId}_building`,
      locationId: template.locationId,
      signText: template.signText,
      style: template.style,
      height: Math.max(template.height, WORLD_SCALE.building.minimumStorefrontHeight)
    };
  }

  // Last resort: a tiny in-district footprint. Try road-hugging slots first, then
  // the remaining free spots ordered by proximity to a road, so the building
  // still ends up beside a street rather than mid-block. It only has to stay off
  // the road (exact) and not overlap another building — it may sit closer than
  // the navigable gap (a non-blocking warning) but never errors or leaves its
  // district.
  const tiny = 2;
  let tinyFallback: WorldBuilding | null = null;
  for (const candidate of nearRoadGridCandidates(region, context.roadGeometry, tiny, tiny, 0.5)) {
    const building = tryCandidate(candidate, 0.1, false);
    if (!building) {
      continue;
    }
    const fp = footprint(building);
    if (keepsNamedGap(fp)) {
      return building; // a clean, walkable-between spot
    }
    if (!tinyFallback) {
      tinyFallback = building; // remember the first valid spot in case nothing is spaced
    }
  }
  return tinyFallback;
}

function buildBuildings(plan: ReturnType<typeof generateCityPlan>): WorldBuilding[] {
  const placementContext = createPlacementContext(plan.roads);
  const templatesByDistrict = new Map<string, NamedTemplate[]>();
  for (const template of namedTemplates()) {
    const list = templatesByDistrict.get(template.districtId) ?? [];
    list.push(template);
    templatesByDistrict.set(template.districtId, list);
  }

  const lotsByDistrict = new Map<string, WorldBuilding[]>();
  for (const lot of plan.buildings) {
    const list = lotsByDistrict.get(lot.districtId) ?? [];
    list.push(lot);
    lotsByDistrict.set(lot.districtId, list);
  }

  const result: WorldBuilding[] = [];

  for (const districtId of Object.keys(districts).sort()) {
    const district = districts[districtId];
    const templates = (templatesByDistrict.get(districtId) ?? []).sort((a, b) =>
      a.locationId < b.locationId ? -1 : 1
    );
    const pool = lotsByDistrict.get(districtId) ?? [];

    for (const template of templates) {
      const target = normalized(template.origin, district.bounds);
      let bestIndex = -1;
      let bestDistance = Infinity;
      for (let i = 0; i < pool.length; i += 1) {
        const candidate = normalized({ x: pool[i].x, z: pool[i].z }, district.bounds);
        const distance = Math.hypot(candidate.x - target.x, candidate.z - target.z);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      }

      if (bestIndex >= 0) {
        const [lot] = pool.splice(bestIndex, 1);
        result.push({
          ...lot,
          id: `${template.locationId}_building`,
          locationId: template.locationId,
          signText: template.signText,
          style: template.style,
          height: Math.max(template.height, WORLD_SCALE.building.minimumStorefrontHeight)
        });
      } else {
        const forced = forcePlaceNamed(template, placementContext, result);
        if (!forced) {
          throw new Error(`city regenerator could not place location "${template.locationId}" in ${districtId}`);
        }
        result.push(forced);
      }
    }

    // Remaining lots become anonymous filler.
    result.push(...pool);
  }

  // Keep the player spawn clear: drop filler sitting on it; re-place any named
  // building that lands on it so the validator's spawn check passes.
  const cleared: WorldBuilding[] = [];
  const displacedNamed: NamedTemplate[] = [];
  for (const building of result) {
    if (!coversSpawn(building)) {
      cleared.push(building);
      continue;
    }
    if (building.locationId) {
      displacedNamed.push({
        districtId: building.districtId,
        height: building.height,
        locationId: building.locationId,
        signText: building.signText,
        style: building.style,
        origin: { x: building.x, z: building.z }
      });
    }
  }
  for (const template of displacedNamed) {
    const forced = forcePlaceNamed(template, placementContext, cleared);
    if (!forced) {
      throw new Error(`city regenerator could not re-place spawn-blocked location "${template.locationId}"`);
    }
    cleared.push(forced);
  }

  // Dense packing can leave a named location in an interior row with no clear
  // front for its vending machine. Swap any such location with the nearest
  // clear-front filler (filler needs no machine), so every storefront keeps a
  // street/alley-facing front.
  ensureClearFronts(cleared);

  // Derive machine anchors for every location building now that all footprints
  // are known (so the anchor never lands inside a neighbour).
  const allFootprints = cleared.map(footprint);
  return cleared.map((building) =>
    building.locationId
      ? { ...building, anchor: deriveBuildingAnchor(building, allFootprints) }
      : building
  );
}

// True when a point ~1.1u in front of the storefront wall is inside another
// building (so a machine placed there would face into a wall).
function frontBlocked(building: WorldBuilding, others: WorldBuilding[]): boolean {
  const out = facingOutwardUnit(building.facing ?? "north");
  const swap = building.facing === "east" || building.facing === "west";
  const half = (swap ? building.width : building.depth) / 2;
  const front = { x: building.x + out.x * (half + 1.1), z: building.z + out.z * (half + 1.1) };
  return others.some((other) => other !== building && pointInRect(front, footprint(other)));
}

function ensureClearFronts(buildings: WorldBuilding[]): void {
  for (const named of buildings) {
    if (!named.locationId || !frontBlocked(named, buildings)) {
      continue;
    }
    let best: WorldBuilding | null = null;
    let bestDistance = Infinity;
    for (const filler of buildings) {
      if (filler.locationId || filler.districtId !== named.districtId || frontBlocked(filler, buildings)) {
        continue;
      }
      const distance = Math.hypot(filler.x - named.x, filler.z - named.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = filler;
      }
    }
    if (best) {
      // Swap footprints/positions; identities (locationId/sign/style) stay put.
      const swap = { x: named.x, z: named.z, facing: named.facing, width: named.width, depth: named.depth };
      named.x = best.x;
      named.z = best.z;
      named.facing = best.facing;
      named.width = best.width;
      named.depth = best.depth;
      best.x = swap.x;
      best.z = swap.z;
      best.facing = swap.facing;
      best.width = swap.width;
      best.depth = swap.depth;
    }
  }
}

// ---------------------------------------------------------------------------
// Interiors — rebuilt from the regenerated walkable buildings
// ---------------------------------------------------------------------------
function buildInteriors(buildings: WorldBuilding[]): WorldInterior[] {
  const byLocation = new Map<string, WorldBuilding>();
  for (const building of buildings) {
    if (building.locationId) {
      byLocation.set(building.locationId, building);
    }
  }
  const interiors: WorldInterior[] = [];
  for (const template of worldInteriors) {
    const building = byLocation.get(template.locationId);
    if (!building) {
      continue;
    }
    interiors.push({
      id: template.id,
      districtId: building.districtId,
      locationId: template.locationId,
      label: template.label,
      style: template.style,
      openSide: (building.facing ?? "north"),
      x: building.x,
      z: building.z,
      width: building.width,
      depth: building.depth
    });
  }
  return interiors;
}

// ---------------------------------------------------------------------------
// Decorations — streetlights / planters along the sidewalks
// ---------------------------------------------------------------------------
function roadDistrictMap(roads: WorldRoad[]): Map<string, string> {
  return new Map(roads.map((road) => [road.id, road.districtId]));
}

function buildDecorations(roads: WorldRoad[], sidewalks: Array<{ depth: number; sourceRoadId: string; width: number; x: number; z: number }>, rng: Rng): WorldDecoration[] {
  const roadDistrict = roadDistrictMap(roads);
  const roadIndex = createRectSpatialIndex(roads, roadFootprint);
  const decorations: WorldDecoration[] = [];
  const kinds: WorldDecorationKind[] = ["streetlight", "planter", "bollard", "utility_box"];
  // A prop's footprint must stay this far clear of every road — nothing belongs
  // on the asphalt, only cars and pedestrians.
  const PROP_CLEARANCE = 0.9;
  let index = 0;
  // Sidewalk strips are only ~sidewalkWidth deep, so qualify on the longer span;
  // skip the rest to avoid clutter.
  const eligible = sidewalks.filter((piece) => Math.max(piece.width, piece.depth) >= 3 && Math.min(piece.width, piece.depth) >= 1.4);
  for (const piece of eligible) {
    if (!rng.chance(0.4)) {
      continue;
    }
    const propBounds: Bounds2 = {
      minX: piece.x - PROP_CLEARANCE,
      maxX: piece.x + PROP_CLEARANCE,
      minZ: piece.z - PROP_CLEARANCE,
      maxZ: piece.z + PROP_CLEARANCE
    };
    if (roadIndex.some(propBounds, (entry) => rectsOverlap(propBounds, entry.bounds))) {
      continue; // would intrude onto a road
    }
    const kind = rng.pick(kinds);
    decorations.push({
      id: `gen_prop_${index}`,
      districtId: roadDistrict.get(piece.sourceRoadId) ?? Object.keys(districts)[0],
      kind,
      x: snap(piece.x),
      z: snap(piece.z),
      rotationY: 0,
      scale: 1,
      color: "#fef3c7"
    });
    index += 1;
  }
  return decorations;
}

// Empty blocks — thin medians, edge verges and leftover gaps that can't hold a
// building — would otherwise read as barren ground. Fill them with a jittered
// grid of leafy planters so they look like landscaped greens instead of voids.
function buildGreenery(blocks: CityBlock[], buildings: WorldBuilding[], roads: WorldRoad[], parks: WorldPark[], rng: Rng): WorldDecoration[] {
  const roadIndex = createRectSpatialIndex(roads, roadFootprint);
  // Keep planters clear of building footprints — a neighbouring block's building
  // can overhang an "empty" block, which the centre-only emptiness test misses.
  const buildingIndex = new RectSpatialIndex(buildings.map((building) => {
    const bounds = inflate(footprint(building), 0.6);
    return { bounds, item: bounds };
  }));
  const parkBounds = parks.map((park) => park.bounds);
  const greenColors = ["#4ade80", "#22c55e", "#65a30d", "#16a34a"];
  const out: WorldDecoration[] = [];
  let index = 0;
  for (const block of blocks) {
    if (out.length >= 280) {
      break;
    }
    const b = block.bounds;
    const occupied = buildings.some((building) => building.x > b.minX && building.x < b.maxX && building.z > b.minZ && building.z < b.maxZ);
    if (occupied || parkBounds.some((pb) => rectsOverlap(b, pb))) {
      continue;
    }
    const minX = b.minX + 1;
    const maxX = b.maxX - 1;
    const minZ = b.minZ + 1;
    const maxZ = b.maxZ - 1;
    if (maxX - minX < 0.5 || maxZ - minZ < 0.5) {
      continue;
    }
    // Thin perimeter verges get sparse, evenly-spread planting; roomy interior
    // empties get a fuller fill. A larger step (not a hard count cap) keeps the
    // planters spread across the block instead of clustered at one end.
    const thin = Math.min(maxX - minX, maxZ - minZ) < 4.5;
    const step = thin ? 12 : 4.4;
    const chance = thin ? 0.85 : 0.62;
    for (let x = minX + 0.3; x <= maxX; x += step) {
      for (let z = minZ + 0.3; z <= maxZ; z += step) {
        if (!rng.chance(chance)) {
          continue;
        }
        const px = snap(Math.min(maxX, x + rng.range(-0.4, 0.4)));
        const pz = snap(Math.min(maxZ, z + rng.range(-0.4, 0.4)));
        const pointBounds: Bounds2 = { minX: px, maxX: px, minZ: pz, maxZ: pz };
        if (buildingIndex.some(pointBounds, (entry) => pointInRect({ x: px, z: pz }, entry.bounds))) {
          continue;
        }
        const propBounds: Bounds2 = { minX: px - 0.9, maxX: px + 0.9, minZ: pz - 0.9, maxZ: pz + 0.9 };
        if (roadIndex.some(propBounds, (entry) => rectsOverlap(propBounds, entry.bounds))) {
          continue;
        }
        out.push({
          id: `gen_green_${index}`,
          districtId: block.districtId,
          kind: "planter",
          x: px,
          z: pz,
          rotationY: snap(rng.range(0, Math.PI)),
          scale: snap(rng.range(1.1, 1.6)),
          color: rng.pick(greenColors)
        });
        index += 1;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Patrol zones / paths + traffic loops — re-anchored onto the new network
// ---------------------------------------------------------------------------
function longestRoadInDistrict(roads: WorldRoad[], districtId: string): WorldRoad | null {
  let best: WorldRoad | null = null;
  let bestLength = -1;
  for (const road of roads) {
    if (road.districtId !== districtId) {
      continue;
    }
    const length = Math.max(road.width, road.depth);
    if (length > bestLength) {
      bestLength = length;
      best = road;
    }
  }
  return best ?? roads[0] ?? null;
}

function clampZoneCenter(point: Vec2, radius: number): Vec2 {
  return {
    x: Math.min(Math.max(point.x, worldBounds.minX + radius), worldBounds.maxX - radius),
    z: Math.min(Math.max(point.z, worldBounds.minZ + radius), worldBounds.maxZ - radius)
  };
}

function buildPatrols(roads: WorldRoad[]): { zones: PatrolZone[]; paths: PolicePatrolPath[] } {
  const zones: PatrolZone[] = [];
  const centerByZone = new Map<string, Vec2>();
  const roadByZone = new Map<string, WorldRoad>();
  for (const zone of defaultPatrolZones) {
    const road = longestRoadInDistrict(roads, zone.districtId);
    const anchor = road ? boundsCenter(roadFootprint(road)) : { x: 0, z: 0 };
    const center = clampZoneCenter(anchor, zone.radius);
    centerByZone.set(zone.id, center);
    if (road) {
      roadByZone.set(zone.id, road);
    }
    zones.push({ ...zone, x: snap(center.x), z: snap(center.z) });
  }

  const paths: PolicePatrolPath[] = defaultPolicePatrolPaths.map((patrol) => {
    const zone = zones.find((candidate) => candidate.id === patrol.zoneId);
    const center = centerByZone.get(patrol.zoneId) ?? { x: 0, z: 0 };
    const radius = zone?.radius ?? 4;
    const road = roadByZone.get(patrol.zoneId);
    // Keep the loop inside the road footprint (building-free) and within radius.
    const along = Math.min(radius * 0.55, 6);
    let perp = Math.min(radius * 0.45, 2);
    let horizontal = true;
    if (road) {
      horizontal = road.width >= road.depth;
      const crossHalf = (horizontal ? road.depth : road.width) / 2 - 0.6;
      perp = Math.max(0.6, Math.min(perp, crossHalf));
    }
    const rect = horizontal
      ? [
          { x: center.x - along, z: center.z - perp },
          { x: center.x + along, z: center.z - perp },
          { x: center.x + along, z: center.z + perp },
          { x: center.x - along, z: center.z + perp }
        ]
      : [
          { x: center.x - perp, z: center.z - along },
          { x: center.x + perp, z: center.z - along },
          { x: center.x + perp, z: center.z + along },
          { x: center.x - perp, z: center.z + along }
        ];
    return { ...patrol, path: rect.map((p) => ({ x: snap(p.x), z: snap(p.z) })) };
  });

  return { zones, paths };
}

function buildTrafficLoops(roads: WorldRoad[]): TrafficLoop[] {
  return defaultTrafficLoops.map((loop) => {
    const road = longestRoadInDistrict(roads, loop.districtId) ?? roads[0];
    const bounds = roadFootprint(road);
    const horizontal = road.width >= road.depth;
    let path: Vec2[];
    if (horizontal) {
      const offset = Math.min(1.0, road.depth / 2 - 0.6);
      const x1 = snap(bounds.minX + 3);
      const x2 = snap(bounds.maxX - 3);
      path = [
        { x: x1, z: snap(road.z - offset) },
        { x: x2, z: snap(road.z - offset) },
        { x: x2, z: snap(road.z + offset) },
        { x: x1, z: snap(road.z + offset) }
      ];
    } else {
      const offset = Math.min(1.0, road.width / 2 - 0.6);
      const z1 = snap(bounds.minZ + 3);
      const z2 = snap(bounds.maxZ - 3);
      path = [
        { x: snap(road.x - offset), z: z1 },
        { x: snap(road.x - offset), z: z2 },
        { x: snap(road.x + offset), z: z2 },
        { x: snap(road.x + offset), z: z1 }
      ];
    }
    return { ...loop, path };
  });
}

// ---------------------------------------------------------------------------
// Parks — drop the park into a real, EMPTY block so it reads as open green
// space. A block still holding a named location building would bury the grass
// behind storefronts (the minimap showed a park the player never saw), so only
// blocks free of location buildings qualify; their filler is dropped later.
// ---------------------------------------------------------------------------
function fitParks(blocks: CityBlock[], buildings: WorldBuilding[]): WorldPark[] {
  const locationFootprints = buildings.filter((b) => b.locationId).map(footprint);
  const used: Bounds2[] = [];
  return worldParks.map((park) => {
    const candidates = blocks
      .filter((block) => boundsArea(block.bounds) > 240)
      .filter((block) => {
        const inset = inflate(block.bounds, -SIDEWALK);
        return !locationFootprints.some((fp) => rectsOverlap(inset, fp)) && !used.some((u) => rectsOverlap(block.bounds, u));
      })
      .sort((a, b) => {
        const prefA = a.districtId === park.districtId ? 1 : 0;
        const prefB = b.districtId === park.districtId ? 1 : 0;
        if (prefA !== prefB) {
          return prefB - prefA;
        }
        return boundsArea(b.bounds) - boundsArea(a.bounds);
      });
    const block = candidates[0];
    if (!block) {
      return park;
    }
    used.push(block.bounds);
    const bounds = snapBounds(inflate(block.bounds, -SIDEWALK));
    const center = boundsCenter(bounds);
    const radius = Math.min(park.pond.radius, Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 4);
    return {
      ...park,
      districtId: block.districtId,
      bounds,
      pond: { x: snap(center.x), z: snap(center.z), radius: snap(radius) }
    };
  });
}

// ---------------------------------------------------------------------------
// Backdrop skyline — regenerated to fit the new layout
//
// The authored skyline is positioned for the authored geography; reusing it
// drops tall, collision-free buildings onto the generated streets and on top of
// generated storefronts. Instead, scatter distant skyline boxes only where they
// clear the roads (and their sidewalks) and every generated building.
// ---------------------------------------------------------------------------
const BACKDROP_COLORS = ["#475569", "#334155", "#1e293b", "#3f3f46", "#52525b", "#293548", "#1f2937"];

const districtsByArea = Object.values(districts).sort((a, b) => {
  const area = boundsArea(a.bounds) - boundsArea(b.bounds);
  return area !== 0 ? area : a.id < b.id ? -1 : 1;
});

function districtAt(point: Vec2): string {
  for (const district of districtsByArea) {
    if (pointInRect(point, district.bounds)) {
      return district.id;
    }
  }
  return districtsByArea[districtsByArea.length - 1].id;
}

function buildBackdrops(roads: WorldRoad[], buildings: WorldBuilding[], parks: WorldPark[], rng: Rng): CityBackdropBuilding[] {
  const roadIndex = new RectSpatialIndex(roads.map((road) => {
    const bounds = inflate(roadFootprint(road), SIDEWALK + 0.5);
    return { bounds, item: bounds };
  }));
  const buildingIndex = new RectSpatialIndex(buildings.map((building) => {
    const bounds = inflate(footprint(building), 0.5);
    return { bounds, item: bounds };
  }));
  // Parks are open green space — never drop a skyline tower onto one.
  const parkIndex = new RectSpatialIndex(parks.map((park) => {
    const bounds = inflate(park.bounds, 1);
    return { bounds, item: bounds };
  }));
  const out: CityBackdropBuilding[] = [];
  const step = 13;
  for (let x = worldBounds.minX + 8; x <= worldBounds.maxX - 8; x += step) {
    for (let z = worldBounds.minZ + 8; z <= worldBounds.maxZ - 8; z += step) {
      if (!rng.chance(0.5)) {
        continue;
      }
      const w = rng.range(7, 13);
      const d = rng.range(7, 13);
      const fp: Bounds2 = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
      if (!rectContains(worldBounds, fp)) {
        continue;
      }
      if (roadIndex.some(fp, (entry) => rectsOverlap(fp, entry.bounds))) {
        continue;
      }
      if (buildingIndex.some(fp, (entry) => rectsOverlap(fp, entry.bounds))) {
        continue;
      }
      if (parkIndex.some(fp, (entry) => rectsOverlap(fp, entry.bounds))) {
        continue;
      }
      if (out.some((other) => rectsOverlap(fp, { minX: other.x - other.width / 2, maxX: other.x + other.width / 2, minZ: other.z - other.depth / 2, maxZ: other.z + other.depth / 2 }))) {
        continue;
      }
      out.push({
        districtId: districtAt({ x, z }),
        x: snap(x),
        z: snap(z),
        width: snap(w),
        depth: snap(d),
        height: snap(rng.range(8, 24)),
        color: rng.pick(BACKDROP_COLORS),
        lit: rng.range(0.15, 0.5)
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
export function regenerateCity(seed: string): WorldMapLayout {
  const plan = generateCityPlan(seed);
  const rng = createRng(seed).fork("regen");

  const buildings = buildBuildings(plan);
  const parks = fitParks(plan.blocks, buildings);

  // Drop any building that would sit on a park.
  const parkBounds = parks.map((park) => park.bounds);
  const buildingsOffParks = buildings.filter(
    (building) => !parkBounds.some((bounds) => rectsOverlap(footprint(building), bounds)) || Boolean(building.locationId)
  );

  const interiors = buildInteriors(buildingsOffParks);
  const { zones, paths } = buildPatrols(plan.roads);
  const trafficLoops = buildTrafficLoops(plan.roads);

  // Sidewalks are derived for decoration placement only (not stored).
  const sidewalks = sidewalkFootprintsForRoads(plan.roads, buildingsOffParks);
  const decorations = [
    ...buildDecorations(plan.roads, sidewalks, rng.fork("decor")),
    ...buildGreenery(plan.blocks, buildingsOffParks, plan.roads, parks, rng.fork("green"))
  ];
  const backdropBuildings = buildBackdrops(plan.roads, buildingsOffParks, parks, rng.fork("backdrop"));

  return {
    backdropBuildings,
    buildings: buildingsOffParks,
    decorations,
    interiors,
    parks,
    patrolZones: zones,
    policePatrolPaths: paths,
    roads: plan.roads,
    trafficLoops
  };
}

export function relaxLayoutBuildings(layout: WorldMapLayout): WorldMapLayout {
  return {
    ...layout,
    buildings: relaxBuildings(layout.buildings, { gap: MIN_GAP, bounds: worldBounds, iterations: 12 })
  };
}
