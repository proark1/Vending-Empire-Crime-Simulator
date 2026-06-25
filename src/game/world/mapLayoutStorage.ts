import type { Bounds2 } from "../core/types";
import { defaultWorldMapLayout, type TrafficLoop, type WorldBuilding, type WorldMapLayout, type WorldRoad } from "../content/world";
import { pathOnRoads } from "./roadGraph";

const MAP_LAYOUT_KEY = "vendetta-vending.map-layout.v1";
const MAP_LAYOUT_VERSION = 1;

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
  const source = Array.isArray(candidate) ? candidate : fallback;
  return source.map((item, index) => ({
    ...(fallback[index] ?? {}),
    ...(item as Partial<T>)
  }) as T);
}

function normalizeLayout(candidate: unknown): WorldMapLayout {
  const fallback = cloneLayout(defaultWorldMapLayout);
  const input = typeof candidate === "object" && candidate !== null ? candidate as Partial<WorldMapLayout> : {};

  return {
    backdropBuildings: mergeArray(input.backdropBuildings, fallback.backdropBuildings),
    buildings: mergeArray(input.buildings, fallback.buildings),
    decorations: mergeArray(input.decorations, fallback.decorations),
    interiors: mergeArray(input.interiors, fallback.interiors),
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

export function validateWorldMapLayout(layout: WorldMapLayout): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];

  layout.roads.forEach((road, roadIndex) => {
    if (road.width <= 0 || road.depth <= 0) {
      issues.push({
        layer: "roads",
        message: `${road.id || `Road ${roadIndex + 1}`} has an invalid size.`,
        severity: "error"
      });
    }
  });

  layout.buildings.forEach((building, buildingIndex) => {
    if (building.width <= 0 || building.depth <= 0 || building.height <= 0) {
      issues.push({
        layer: "buildings",
        message: `${objectLabel(building, buildingIndex)} has an invalid size.`,
        severity: "error"
      });
    }

    const buildingBounds = buildingFootprint(building);
    for (const road of layout.roads) {
      if (rectsIntersect(buildingBounds, roadFootprint(road))) {
        issues.push({
          layer: "buildings",
          message: `${objectLabel(building, buildingIndex)} overlaps ${road.id}. Move either object so streets stay clear of building footprints.`,
          severity: "error"
        });
      }
    }
  });

  layout.trafficLoops.forEach((loop, loopIndex) => {
    if (!pathOnRoads(loop.path, layout.roads)) {
      issues.push({
        layer: "trafficLoops",
        message: `${trafficLabel(loop, loopIndex)} has path points outside the current road network.`,
        severity: "warning"
      });
    }
  });

  return issues;
}
