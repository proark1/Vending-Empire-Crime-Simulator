// Axis-aligned rectangle algebra on a snapped coordinate grid.
//
// Every coordinate is rounded to EPS before comparison, which is the single
// source of numerical robustness for the city generator: shared edges become
// exactly equal, so "adjacent" never accidentally reads as "overlapping" and
// there is no floating-point drift to mask with a tolerance.

import type { Bounds2, Vec2 } from "../core/types";

export const EPS = 1e-3;

export function snap(value: number): number {
  return Math.round(value / EPS) * EPS;
}

export function snapBounds(bounds: Bounds2): Bounds2 {
  return {
    minX: snap(bounds.minX),
    maxX: snap(bounds.maxX),
    minZ: snap(bounds.minZ),
    maxZ: snap(bounds.maxZ)
  };
}

export function boundsWidth(bounds: Bounds2): number {
  return bounds.maxX - bounds.minX;
}

export function boundsDepth(bounds: Bounds2): number {
  return bounds.maxZ - bounds.minZ;
}

export function boundsArea(bounds: Bounds2): number {
  return Math.max(0, boundsWidth(bounds)) * Math.max(0, boundsDepth(bounds));
}

export function boundsCenter(bounds: Bounds2): Vec2 {
  return { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
}

export function rectFromCenter(x: number, z: number, width: number, depth: number): Bounds2 {
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}

export function inflate(bounds: Bounds2, margin: number): Bounds2 {
  return {
    minX: bounds.minX - margin,
    maxX: bounds.maxX + margin,
    minZ: bounds.minZ - margin,
    maxZ: bounds.maxZ + margin
  };
}

export function pointInRect(point: Vec2, bounds: Bounds2, clearance = 0): boolean {
  return point.x > bounds.minX - clearance
    && point.x < bounds.maxX + clearance
    && point.z > bounds.minZ - clearance
    && point.z < bounds.maxZ + clearance;
}

/** Strict interior overlap: shared edges (within EPS) do NOT count as overlap. */
export function rectsOverlap(a: Bounds2, b: Bounds2, clearance = 0): boolean {
  return a.minX < b.maxX - clearance - EPS / 2
    && a.maxX > b.minX + clearance + EPS / 2
    && a.minZ < b.maxZ - clearance - EPS / 2
    && a.maxZ > b.minZ + clearance + EPS / 2;
}

export function rectContains(outer: Bounds2, inner: Bounds2, clearance = 0): boolean {
  return inner.minX >= outer.minX - clearance
    && inner.maxX <= outer.maxX + clearance
    && inner.minZ >= outer.minZ - clearance
    && inner.maxZ <= outer.maxZ + clearance;
}

export function clampPointToBounds(point: Vec2, bounds: Bounds2): Vec2 {
  return {
    x: Math.min(Math.max(point.x, bounds.minX), bounds.maxX),
    z: Math.min(Math.max(point.z, bounds.minZ), bounds.maxZ)
  };
}

/** Sorted ascending with near-duplicates (within `tolerance`) collapsed. */
export function sortedUnique(values: number[], tolerance = EPS): number[] {
  const sorted = [...values].map(snap).sort((a, b) => a - b);
  const out: number[] = [];
  for (const value of sorted) {
    if (out.length === 0 || Math.abs(value - out[out.length - 1]) > tolerance) {
      out.push(value);
    }
  }
  return out;
}

export interface LabeledRect<T extends string = string> {
  bounds: Bounds2;
  label: T;
}

/**
 * Decompose `region` into a minimal set of axis-aligned rectangles by:
 *   1. cutting it along the supplied grid lines (plus the region's own edges),
 *   2. labelling each cell by its center (null => excluded), and
 *   3. greedily merging orthogonally-adjacent same-label cells into maximal
 *      rectangles (extend right, then extend the full-width strip downward).
 *
 * This is the shared primitive behind the claim map, sidewalk ring and block
 * enumeration. Scanning order is fixed (z-major, then x) so output is
 * deterministic for a given input.
 */
export function partitionIntoRects<T extends string = string>(
  region: Bounds2,
  xLines: number[],
  zLines: number[],
  labelOf: (center: Vec2, cell: Bounds2) => T | null
): Array<LabeledRect<T>> {
  const region2 = snapBounds(region);
  const xs = sortedUnique([region2.minX, region2.maxX, ...xLines]).filter(
    (x) => x >= region2.minX - EPS && x <= region2.maxX + EPS
  );
  const zs = sortedUnique([region2.minZ, region2.maxZ, ...zLines]).filter(
    (z) => z >= region2.minZ - EPS && z <= region2.maxZ + EPS
  );
  const cols = xs.length - 1;
  const rows = zs.length - 1;
  if (cols <= 0 || rows <= 0) {
    return [];
  }

  const labels: Array<Array<T | null>> = [];
  for (let r = 0; r < rows; r += 1) {
    const row: Array<T | null> = [];
    for (let c = 0; c < cols; c += 1) {
      const cell: Bounds2 = { minX: xs[c], maxX: xs[c + 1], minZ: zs[r], maxZ: zs[r + 1] };
      const center = boundsCenter(cell);
      row.push(labelOf(center, cell));
    }
    labels.push(row);
  }

  const consumed: boolean[][] = labels.map((row) => row.map(() => false));
  const result: Array<LabeledRect<T>> = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const label = labels[r][c];
      if (label === null || consumed[r][c]) {
        continue;
      }

      let cEnd = c;
      while (cEnd + 1 < cols && labels[r][cEnd + 1] === label && !consumed[r][cEnd + 1]) {
        cEnd += 1;
      }

      let rEnd = r;
      let canExtend = true;
      while (canExtend && rEnd + 1 < rows) {
        for (let cc = c; cc <= cEnd; cc += 1) {
          if (labels[rEnd + 1][cc] !== label || consumed[rEnd + 1][cc]) {
            canExtend = false;
            break;
          }
        }
        if (canExtend) {
          rEnd += 1;
        }
      }

      for (let rr = r; rr <= rEnd; rr += 1) {
        for (let cc = c; cc <= cEnd; cc += 1) {
          consumed[rr][cc] = true;
        }
      }

      result.push({
        label,
        bounds: { minX: xs[c], maxX: xs[cEnd + 1], minZ: zs[r], maxZ: zs[rEnd + 1] }
      });
    }
  }

  return result;
}
