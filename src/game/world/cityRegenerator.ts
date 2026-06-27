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
  snap
} from "./rectGrid";

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

function footprint(building: WorldBuilding): Bounds2 {
  const swap = building.facing === "east" || building.facing === "west";
  const x = swap ? building.depth : building.width;
  const z = swap ? building.width : building.depth;
  return { minX: building.x - x / 2, maxX: building.x + x / 2, minZ: building.z - z / 2, maxZ: building.z + z / 2 };
}

function coversSpawn(building: WorldBuilding): boolean {
  return pointInRect(PLAYER_SPAWN, inflate(footprint(building), SPAWN_CLEAR));
}

function normalized(point: Vec2, bounds: Bounds2): Vec2 {
  const w = bounds.maxX - bounds.minX || 1;
  const d = bounds.maxZ - bounds.minZ || 1;
  return { x: (point.x - bounds.minX) / w, z: (point.z - bounds.minZ) / d };
}

// Cardinal direction from a point toward the nearest road.
function facingTowardNearestRoad(point: Vec2, roads: WorldRoad[]): BuildingFacing {
  let best: WorldRoad | null = null;
  let bestDistance = Infinity;
  for (const road of roads) {
    const bounds = roadFootprint(road);
    const center = boundsCenter(bounds);
    const distance = Math.hypot(center.x - point.x, center.z - point.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = road;
    }
  }
  if (!best) {
    return "north";
  }
  const horizontal = best.width >= best.depth;
  if (horizontal) {
    return best.z <= point.z ? "north" : "south";
  }
  return best.x <= point.x ? "west" : "east";
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
function alongRoadCandidates(region: Bounds2, roads: WorldRoad[], w: number, d: number): ForcedCandidate[] {
  const out: ForcedCandidate[] = [];
  const offset = SIDEWALK + SETBACK + d / 2;
  for (const road of roads) {
    const rb = roadFootprint(road);
    if (!rectsOverlap(inflate(rb, 24), region)) {
      continue;
    }
    if (road.width >= road.depth) {
      for (const side of [-1, 1] as const) {
        const z = snap(road.z + side * (road.depth / 2 + offset));
        const facing: BuildingFacing = side < 0 ? "south" : "north";
        for (let x = region.minX + w / 2; x <= region.maxX - w / 2; x += w + MIN_GAP) {
          out.push({ facing, width: w, depth: d, x: snap(x), z });
        }
      }
    } else {
      for (const side of [-1, 1] as const) {
        const x = snap(road.x + side * (road.width / 2 + offset));
        const facing: BuildingFacing = side < 0 ? "east" : "west";
        for (let z = region.minZ + w / 2; z <= region.maxZ - w / 2; z += w + MIN_GAP) {
          out.push({ facing, width: w, depth: d, x, z: snap(z) });
        }
      }
    }
  }
  return out;
}

function gridCandidates(region: Bounds2, roads: WorldRoad[], w: number, d: number, step: number): ForcedCandidate[] {
  const out: ForcedCandidate[] = [];
  for (let x = region.minX + w / 2; x <= region.maxX - w / 2; x += step) {
    for (let z = region.minZ + d / 2; z <= region.maxZ - d / 2; z += step) {
      out.push({ facing: facingTowardNearestRoad({ x, z }, roads), width: w, depth: d, x: snap(x), z: snap(z) });
    }
  }
  return out;
}

function forcePlaceNamed(
  template: NamedTemplate,
  roads: WorldRoad[],
  placed: WorldBuilding[]
): WorldBuilding | null {
  const district = districts[template.districtId];
  if (!district) {
    return null;
  }
  const region = district.bounds;
  const clear = SETBACK + 0.05;
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
  for (const { size: [w, d], step } of attempts) {
    const candidates = [...alongRoadCandidates(region, roads, w, d), ...gridCandidates(region, roads, w, d, step)];
    for (const candidate of candidates) {
      const building: WorldBuilding = {
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
      if (coversSpawn(building)) {
        continue;
      }
      if (!pointInRect({ x: building.x, z: building.z }, region)) {
        continue;
      }
      const fp = footprint(building);
      if (!rectContains(worldBounds, fp)) {
        continue;
      }
      if (roads.some((road) => rectsOverlap(inflate(fp, clear), roadFootprint(road)))) {
        continue;
      }
      const gapFp = inflate(fp, MIN_GAP / 2);
      if (placed.some((other) => rectsOverlap(gapFp, inflate(footprint(other), MIN_GAP / 2)))) {
        continue;
      }
      return building;
    }
  }

  // Absolute last resort for a fully-packed district: a tiny footprint that only
  // has to be non-overlapping (it may sit closer than the navigable gap, which
  // surfaces as a non-blocking warning rather than failing generation outright).
  const tiny = 2.5;
  for (let x = region.minX + tiny / 2; x <= region.maxX - tiny / 2; x += 0.5) {
    for (let z = region.minZ + tiny / 2; z <= region.maxZ - tiny / 2; z += 0.5) {
      const facing = facingTowardNearestRoad({ x, z }, roads);
      const building: WorldBuilding = {
        id: `${template.locationId}_building`,
        locationId: template.locationId,
        districtId: template.districtId,
        facing,
        height: Math.max(template.height, WORLD_SCALE.building.minimumStorefrontHeight),
        signText: template.signText,
        style: template.style,
        width: tiny,
        depth: tiny,
        x: snap(x),
        z: snap(z)
      };
      if (coversSpawn(building) || !pointInRect({ x, z }, region)) {
        continue;
      }
      const fp = footprint(building);
      if (!rectContains(worldBounds, fp)) {
        continue;
      }
      if (roads.some((road) => rectsOverlap(inflate(fp, clear), roadFootprint(road)))) {
        continue;
      }
      if (placed.some((other) => rectsOverlap(fp, footprint(other)))) {
        continue;
      }
      return building;
    }
  }
  return null;
}

function buildBuildings(plan: ReturnType<typeof generateCityPlan>): WorldBuilding[] {
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
        const forced = forcePlaceNamed(template, plan.roads, result);
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
    const forced = forcePlaceNamed(template, plan.roads, cleared);
    if (!forced) {
      throw new Error(`city regenerator could not re-place spawn-blocked location "${template.locationId}"`);
    }
    cleared.push(forced);
  }

  // Derive machine anchors for every location building now that all footprints
  // are known (so the anchor never lands inside a neighbour).
  const allFootprints = cleared.map(footprint);
  return cleared.map((building) =>
    building.locationId
      ? { ...building, anchor: deriveBuildingAnchor(building, allFootprints) }
      : building
  );
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
  const decorations: WorldDecoration[] = [];
  const kinds: WorldDecorationKind[] = ["streetlight", "planter", "bollard", "utility_box"];
  let index = 0;
  // Place a prop on the larger sidewalk pieces, skipping most to avoid clutter.
  const eligible = sidewalks.filter((piece) => piece.width >= 2.4 && piece.depth >= 2.4);
  for (const piece of eligible) {
    if (!rng.chance(0.4)) {
      continue;
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
  for (const zone of defaultPatrolZones) {
    const road = longestRoadInDistrict(roads, zone.districtId);
    const anchor = road ? boundsCenter(roadFootprint(road)) : { x: 0, z: 0 };
    const center = clampZoneCenter(anchor, zone.radius);
    centerByZone.set(zone.id, center);
    zones.push({ ...zone, x: snap(center.x), z: snap(center.z) });
  }

  const paths: PolicePatrolPath[] = defaultPolicePatrolPaths.map((patrol) => {
    const zone = zones.find((candidate) => candidate.id === patrol.zoneId);
    const center = centerByZone.get(patrol.zoneId) ?? { x: 0, z: 0 };
    const half = Math.min((zone?.radius ?? 4) * 0.45, 3);
    return {
      ...patrol,
      path: [
        { x: snap(center.x - half), z: snap(center.z - half) },
        { x: snap(center.x + half), z: snap(center.z - half) },
        { x: snap(center.x + half), z: snap(center.z + half) },
        { x: snap(center.x - half), z: snap(center.z + half) }
      ]
    };
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
// Parks — keep the authored park, drop buildings that would sit on it
// ---------------------------------------------------------------------------
function fitParks(blocks: CityBlock[]): WorldPark[] {
  return worldParks.map((park) => {
    // Prefer a generated block in the park's district big enough to host it.
    const candidates = blocks
      .filter((block) => block.districtId === park.districtId)
      .filter((block) => boundsArea(block.bounds) > 200)
      .sort((a, b) => boundsArea(b.bounds) - boundsArea(a.bounds));
    const block = candidates[0];
    if (!block) {
      return park;
    }
    const bounds = inflate(block.bounds, -SIDEWALK);
    const center = boundsCenter(bounds);
    return {
      ...park,
      bounds: {
        minX: snap(bounds.minX),
        maxX: snap(bounds.maxX),
        minZ: snap(bounds.minZ),
        maxZ: snap(bounds.maxZ)
      },
      pond: { x: snap(center.x), z: snap(center.z), radius: Math.min(park.pond.radius, 3.5) }
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

function buildBackdrops(roads: WorldRoad[], buildings: WorldBuilding[], rng: Rng): CityBackdropBuilding[] {
  const roadBlockers = roads.map((road) => inflate(roadFootprint(road), SIDEWALK + 0.5));
  const buildingBlockers = buildings.map((building) => inflate(footprint(building), 0.5));
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
      if (roadBlockers.some((blocker) => rectsOverlap(fp, blocker))) {
        continue;
      }
      if (buildingBlockers.some((blocker) => rectsOverlap(fp, blocker))) {
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
  const parks = fitParks(plan.blocks);

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
  const decorations = buildDecorations(plan.roads, sidewalks, rng.fork("decor"));
  const backdropBuildings = buildBackdrops(plan.roads, buildingsOffParks, rng.fork("backdrop"));

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
