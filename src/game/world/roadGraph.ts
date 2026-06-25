import type { Bounds2, Vec2 } from "../core/types";
import { worldRoads, type WorldRoad } from "../content/world";

export function roadBounds(road: WorldRoad): Bounds2 {
  return {
    minX: road.x - road.width / 2,
    maxX: road.x + road.width / 2,
    minZ: road.z - road.depth / 2,
    maxZ: road.z + road.depth / 2
  };
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
