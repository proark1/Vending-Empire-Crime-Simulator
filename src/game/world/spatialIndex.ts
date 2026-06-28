import type { Bounds2 } from "../core/types";

export interface SpatialEntry<T> {
  bounds: Bounds2;
  index: number;
  item: T;
}

function cellRange(min: number, max: number, cellSize: number): [number, number] {
  return [Math.floor(min / cellSize), Math.floor(max / cellSize)];
}

function cellKey(x: number, z: number): string {
  return `${x}:${z}`;
}

export class RectSpatialIndex<T> {
  private readonly cells = new Map<string, number[]>();
  private readonly entries: Array<SpatialEntry<T>>;
  private readonly cellSize: number;

  constructor(entries: Array<Omit<SpatialEntry<T>, "index">>, cellSize = 16) {
    this.cellSize = cellSize;
    this.entries = entries.map((entry, index) => ({ ...entry, index }));

    for (const entry of this.entries) {
      const [minCellX, maxCellX] = cellRange(entry.bounds.minX, entry.bounds.maxX, this.cellSize);
      const [minCellZ, maxCellZ] = cellRange(entry.bounds.minZ, entry.bounds.maxZ, this.cellSize);
      for (let x = minCellX; x <= maxCellX; x += 1) {
        for (let z = minCellZ; z <= maxCellZ; z += 1) {
          const key = cellKey(x, z);
          const list = this.cells.get(key) ?? [];
          list.push(entry.index);
          this.cells.set(key, list);
        }
      }
    }
  }

  query(bounds: Bounds2): Array<SpatialEntry<T>> {
    const [minCellX, maxCellX] = cellRange(bounds.minX, bounds.maxX, this.cellSize);
    const [minCellZ, maxCellZ] = cellRange(bounds.minZ, bounds.maxZ, this.cellSize);
    const seen = new Set<number>();
    const out: Array<SpatialEntry<T>> = [];

    for (let x = minCellX; x <= maxCellX; x += 1) {
      for (let z = minCellZ; z <= maxCellZ; z += 1) {
        for (const index of this.cells.get(cellKey(x, z)) ?? []) {
          if (seen.has(index)) {
            continue;
          }
          seen.add(index);
          out.push(this.entries[index]);
        }
      }
    }

    return out;
  }

  some(bounds: Bounds2, predicate: (entry: SpatialEntry<T>) => boolean): boolean {
    for (const entry of this.query(bounds)) {
      if (predicate(entry)) {
        return true;
      }
    }
    return false;
  }
}

export function createRectSpatialIndex<T>(
  items: readonly T[],
  boundsOf: (item: T) => Bounds2,
  cellSize = 16
): RectSpatialIndex<T> {
  return new RectSpatialIndex(
    items.map((item) => ({ bounds: boundsOf(item), item })),
    cellSize
  );
}
