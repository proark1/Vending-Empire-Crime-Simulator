import type { Bounds2, Vec2 } from "../core/types";
import {
  defaultWorldMapLayout,
  districts,
  locations,
  machinePlacementAnchors,
  worldBounds,
  type CityBackdropBuilding,
  type PatrolZone,
  type PolicePatrolPath,
  type TrafficLoop,
  type WorldBuilding,
  type WorldDecoration,
  type WorldInterior,
  type WorldMapLayout,
  type WorldRoad
} from "../content/world";
import { disconnectedRoadIds, pathOnRoads } from "./roadGraph";
import { WORLD_SCALE } from "./scale";
import { sidewalkFootprintBounds, sidewalkFootprintsForRoads } from "./sidewalks";

const MAP_LAYOUT_KEY = "vendetta-vending.map-layout.v1";
// Bump when authored world content changes structurally (roads, buildings, parks)
// so stale persisted layouts are discarded in favour of the fresh default.
const MAP_LAYOUT_VERSION = 4;

interface StoredWorldMapLayout {
  layout: WorldMapLayout;
  updatedAt: string;
  version: number;
}

export interface MapValidationIssue {
  layer?: keyof WorldMapLayout;
  message: string;
  severity: "error" | "warning";
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function cloneLayout(layout: WorldMapLayout): WorldMapLayout {
  return JSON.parse(JSON.stringify(layout)) as WorldMapLayout;
}

function mergeArray<T extends object>(candidate: unknown, fallback: T[]): T[] {
  if (!Array.isArray(candidate)) {
    return fallback.map((item) => ({ ...item }));
  }
  const merged = candidate.map((item, index) => ({
    ...(fallback[index] ?? {}),
    ...(item as Partial<T>)
  }) as T);
  // Additively keep newly-authored default items (e.g. parks, buildings filling
  // empty blocks) that a previously-saved layout predates.
  if (fallback.length > candidate.length) {
    for (let index = candidate.length; index < fallback.length; index += 1) {
      merged.push({ ...fallback[index] });
    }
  }
  return merged;
}

export function normalizeLayout(candidate: unknown): WorldMapLayout {
  const fallback = cloneLayout(defaultWorldMapLayout);
  const input = typeof candidate === "object" && candidate !== null ? candidate as Partial<WorldMapLayout> : {};

  return {
    backdropBuildings: mergeArray(input.backdropBuildings, fallback.backdropBuildings),
    buildings: mergeArray(input.buildings, fallback.buildings),
    decorations: mergeArray(input.decorations, fallback.decorations),
    interiors: mergeArray(input.interiors, fallback.interiors),
    parks: mergeArray(input.parks, fallback.parks),
    patrolZones: mergeArray(input.patrolZones, fallback.patrolZones),
    policePatrolPaths: mergeArray(input.policePatrolPaths, fallback.policePatrolPaths),
    roads: mergeArray(input.roads, fallback.roads),
    trafficLoops: mergeArray(input.trafficLoops, fallback.trafficLoops)
  };
}

export function createDefaultWorldMapLayout(): WorldMapLayout {
  return cloneLayout(defaultWorldMapLayout);
}

export function loadWorldMapLayout(): WorldMapLayout {
  if (!hasBrowserStorage()) {
    return createDefaultWorldMapLayout();
  }

  const raw = window.localStorage.getItem(MAP_LAYOUT_KEY);
  if (!raw) {
    return createDefaultWorldMapLayout();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredWorldMapLayout> | WorldMapLayout;
    if (typeof parsed === "object" && parsed !== null && "layout" in parsed && parsed.version === MAP_LAYOUT_VERSION) {
      return normalizeLayout(parsed.layout);
    }

    return normalizeLayout(parsed);
  } catch {
    return createDefaultWorldMapLayout();
  }
}

export function saveWorldMapLayout(layout: WorldMapLayout): void {
  if (!hasBrowserStorage()) {
    return;
  }

  const stored: StoredWorldMapLayout = {
    layout: normalizeLayout(layout),
    updatedAt: new Date().toISOString(),
    version: MAP_LAYOUT_VERSION
  };
  window.localStorage.setItem(MAP_LAYOUT_KEY, JSON.stringify(stored));
}

export function clearWorldMapLayout(): void {
  if (!hasBrowserStorage()) {
    return;
  }

  window.localStorage.removeItem(MAP_LAYOUT_KEY);
}

export function roadFootprint(road: WorldRoad): Bounds2 {
  return {
    minX: road.x - road.width / 2,
    maxX: road.x + road.width / 2,
    minZ: road.z - road.depth / 2,
    maxZ: road.z + road.depth / 2
  };
}

export function buildingFootprint(building: Pick<WorldBuilding, "depth" | "width" | "x" | "z">): Bounds2 {
  return {
    minX: building.x - building.width / 2,
    maxX: building.x + building.width / 2,
    minZ: building.z - building.depth / 2,
    maxZ: building.z + building.depth / 2
  };
}

export function rectsIntersect(a: Bounds2, b: Bounds2, clearance = 0.03): boolean {
  return a.minX < b.maxX - clearance
    && a.maxX > b.minX + clearance
    && a.minZ < b.maxZ - clearance
    && a.maxZ > b.minZ + clearance;
}

function objectLabel(building: WorldBuilding, index: number): string {
  return building.signText ? `${building.signText} (${index + 1})` : `Building ${index + 1}`;
}

function trafficLabel(loop: TrafficLoop, index: number): string {
  return loop.id || `Traffic loop ${index + 1}`;
}

function inWorld(point: Vec2, margin = 0): boolean {
  return point.x >= defaultWorldBounds.minX - margin
    && point.x <= defaultWorldBounds.maxX + margin
    && point.z >= defaultWorldBounds.minZ - margin
    && point.z <= defaultWorldBounds.maxZ + margin;
}

const defaultWorldBounds = worldBounds;

function boundsWithinWorld(bounds: Bounds2, margin = 0): boolean {
  return bounds.minX >= defaultWorldBounds.minX - margin
    && bounds.maxX <= defaultWorldBounds.maxX + margin
    && bounds.minZ >= defaultWorldBounds.minZ - margin
    && bounds.maxZ <= defaultWorldBounds.maxZ + margin;
}

function pointInsideBounds(point: Vec2, bounds: Bounds2, clearance = 0): boolean {
  return point.x > bounds.minX - clearance
    && point.x < bounds.maxX + clearance
    && point.z > bounds.minZ - clearance
    && point.z < bounds.maxZ + clearance;
}

function pathIntersectsBuilding(path: Vec2[], buildingBounds: Bounds2[]): boolean {
  return path.some((point, index) => {
    const next = path[(index + 1) % path.length];
    const samples = Math.max(1, Math.ceil(Math.hypot(next.x - point.x, next.z - point.z) / 0.6));
    for (let sample = 0; sample <= samples; sample += 1) {
      const t = sample / samples;
      const current = {
        x: point.x + (next.x - point.x) * t,
        z: point.z + (next.z - point.z) * t
      };
      if (buildingBounds.some((bounds) => pointInsideBounds(current, bounds, 0.05))) {
        return true;
      }
    }
    return false;
  });
}

function pushIssue(issues: MapValidationIssue[], severity: MapValidationIssue["severity"], layer: keyof WorldMapLayout | undefined, message: string): void {
  issues.push({ layer, message, severity });
}

function validateUniqueIds<T extends { id: string }>(issues: MapValidationIssue[], layer: keyof WorldMapLayout, items: T[], label: string): void {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    if (!item.id) {
      pushIssue(issues, "error", layer, `${label} ${index + 1} is missing an id.`);
      return;
    }

    if (ids.has(item.id)) {
      pushIssue(issues, "error", layer, `${label} id "${item.id}" is duplicated.`);
    }
    ids.add(item.id);
  });
}

function validateDistrict(issues: MapValidationIssue[], layer: keyof WorldMapLayout, districtId: string, label: string): void {
  if (!districts[districtId]) {
    pushIssue(issues, "warning", layer, `${label} references unknown district "${districtId}".`);
  }
}

function validatePoint(issues: MapValidationIssue[], layer: keyof WorldMapLayout, point: Vec2, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    pushIssue(issues, "error", layer, `${label} has invalid coordinates.`);
    return;
  }

  if (!inWorld(point)) {
    pushIssue(issues, "error", layer, `${label} is outside the playable world bounds.`);
  }
}

function validateRect(issues: MapValidationIssue[], layer: keyof WorldMapLayout, bounds: Bounds2, label: string): void {
  if (![bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)) {
    pushIssue(issues, "error", layer, `${label} has invalid bounds.`);
    return;
  }

  if (!boundsWithinWorld(bounds)) {
    pushIssue(issues, "error", layer, `${label} extends outside the playable world bounds.`);
  }
}

export function validateWorldMapLayout(layout: WorldMapLayout): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  const buildingBounds = layout.buildings.map(buildingFootprint);

  validateUniqueIds(issues, "roads", layout.roads, "Road");
  validateUniqueIds(issues, "decorations", layout.decorations, "Decoration");
  validateUniqueIds(issues, "patrolZones", layout.patrolZones, "Patrol zone");
  validateUniqueIds(issues, "policePatrolPaths", layout.policePatrolPaths, "Police patrol path");
  validateUniqueIds(issues, "trafficLoops", layout.trafficLoops, "Traffic loop");
  validateUniqueIds(issues, "interiors", layout.interiors, "Interior");

  layout.roads.forEach((road, roadIndex) => {
    const label = road.id || `Road ${roadIndex + 1}`;
    validateDistrict(issues, "roads", road.districtId, label);

    if (road.width <= 0 || road.depth <= 0) {
      pushIssue(issues, "error", "roads", `${label} has an invalid size.`);
    }

    if (Math.min(road.width, road.depth) < WORLD_SCALE.road.minimumStreetWidth) {
      pushIssue(issues, "warning", "roads", `${label} is narrower than the human-scale street minimum.`);
    }

    validateRect(issues, "roads", roadFootprint(road), label);
  });

  const disconnectedRoads = disconnectedRoadIds(layout.roads);
  if (disconnectedRoads.length > 0) {
    pushIssue(
      issues,
      "error",
      "roads",
      `Road network has disconnected streets: ${disconnectedRoads.slice(0, 8).join(", ")}${disconnectedRoads.length > 8 ? ", ..." : ""}.`
    );
  }

  layout.buildings.forEach((building, buildingIndex) => {
    const label = objectLabel(building, buildingIndex);
    validateDistrict(issues, "buildings", building.districtId, label);

    if (building.width <= 0 || building.depth <= 0 || building.height <= 0) {
      pushIssue(issues, "error", "buildings", `${label} has an invalid size.`);
    }

    if (building.height < WORLD_SCALE.building.minimumStorefrontHeight) {
      pushIssue(issues, "error", "buildings", `${label} is too short for human-scale doors and storefront windows.`);
    }

    const buildingBounds = buildingFootprint(building);
    validateRect(issues, "buildings", buildingBounds, label);
    if (building.locationId && !locations[building.locationId]) {
      pushIssue(issues, "warning", "buildings", `${label} references unknown location "${building.locationId}".`);
    }

    for (const road of layout.roads) {
      if (rectsIntersect(buildingBounds, roadFootprint(road))) {
        pushIssue(issues, "error", "buildings", `${label} overlaps ${road.id}. Move either object so streets stay clear of building footprints.`);
      }
    }
  });

  sidewalkFootprintsForRoads(layout.roads, layout.buildings).forEach((sidewalk, sidewalkIndex) => {
    const sidewalkBounds = sidewalkFootprintBounds(sidewalk);
    validateRect(issues, "roads", sidewalkBounds, `${sidewalk.sourceRoadId} sidewalk ${sidewalkIndex + 1}`);

    for (const road of layout.roads) {
      if (rectsIntersect(sidewalkBounds, roadFootprint(road))) {
        pushIssue(issues, "error", "roads", `${sidewalk.sourceRoadId} sidewalk crosses ${road.id}.`);
      }
    }

    if (buildingBounds.some((bounds) => rectsIntersect(sidewalkBounds, bounds))) {
      pushIssue(issues, "error", "roads", `${sidewalk.sourceRoadId} sidewalk overlaps a building footprint.`);
    }
  });

  layout.backdropBuildings.forEach((building: CityBackdropBuilding, index) => {
    const label = `Backdrop ${index + 1}`;
    validateDistrict(issues, "backdropBuildings", building.districtId, label);
    if (building.width <= 0 || building.depth <= 0 || building.height <= 0) {
      pushIssue(issues, "error", "backdropBuildings", `${label} has an invalid size.`);
    }
    validateRect(issues, "backdropBuildings", buildingFootprint(building), label);
  });

  layout.decorations.forEach((decoration: WorldDecoration, index) => {
    const label = decoration.id || `Decoration ${index + 1}`;
    validateDistrict(issues, "decorations", decoration.districtId, label);
    validatePoint(issues, "decorations", decoration, label);
    if (decoration.scale <= 0) {
      pushIssue(issues, "error", "decorations", `${label} has an invalid scale.`);
    }
    if (!["billboard", "bollard", "dumpster", "planter", "streetlight", "utility_box"].includes(decoration.kind)) {
      pushIssue(issues, "error", "decorations", `${label} has unknown prop kind "${decoration.kind}".`);
    }
    if (buildingBounds.some((bounds) => pointInsideBounds(decoration, bounds, 0.08))) {
      pushIssue(issues, "warning", "decorations", `${label} is inside a building footprint.`);
    }
  });

  layout.patrolZones.forEach((zone: PatrolZone, index) => {
    const label = zone.label || zone.id || `Patrol zone ${index + 1}`;
    validateDistrict(issues, "patrolZones", zone.districtId, label);
    validatePoint(issues, "patrolZones", zone, label);
    if (zone.radius <= 0) {
      pushIssue(issues, "error", "patrolZones", `${label} has an invalid radius.`);
    }
    if (!boundsWithinWorld({ minX: zone.x - zone.radius, maxX: zone.x + zone.radius, minZ: zone.z - zone.radius, maxZ: zone.z + zone.radius }, 0.2)) {
      pushIssue(issues, "warning", "patrolZones", `${label} extends beyond the playable world bounds.`);
    }
  });

  layout.interiors.forEach((interior: WorldInterior, index) => {
    const label = interior.label || interior.id || `Interior ${index + 1}`;
    validateDistrict(issues, "interiors", interior.districtId, label);
    validatePoint(issues, "interiors", interior, label);
    if (interior.width <= 0 || interior.depth <= 0) {
      pushIssue(issues, "error", "interiors", `${label} has an invalid size.`);
    }
    if (!locations[interior.locationId]) {
      pushIssue(issues, "error", "interiors", `${label} references unknown location "${interior.locationId}".`);
    }
    if (!layout.buildings.some((building) => building.locationId === interior.locationId)) {
      pushIssue(issues, "warning", "interiors", `${label} has no matching location building in the current layout.`);
    }
  });

  const installableLocationIds = Object.values(locations)
    .filter((location) => location.kind !== "garage" && location.kind !== "supplier")
    .map((location) => location.id);
  for (const locationId of installableLocationIds) {
    const anchor = machinePlacementAnchors[locationId];
    if (!anchor) {
      pushIssue(issues, "error", undefined, `${locations[locationId].name} has no machine placement anchor.`);
      continue;
    }

    const center = { x: anchor.x, z: anchor.z };
    const front = {
      x: anchor.x - Math.sin(anchor.rotationY) * 0.9,
      z: anchor.z - Math.cos(anchor.rotationY) * 0.9
    };
    validatePoint(issues, "buildings", center, `${locations[locationId].name} machine anchor`);
    if (buildingBounds.some((bounds) => pointInsideBounds(center, bounds))) {
      pushIssue(issues, "error", "buildings", `${locations[locationId].name} machine anchor is inside a building after the map edit.`);
    }
    if (buildingBounds.some((bounds) => pointInsideBounds(front, bounds))) {
      pushIssue(issues, "error", "buildings", `${locations[locationId].name} machine front faces into a building after the map edit.`);
    }
  }

  const playerSpawn = { x: -9, z: 5.9 };
  if (buildingBounds.some((bounds) => pointInsideBounds(playerSpawn, bounds, 0.18))) {
    pushIssue(issues, "error", "buildings", "Player street-view spawn is blocked by a building.");
  }

  layout.trafficLoops.forEach((loop, loopIndex) => {
    const label = trafficLabel(loop, loopIndex);
    validateDistrict(issues, "trafficLoops", loop.districtId, label);
    if (loop.speed <= 0 || loop.path.length < 2) {
      pushIssue(issues, "error", "trafficLoops", `${label} has an invalid speed or too few path points.`);
    }
    loop.path.forEach((point, pointIndex) => validatePoint(issues, "trafficLoops", point, `${label} point ${pointIndex + 1}`));
    if (!pathOnRoads(loop.path, layout.roads)) {
      pushIssue(issues, loop.kind === "police" ? "error" : "warning", "trafficLoops", `${label} has path points outside the current road network.`);
    }
  });

  layout.policePatrolPaths.forEach((patrol: PolicePatrolPath, patrolIndex) => {
    const label = patrol.id || `Police patrol ${patrolIndex + 1}`;
    const zone = layout.patrolZones.find((candidate) => candidate.id === patrol.zoneId);
    validateDistrict(issues, "policePatrolPaths", patrol.districtId, label);
    if (!zone) {
      pushIssue(issues, "error", "policePatrolPaths", `${label} references unknown patrol zone "${patrol.zoneId}".`);
    }
    if (patrol.speed <= 0 || patrol.path.length < 2) {
      pushIssue(issues, "error", "policePatrolPaths", `${label} has an invalid speed or too few path points.`);
    }
    patrol.path.forEach((point, pointIndex) => {
      validatePoint(issues, "policePatrolPaths", point, `${label} point ${pointIndex + 1}`);
      if (zone && Math.hypot(point.x - zone.x, point.z - zone.z) > zone.radius + 0.2) {
        pushIssue(issues, "error", "policePatrolPaths", `${label} point ${pointIndex + 1} is outside ${zone.id}.`);
      }
    });
    if (pathIntersectsBuilding(patrol.path, buildingBounds)) {
      pushIssue(issues, "warning", "policePatrolPaths", `${label} intersects a building footprint.`);
    }
  });

  return issues;
}
