import type { Bounds2, Vec2 } from "../core/types";
import { worldRoads, type WorldRoad } from "../content/world";
import { RectSpatialIndex } from "./spatialIndex";

export function roadBounds(road: WorldRoad): Bounds2 {
  return {
    minX: road.x - road.width / 2,
    maxX: road.x + road.width / 2,
    minZ: road.z - road.depth / 2,
    maxZ: road.z + road.depth / 2
  };
}

export function roadBoundsTouch(a: WorldRoad, b: WorldRoad, margin = 0.04): boolean {
  const first = roadBounds(a);
  const second = roadBounds(b);
  return first.minX <= second.maxX + margin
    && first.maxX >= second.minX - margin
    && first.minZ <= second.maxZ + margin
    && first.maxZ >= second.minZ - margin;
}

function inflateBounds(bounds: Bounds2, margin: number): Bounds2 {
  return {
    minX: bounds.minX - margin,
    maxX: bounds.maxX + margin,
    minZ: bounds.minZ - margin,
    maxZ: bounds.maxZ + margin
  };
}

export function connectedRoadComponents(roads: WorldRoad[] = worldRoads): WorldRoad[][] {
  const remaining = new Set(roads.map((road) => road.id));
  const roadIndex = new RectSpatialIndex(roads.map((road) => ({ bounds: roadBounds(road), item: road })));
  const components: WorldRoad[][] = [];

  for (const road of roads) {
    if (!remaining.has(road.id)) {
      continue;
    }

    const queue = [road];
    const component: WorldRoad[] = [];
    remaining.delete(road.id);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      component.push(current);

      for (const candidate of roadIndex.query(inflateBounds(roadBounds(current), 0.04))) {
        if (remaining.has(candidate.item.id) && roadBoundsTouch(current, candidate.item)) {
          remaining.delete(candidate.item.id);
          queue.push(candidate.item);
        }
      }
    }

    components.push(component);
  }

  return components;
}

export function disconnectedRoadIds(roads: WorldRoad[] = worldRoads): string[] {
  const components = connectedRoadComponents(roads);
  if (components.length <= 1) {
    return [];
  }

  const largestComponent = [...components].sort((a, b) => b.length - a.length)[0] ?? [];
  const connectedIds = new Set(largestComponent.map((road) => road.id));
  return roads.filter((road) => !connectedIds.has(road.id)).map((road) => road.id);
}

export function pointOnRoad(point: Vec2, roads: WorldRoad[] = worldRoads, margin = 0.02): boolean {
  return roads.some((road) => {
    const bounds = roadBounds(road);
    return point.x >= bounds.minX - margin
      && point.x <= bounds.maxX + margin
      && point.z >= bounds.minZ - margin
      && point.z <= bounds.maxZ + margin;
  });
}

export function segmentOnRoads(start: Vec2, end: Vec2, roads: WorldRoad[] = worldRoads, sampleSpacing = 0.5): boolean {
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  const samples = Math.max(1, Math.ceil(length / sampleSpacing));

  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const point = {
      x: start.x + (end.x - start.x) * t,
      z: start.z + (end.z - start.z) * t
    };

    if (!pointOnRoad(point, roads)) {
      return false;
    }
  }

  return true;
}

export function pathOnRoads(path: Vec2[], roads: WorldRoad[] = worldRoads): boolean {
  if (path.length < 2) {
    return false;
  }

  return path.every((point, index) => segmentOnRoads(point, path[(index + 1) % path.length], roads));
}
