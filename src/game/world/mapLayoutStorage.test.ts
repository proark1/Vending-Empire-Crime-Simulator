import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  clearWorldMapLayout,
  layoutLooksGenerated,
  loadWorldMapLayout,
  normalizeLayout,
  saveWorldMapLayout
} from "./mapLayoutStorage";
import { regenerateCity } from "./cityRegenerator";
import { defaultWorldMapLayout } from "../content/world";

const MAP_LAYOUT_KEY = "vendetta-vending.map-layout.v1";
const MAP_LAYOUT_VERSION = 5;

function memoryLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear()
  };
}

const readEnvelope = () => JSON.parse((globalThis as { window: { localStorage: Storage } }).window.localStorage.getItem(MAP_LAYOUT_KEY)!);

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: memoryLocalStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("map layout persistence — replace-mode round-trip", () => {
  it("a generated layout survives save -> load verbatim (no merge, no default tail)", () => {
    const generated = regenerateCity("seed-roundtrip");
    expect(layoutLooksGenerated(generated)).toBe(true);

    saveWorldMapLayout(generated);
    const loaded = loadWorldMapLayout();

    // Round-trips to the verbatim-normalized generated layout, not a merge.
    expect(loaded).toEqual(normalizeLayout(generated, { replace: true }));
    // Building count is preserved exactly — the default's tail is NOT re-appended.
    expect(loaded.buildings).toHaveLength(generated.buildings.length);
  });

  it("does not fall back to (or merge with) the default layout for a generated map", () => {
    const generated = regenerateCity("seed-roundtrip-2");
    saveWorldMapLayout(generated);
    const loaded = loadWorldMapLayout();

    // A generated map differs from the hand-authored default; replace mode keeps it
    // distinct rather than index-merging the two (which would corrupt counts/ids).
    expect(loaded.buildings.length).not.toBe(defaultWorldMapLayout.buildings.length);
    expect(loaded.roads.length).not.toBe(0);
  });

  it("stores a generated layout under replace mode with the version + seed", () => {
    saveWorldMapLayout(regenerateCity("seed-env"), { seed: "seed-env" });
    const envelope = readEnvelope();
    expect(envelope.mode).toBe("replace");
    expect(envelope.version).toBe(MAP_LAYOUT_VERSION);
    expect(envelope.seed).toBe("seed-env");
  });

  it("keeps the hand-authored default on merge mode and round-trips its count", () => {
    expect(layoutLooksGenerated(defaultWorldMapLayout)).toBe(false);
    saveWorldMapLayout(defaultWorldMapLayout);
    expect(readEnvelope().mode).toBe("merge");
    expect(loadWorldMapLayout().buildings).toHaveLength(defaultWorldMapLayout.buildings.length);
  });

  it("discards a stale older-version envelope in favour of the default", () => {
    const generated = regenerateCity("seed-stale");
    (globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem(
      MAP_LAYOUT_KEY,
      JSON.stringify({ layout: generated, version: MAP_LAYOUT_VERSION - 1, mode: "replace" })
    );
    const loaded = loadWorldMapLayout();
    expect(loaded.buildings).toHaveLength(defaultWorldMapLayout.buildings.length);
  });

  it("returns the default and persists nothing when storage is unavailable", () => {
    vi.unstubAllGlobals(); // no window -> no localStorage
    expect(() => saveWorldMapLayout(regenerateCity("seed-nostore"))).not.toThrow();
    expect(loadWorldMapLayout().buildings).toHaveLength(defaultWorldMapLayout.buildings.length);
    clearWorldMapLayout(); // also a no-op without storage
  });
});
