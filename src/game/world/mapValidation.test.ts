import { describe, expect, it } from "vitest";
import {
  layoutLooksGenerated,
  normalizeLayout,
  validateWorldMapLayout
} from "./mapLayoutStorage";
import { regenerateCity } from "./cityRegenerator";
import { defaultWorldMapLayout, type WorldBuilding, type WorldMapLayout } from "../content/world";

function baseLayout(): WorldMapLayout {
  return {
    backdropBuildings: [],
    buildings: [],
    decorations: [],
    interiors: [],
    parks: [],
    patrolZones: [],
    policePatrolPaths: [],
    roads: [],
    trafficLoops: []
  };
}

function building(x: number, z: number, signText: string, districtId = "starter_suburb"): WorldBuilding {
  return { districtId, facing: "north", height: 3.5, signText, style: "garage", width: 4, depth: 4, x, z };
}

const hasMessage = (layout: WorldMapLayout, needle: string, severity: "error" | "warning") =>
  validateWorldMapLayout(layout).some((issue) => issue.severity === severity && issue.message.includes(needle));

describe("map validation rules", () => {
  it("keeps the hand-authored default layout free of errors", () => {
    // The default map carries a handful of "outside its district bounds" *warnings*
    // (districts are loose, overlapping tagging regions) — intentionally non-blocking,
    // so the shipped map stays error-free and saveable.
    expect(validateWorldMapLayout(defaultWorldMapLayout).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("warns when two buildings are too close to walk between", () => {
    const layout = baseLayout();
    layout.buildings = [building(0, 0, "A"), building(4.5, 0, "B")]; // 0.5u gap
    expect(hasMessage(layout, "too close to walk between", "warning")).toBe(true);
  });

  it("does not warn when buildings keep a navigable gap", () => {
    const layout = baseLayout();
    layout.buildings = [building(0, 0, "A"), building(8, 0, "B")]; // 4u gap
    expect(hasMessage(layout, "too close to walk between", "warning")).toBe(false);
  });

  it("flags a building outside its district bounds as a warning, never an error", () => {
    const layout = baseLayout();
    layout.buildings = [building(60, 0, "FAR")]; // starter_suburb maxX is 20
    // Deliberately a warning, not a save-blocking error (the default map relies on this).
    expect(hasMessage(layout, "outside its district bounds", "warning")).toBe(true);
    expect(hasMessage(layout, "outside its district bounds", "error")).toBe(false);
  });

  it("detects a generated layout and preserves its arrays verbatim", () => {
    const generated = regenerateCity("persist-1");
    expect(layoutLooksGenerated(generated)).toBe(true);

    const normalized = normalizeLayout(generated);
    // Replace mode must not re-append default roads/buildings (the merge trap).
    expect(normalized.roads.length).toBe(generated.roads.length);
    expect(normalized.buildings.length).toBe(generated.buildings.length);
    expect(normalized.decorations.length).toBe(generated.decorations.length);
  });

  it("still merges a hand-edited default layout additively", () => {
    expect(layoutLooksGenerated(defaultWorldMapLayout)).toBe(false);
    const normalized = normalizeLayout(defaultWorldMapLayout);
    expect(normalized.roads.length).toBe(defaultWorldMapLayout.roads.length);
    expect(normalized.buildings.length).toBe(defaultWorldMapLayout.buildings.length);
  });
});
