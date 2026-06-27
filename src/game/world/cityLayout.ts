// Deterministic procedural city geometry.
//
// generateCityPlan(seed) builds a believable, navigable street + building layout
// from a seed string. It is pure (no DOM / Date / Math.random) so the same seed
// always produces the same CityPlan and the output can be property-tested.
//
// Pipeline:
//   1. Claim map        — partition world space into disjoint per-district regions
//                         (district bounds overlap, so we cannot grid them raw).
//   2. Roads            — a connected grid of arterials + local streets.
//   3. Blocks           — the buildable parcels between roads.
//   4. Buildings        — street-facing rows with setbacks, gaps and alleys.
//   5. Relaxation       — a safety net guaranteeing gaps / in-bounds placement.
//
// Sidewalks are intentionally NOT emitted here: they are derived from the roads
// (and buildings) by sidewalkFootprintsForRoads, so every consumer stays in sync.

import type { Bounds2, District, Vec2 } from "../core/types";
import {
  buildingFootprintExtents,
  districts as defaultDistricts,
  worldBounds as defaultWorldBounds,
  type BuildingFacing,
  type BuildingVisualStyle,
  type WorldBuilding,
  type WorldRoad
} from "../content/world";
import { WORLD_SCALE } from "./scale";
import { connectedRoadComponents } from "./roadGraph";
import { createRng, type Rng } from "./rng";
import {
  boundsArea,
  boundsCenter,
  boundsDepth,
  boundsWidth,
  inflate,
  partitionIntoRects,
  pointInRect,
  rectsOverlap,
  snap,
  snapBounds,
  sortedUnique
} from "./rectGrid";

export interface CityBlock {
  bounds: Bounds2;
  districtId: string;
}

export interface CityPlan {
  blocks: CityBlock[];
  buildings: WorldBuilding[];
  roads: WorldRoad[];
}

export interface CityPlanOptions {
  districts: Record<string, District>;
  worldBounds: Bounds2;
  /** Min/max spacing between arterial centerlines. */
  arterialSpacing: [number, number];
  /** A grid cell larger than this on an axis gets a local street splitting it. */
  targetBlockMax: number;
  /** Setback band between sidewalk and front wall. */
  setback: number;
  /** Clear corridor required between adjacent buildings. */
  minGap: number;
  /** Walkable gap down the middle of a back-to-back block. */
  alleyWidth: number;
  /** Probability a lot is left empty (small plaza/breathing room). */
  emptyLotChance: number;
}

const AVENUE_WIDTH = WORLD_SCALE.road.laneWidth * 2; // 6.2 — two-lane arterial
const LOCAL_WIDTH = WORLD_SCALE.road.minimumStreetWidth + 0.4; // 4.6 — local street
const EDGE_MARGIN = 8; // keep arterials off the very rim of the world
const MIN_ARTERIAL_GAP = 16; // closest two parallel arterials may sit (keeps blocks buildable)
const SIDEWALK = WORLD_SCALE.road.sidewalkWidth;
const MIN_BUILDABLE = 4; // a block thinner than this (after setback) gets no buildings
const MIN_ROW_DEPTH = 3.5;
const MIN_ALLEY = 2; // tightest navigable alley between back-to-back rows
const ROW_DEPTH: [number, number] = [5, 9];
const LOT_WIDTH: [number, number] = [4, 8];

const ALL_STYLES: BuildingVisualStyle[] = ["garage", "supplier", "laundromat", "gym", "arcade", "transit", "rival"];

// Deterministic filler signage so anonymous storefronts read as a real street
// instead of blank boxes. Identity buildings keep their authored sign.
const SIGN_WORDS = [
  "MARKET", "DINER", "WASH", "DEPOT", "LOFTS", "SUPPLY", "CLUB", "ARCADE", "PRINT",
  "GRILL", "PHARMACY", "GARAGE", "STUDIO", "OUTLET", "HARDWARE", "NOODLES", "CORNER",
  "RECORDS", "TOOLS", "STORAGE", "BODEGA", "LAUNDRY", "MOTEL", "PAWN", "TOWER", "LANES"
];

// Per-district style weighting (repeats bias the random pick) so each quarter
// reads with its own character. Filler only — identity buildings keep their
// authored style when the regenerator reattaches them.
const DISTRICT_STYLE_FLAVOR: Record<string, BuildingVisualStyle[]> = {
  starter_suburb: ["laundromat", "garage", "supplier", "transit", "gym", "arcade", "rival"],
  industrial_yards: ["garage", "supplier", "garage", "supplier", "transit", "gym"],
  downtown_loop: ["transit", "supplier", "gym", "arcade", "rival", "supplier"],
  neon_quarter: ["arcade", "rival", "arcade", "laundromat", "supplier", "transit"],
  campus_strip: ["transit", "laundromat", "gym", "arcade", "supplier", "rival"],
  old_town: ["rival", "laundromat", "supplier", "arcade", "transit", "gym"]
};

const DISTRICT_FLOORS: Record<string, [number, number]> = {
  starter_suburb: [1, 2],
  industrial_yards: [1, 3],
  downtown_loop: [2, 6],
  neon_quarter: [2, 5],
  campus_strip: [1, 4],
  old_town: [1, 4]
};

function defaultOptions(): Omit<CityPlanOptions, "districts" | "worldBounds"> {
  return {
    arterialSpacing: [38, 58],
    targetBlockMax: 30,
    setback: WORLD_SCALE.layout.placementSetback,
    minGap: WORLD_SCALE.layout.minBuildingGap,
    alleyWidth: WORLD_SCALE.layout.alleyWidth,
    emptyLotChance: 0.12
  };
}

function resolveOptions(options?: Partial<CityPlanOptions>): CityPlanOptions {
  return {
    districts: options?.districts ?? defaultDistricts,
    worldBounds: options?.worldBounds ?? defaultWorldBounds,
    ...defaultOptions(),
    ...options
  };
}

function roadFootprint(road: WorldRoad): Bounds2 {
  return snapBounds({
    minX: road.x - road.width / 2,
    maxX: road.x + road.width / 2,
    minZ: road.z - road.depth / 2,
    maxZ: road.z + road.depth / 2
  });
}

// Districts sorted so the smallest/most-protected claim contested cells first.
function districtsByPriority(districts: Record<string, District>): District[] {
  return Object.values(districts).sort((a, b) => {
    const areaA = boundsArea(a.bounds);
    const areaB = boundsArea(b.bounds);
    if (areaA !== areaB) {
      return areaA - areaB;
    }
    return a.id < b.id ? -1 : 1;
  });
}

function districtOwnerAt(point: Vec2, ordered: District[]): string | null {
  for (const district of ordered) {
    if (pointInRect(point, district.bounds)) {
      return district.id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Roads — connected arterial grid + local streets.
//
// District bounds overlap, so rather than gridding each district's raw
// rectangle (which would collide), every point is tagged to exactly one
// district by priority (districtOwnerAt) and the arterials span the whole
// world — guaranteeing a single connected network.
// ---------------------------------------------------------------------------
function arterialPositions(min: number, max: number, spacing: [number, number], rng: Rng): number[] {
  const start = min + EDGE_MARGIN;
  const end = max - EDGE_MARGIN;
  const positions: number[] = [start];
  let cursor = start;
  while (cursor < end - spacing[0]) {
    cursor += rng.range(spacing[0], spacing[1]);
    if (cursor < end - WORLD_SCALE.road.minimumStreetWidth) {
      positions.push(snap(cursor));
    }
  }
  positions.push(end);
  return positions;
}

// Merge global arterial positions with district-boundary positions, keeping the
// district edges (which guarantee every district is road-bounded and therefore
// gets its own blocks) and only adding global arterials where they are not too
// close to an already-kept line.
function mergeArterialLines(globals: number[], edges: number[], min: number, max: number): number[] {
  const lo = min + EDGE_MARGIN;
  const hi = max - EDGE_MARGIN;
  const within = (value: number) => value >= lo - 1e-6 && value <= hi + 1e-6;
  const kept: number[] = [snap(lo), snap(hi)];

  const tryAdd = (value: number) => {
    const v = snap(value);
    if (!within(v)) {
      return;
    }
    if (kept.every((existing) => Math.abs(existing - v) >= MIN_ARTERIAL_GAP)) {
      kept.push(v);
    }
  };

  // District edges first (authoritative), then global arterials in the gaps.
  for (const edge of edges) {
    tryAdd(edge);
  }
  for (const global of globals) {
    tryAdd(global);
  }

  return Array.from(new Set(kept)).sort((a, b) => a - b);
}

// Split an arterial's span into per-district segments so each segment carries the
// correct district curb/lane colour. A full-span arterial tagged to a single
// district would clash with the local roads of every other district it crosses.
// Adjacent segments share an edge, so the arterial stays one connected run.
function arterialSegments(
  spanMin: number,
  spanMax: number,
  districtEdges: number[],
  districtAtPos: (pos: number) => string
): Array<{ a: number; b: number; districtId: string }> {
  const inner = districtEdges.filter((edge) => edge > spanMin + 0.5 && edge < spanMax - 0.5);
  const bounds = sortedUnique([spanMin, ...inner, spanMax]);
  const segments: Array<{ a: number; b: number; districtId: string }> = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const a = bounds[i];
    const b = bounds[i + 1];
    const districtId = districtAtPos((a + b) / 2);
    const last = segments[segments.length - 1];
    if (last && last.districtId === districtId) {
      last.b = b; // merge consecutive same-district stretches
    } else {
      segments.push({ a, b, districtId });
    }
  }
  // Fold away any sub-minimum sliver so no road segment is too narrow.
  const minLen = WORLD_SCALE.road.minimumStreetWidth;
  for (let i = segments.length - 1; i > 0; i -= 1) {
    if (segments[i].b - segments[i].a < minLen) {
      segments[i - 1].b = segments[i].b;
      segments.splice(i, 1);
    }
  }
  if (segments.length > 1 && segments[0].b - segments[0].a < minLen) {
    segments[1].a = segments[0].a;
    segments.splice(0, 1);
  }
  return segments;
}

function generateRoads(options: CityPlanOptions, roadsRng: Rng): WorldRoad[] {
  const rng = roadsRng.fork("arterials");
  const { worldBounds } = options;
  const spanMinX = worldBounds.minX + EDGE_MARGIN;
  const spanMaxX = worldBounds.maxX - EDGE_MARGIN;
  const spanMinZ = worldBounds.minZ + EDGE_MARGIN;
  const spanMaxZ = worldBounds.maxZ - EDGE_MARGIN;

  // A world-spanning arterial grid. Small districts deliberately get only a road
  // or two so the regenerator's fallback has room to place their named lots; the
  // grid's job is the connected skeleton and the large districts' blocks.
  const xs = mergeArterialLines(
    arterialPositions(worldBounds.minX, worldBounds.maxX, options.arterialSpacing, rng.fork("x")),
    [],
    worldBounds.minX,
    worldBounds.maxX
  );
  const zs = mergeArterialLines(
    arterialPositions(worldBounds.minZ, worldBounds.maxZ, options.arterialSpacing, rng.fork("z")),
    [],
    worldBounds.minZ,
    worldBounds.maxZ
  );

  const roads: WorldRoad[] = [];
  const ordered = districtsByPriority(options.districts);

  const districtForPoint = (point: Vec2): string =>
    districtOwnerAt(point, ordered) ?? ordered[ordered.length - 1].id;

  const districtXEdges = Object.values(options.districts).flatMap((d) => [d.bounds.minX, d.bounds.maxX]);
  const districtZEdges = Object.values(options.districts).flatMap((d) => [d.bounds.minZ, d.bounds.maxZ]);

  // Vertical arterials (constant x), split into per-district segments.
  xs.forEach((x, index) => {
    arterialSegments(spanMinZ, spanMaxZ, districtZEdges, (z) => districtForPoint({ x, z })).forEach((seg, si) => {
      roads.push({
        id: `arterial_v_${index}_${si}`,
        districtId: seg.districtId,
        x: snap(x),
        z: snap((seg.a + seg.b) / 2),
        width: AVENUE_WIDTH,
        depth: snap(seg.b - seg.a)
      });
    });
  });

  // Horizontal arterials (constant z), split into per-district segments.
  zs.forEach((z, index) => {
    arterialSegments(spanMinX, spanMaxX, districtXEdges, (xx) => districtForPoint({ x: xx, z })).forEach((seg, si) => {
      roads.push({
        id: `arterial_h_${index}_${si}`,
        districtId: seg.districtId,
        x: snap((seg.a + seg.b) / 2),
        z: snap(z),
        width: snap(seg.b - seg.a),
        depth: AVENUE_WIDTH
      });
    });
  });

  // Local streets split large grid cells, connecting both bounding arterials.
  const localRng = roadsRng.fork("local");
  let localIndex = 0;
  for (let xi = 0; xi < xs.length - 1; xi += 1) {
    for (let zi = 0; zi < zs.length - 1; zi += 1) {
      const cell: Bounds2 = { minX: xs[xi], maxX: xs[xi + 1], minZ: zs[zi], maxZ: zs[zi + 1] };
      const center = boundsCenter(cell);
      const owner = districtOwnerAt(center, ordered);
      if (!owner) {
        continue;
      }
      const cellRng = localRng.fork(`${xi}_${zi}`);
      const width = boundsWidth(cell);
      const depth = boundsDepth(cell);
      if (width >= depth && width > options.targetBlockMax) {
        const x = snap((cell.minX + cell.maxX) / 2);
        roads.push({
          id: `local_${localIndex}`,
          districtId: owner,
          x,
          z: snap((cell.minZ + cell.maxZ) / 2),
          width: LOCAL_WIDTH,
          depth: snap(cell.maxZ - cell.minZ)
        });
        localIndex += 1;
      } else if (depth > width && depth > options.targetBlockMax) {
        const z = snap((cell.minZ + cell.maxZ) / 2);
        roads.push({
          id: `local_${localIndex}`,
          districtId: owner,
          x: snap((cell.minX + cell.maxX) / 2),
          z,
          width: snap(cell.maxX - cell.minX),
          depth: LOCAL_WIDTH
        });
        localIndex += 1;
      } else if (width > options.targetBlockMax && depth > options.targetBlockMax) {
        // Large square cell: split on the axis chosen by the cell rng.
        if (cellRng.chance(0.5)) {
          roads.push({
            id: `local_${localIndex}`,
            districtId: owner,
            x: snap((cell.minX + cell.maxX) / 2),
            z: snap((cell.minZ + cell.maxZ) / 2),
            width: LOCAL_WIDTH,
            depth: snap(cell.maxZ - cell.minZ)
          });
        } else {
          roads.push({
            id: `local_${localIndex}`,
            districtId: owner,
            x: snap((cell.minX + cell.maxX) / 2),
            z: snap((cell.minZ + cell.maxZ) / 2),
            width: snap(cell.maxX - cell.minX),
            depth: LOCAL_WIDTH
          });
        }
        localIndex += 1;
      }
    }
  }

  return roads;
}

// ---------------------------------------------------------------------------
// 3. Blocks — buildable parcels between roads
// ---------------------------------------------------------------------------
function enumerateBlocks(options: CityPlanOptions, roads: WorldRoad[], ordered: District[]): CityBlock[] {
  const footprints = roads.map(roadFootprint);
  const xLines: number[] = [];
  const zLines: number[] = [];
  for (const fp of footprints) {
    xLines.push(fp.minX, fp.maxX);
    zLines.push(fp.minZ, fp.maxZ);
  }
  // District boundaries are gridlines too (not roads): without them a cell can
  // span several districts and be mis-labelled by its centre, which would erase
  // small districts like the starter suburb from the block set.
  for (const district of ordered) {
    xLines.push(district.bounds.minX, district.bounds.maxX);
    zLines.push(district.bounds.minZ, district.bounds.maxZ);
  }

  const onRoad = (point: Vec2): boolean => footprints.some((fp) => pointInRect(point, fp));

  const rects = partitionIntoRects(options.worldBounds, xLines, zLines, (center) => {
    if (onRoad(center)) {
      return null;
    }
    return districtOwnerAt(center, ordered);
  });

  return rects.map((rect) => ({ districtId: rect.label, bounds: rect.bounds }));
}

// ---------------------------------------------------------------------------
// 4. Buildings — street-facing rows
// ---------------------------------------------------------------------------
function pickStyle(rng: Rng, districtId: string): BuildingVisualStyle {
  return rng.pick(DISTRICT_STYLE_FLAVOR[districtId] ?? ALL_STYLES);
}

function pickHeight(rng: Rng, districtId: string): number {
  const [minFloors, maxFloors] = DISTRICT_FLOORS[districtId] ?? [1, 3];
  const floors = rng.int(minFloors, maxFloors + 1);
  const base = WORLD_SCALE.building.minimumStorefrontHeight;
  return snap(base + (floors - 1) * WORLD_SCALE.building.floorHeight + rng.range(0, 0.6));
}

interface RowSpec {
  alongStart: number;
  alongEnd: number;
  depthCenter: number;
  rowDepth: number;
  facing: BuildingFacing;
  axis: "x" | "z"; // axis the row runs along
}

function placeRow(spec: RowSpec, rng: Rng, options: CityPlanOptions, districtId: string, idPrefix: string, startIndex: number): WorldBuilding[] {
  const buildings: WorldBuilding[] = [];
  let cursor = spec.alongStart;
  let index = startIndex;
  while (cursor < spec.alongEnd - LOT_WIDTH[0]) {
    const remaining = spec.alongEnd - cursor;
    const lotWidth = Math.min(rng.range(LOT_WIDTH[0], LOT_WIDTH[1]), remaining);
    if (lotWidth < LOT_WIDTH[0]) {
      break;
    }
    const alongCenter = snap(cursor + lotWidth / 2);
    if (!rng.chance(options.emptyLotChance)) {
      buildings.push({
        id: `${idPrefix}_${index}`,
        districtId,
        facing: spec.facing,
        style: pickStyle(rng, districtId),
        signText: rng.pick(SIGN_WORDS),
        height: pickHeight(rng, districtId),
        width: snap(lotWidth),
        depth: snap(spec.rowDepth),
        x: spec.axis === "x" ? alongCenter : spec.depthCenter,
        z: spec.axis === "x" ? spec.depthCenter : alongCenter
      });
      index += 1;
    }
    cursor += lotWidth + options.minGap;
  }
  return buildings;
}

// Is there a road in the thin strip just outside one edge of the block?
function edgeHasRoad(block: CityBlock, side: BuildingFacing, roadFootprints: Bounds2[]): boolean {
  const b = block.bounds;
  const probe: Bounds2 =
    side === "north"
      ? { minX: b.minX, maxX: b.maxX, minZ: b.minZ - 2.5, maxZ: b.minZ - 0.05 }
      : side === "south"
        ? { minX: b.minX, maxX: b.maxX, minZ: b.maxZ + 0.05, maxZ: b.maxZ + 2.5 }
        : side === "west"
          ? { minX: b.minX - 2.5, maxX: b.minX - 0.05, minZ: b.minZ, maxZ: b.maxZ }
          : { minX: b.maxX + 0.05, maxX: b.maxX + 2.5, minZ: b.minZ, maxZ: b.maxZ };
  return roadFootprints.some((fp) => rectsOverlap(probe, fp));
}

function placeBuildingsInBlock(block: CityBlock, rng: Rng, options: CityPlanOptions, idCounter: { value: number }, roadFootprints: Bounds2[]): WorldBuilding[] {
  const buildable = snapBounds(inflate(block.bounds, -(SIDEWALK + options.setback)));
  const width = boundsWidth(buildable);
  const depth = boundsDepth(buildable);
  if (Math.min(width, depth) < MIN_BUILDABLE) {
    return [];
  }

  const buildings: WorldBuilding[] = [];
  const idPrefix = `${block.districtId}_lot`;

  // Only edges that actually border a road are frontages — buildings line up
  // against those, facing the street. Edges that are district/world boundaries
  // (no road) become the block's back, so no storefront is ever stranded far
  // from its street.
  const hasN = edgeHasRoad(block, "north", roadFootprints);
  const hasS = edgeHasRoad(block, "south", roadFootprints);
  const hasW = edgeHasRoad(block, "west", roadFootprints);
  const hasE = edgeHasRoad(block, "east", roadFootprints);
  const xFront = [hasN ? "north" : null, hasS ? "south" : null].filter(Boolean) as BuildingFacing[];
  const zFront = [hasW ? "west" : null, hasE ? "east" : null].filter(Boolean) as BuildingFacing[];
  if (xFront.length === 0 && zFront.length === 0) {
    return []; // landlocked block — no street access, no buildings
  }

  const runAlongX = xFront.length !== zFront.length ? xFront.length > zFront.length : width >= depth;
  const frontages = runAlongX ? xFront : zFront;
  const spanDepth = runAlongX ? depth : width;

  const makeRow = (depthCenter: number, rowDepth: number, facing: BuildingFacing) => {
    const spec: RowSpec = {
      alongStart: runAlongX ? buildable.minX : buildable.minZ,
      alongEnd: runAlongX ? buildable.maxX : buildable.maxZ,
      depthCenter,
      rowDepth,
      facing,
      axis: runAlongX ? "x" : "z"
    };
    const placed = placeRow(spec, rng, options, block.districtId, idPrefix, idCounter.value);
    idCounter.value += placed.length;
    buildings.push(...placed);
  };

  const min = runAlongX ? buildable.minZ : buildable.minX;
  const max = runAlongX ? buildable.maxZ : buildable.maxX;
  const nearFacing: BuildingFacing = runAlongX ? "north" : "west";
  const farFacing: BuildingFacing = runAlongX ? "south" : "east";
  const twoRows = frontages.length >= 2 && spanDepth >= 2 * MIN_ROW_DEPTH + MIN_ALLEY;

  if (twoRows) {
    const rowDepth = Math.max(MIN_ROW_DEPTH, Math.min(rng.range(ROW_DEPTH[0], ROW_DEPTH[1]), (spanDepth - MIN_ALLEY) / 2));
    makeRow(snap(min + rowDepth / 2), rowDepth, nearFacing);
    makeRow(snap(max - rowDepth / 2), rowDepth, farFacing);
  } else {
    // One row hugging an edge that has a road.
    const rowDepth = Math.min(rng.range(ROW_DEPTH[0], ROW_DEPTH[1]), spanDepth);
    const hugNear = frontages.includes(nearFacing);
    makeRow(hugNear ? snap(min + rowDepth / 2) : snap(max - rowDepth / 2), rowDepth, hugNear ? nearFacing : farFacing);
  }

  return relaxBuildings(buildings, { gap: options.minGap, bounds: buildable, iterations: 8 });
}

// ---------------------------------------------------------------------------
// 5. Relaxation — guarantee gaps + in-bounds placement
// ---------------------------------------------------------------------------
export interface RelaxOptions {
  gap: number;
  bounds?: Bounds2;
  iterations?: number;
}

function footprintOf(building: WorldBuilding): Bounds2 {
  const extents = buildingFootprintExtents(building);
  return {
    minX: building.x - extents.x / 2,
    maxX: building.x + extents.x / 2,
    minZ: building.z - extents.z / 2,
    maxZ: building.z + extents.z / 2
  };
}

function clampIntoBounds(building: WorldBuilding, bounds: Bounds2): void {
  const extents = buildingFootprintExtents(building);
  const halfX = extents.x / 2;
  const halfZ = extents.z / 2;
  if (bounds.maxX - bounds.minX >= extents.x) {
    building.x = snap(Math.min(Math.max(building.x, bounds.minX + halfX), bounds.maxX - halfX));
  }
  if (bounds.maxZ - bounds.minZ >= extents.z) {
    building.z = snap(Math.min(Math.max(building.z, bounds.minZ + halfZ), bounds.maxZ - halfZ));
  }
}

export function relaxBuildings(input: WorldBuilding[], options: RelaxOptions): WorldBuilding[] {
  const gap = options.gap;
  const iterations = options.iterations ?? 12;
  const buildings = input.map((building) => ({ ...building }));

  for (let iter = 0; iter < iterations; iter += 1) {
    let moved = false;
    for (let i = 0; i < buildings.length; i += 1) {
      for (let j = i + 1; j < buildings.length; j += 1) {
        const a = inflate(footprintOf(buildings[i]), gap / 2);
        const b = inflate(footprintOf(buildings[j]), gap / 2);
        if (!rectsOverlap(a, b)) {
          continue;
        }
        const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
        if (overlapX <= overlapZ) {
          const dir = buildings[i].x <= buildings[j].x ? 1 : -1;
          buildings[i].x = snap(buildings[i].x - (dir * overlapX) / 2);
          buildings[j].x = snap(buildings[j].x + (dir * overlapX) / 2);
        } else {
          const dir = buildings[i].z <= buildings[j].z ? 1 : -1;
          buildings[i].z = snap(buildings[i].z - (dir * overlapZ) / 2);
          buildings[j].z = snap(buildings[j].z + (dir * overlapZ) / 2);
        }
        moved = true;
      }
    }
    if (options.bounds) {
      for (const building of buildings) {
        clampIntoBounds(building, options.bounds);
      }
    }
    if (!moved) {
      break;
    }
  }

  // Final pass: drop any building still overlapping another (a missing filler
  // building beats an invalid map). Identity buildings are never produced here.
  const kept: WorldBuilding[] = [];
  for (const building of buildings) {
    const footprint = inflate(footprintOf(building), gap / 2);
    const collides = kept.some((other) => rectsOverlap(footprint, inflate(footprintOf(other), gap / 2)));
    if (!collides) {
      kept.push(building);
    }
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
export function generateCityPlan(seed: string, optionsInput?: Partial<CityPlanOptions>): CityPlan {
  const options = resolveOptions(optionsInput);
  const rootRng = createRng(seed);
  const ordered = districtsByPriority(options.districts);

  const roads = generateRoads(options, rootRng.fork("roads"));

  const components = connectedRoadComponents(roads);
  if (components.length > 1) {
    throw new Error(`city generator produced ${components.length} disconnected road components for seed "${seed}"`);
  }

  const blocks = enumerateBlocks(options, roads, ordered);
  const roadFootprints = roads.map(roadFootprint);

  const buildingsRng = rootRng.fork("buildings");
  const idCounter = { value: 0 };
  const buildings: WorldBuilding[] = [];
  // Deterministic block order (z-major, then x) — partitionIntoRects already
  // scans this way, but sort explicitly to be safe against future changes.
  const orderedBlocks = [...blocks].sort((a, b) => {
    if (a.bounds.minZ !== b.bounds.minZ) {
      return a.bounds.minZ - b.bounds.minZ;
    }
    return a.bounds.minX - b.bounds.minX;
  });
  orderedBlocks.forEach((block, index) => {
    const blockRng = buildingsRng.fork(`${index}`);
    buildings.push(...placeBuildingsInBlock(block, blockRng, options, idCounter, roadFootprints));
  });

  return { blocks, buildings, roads };
}
