import { describe, expect, it } from "vitest";
import { createDefaultModelConfig, modelCatalog, modelTransformFor, normalizeModelConfig, normalizeModelTransform } from "./modelConfig";

describe("model config", () => {
  it("creates a default transform for every catalog model", () => {
    const config = createDefaultModelConfig();

    expect(Object.keys(config).sort()).toEqual(modelCatalog.map((model) => model.id).sort());
    for (const transform of Object.values(config)) {
      expect(transform).toMatchObject({ offsetX: 0, offsetY: 0, offsetZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 });
    }
  });

  it("normalizes missing and invalid values", () => {
    const transform = normalizeModelTransform({
      offsetX: 99,
      offsetY: "bad",
      rotationY: Math.PI / 2,
      scaleX: -4,
      scaleY: 9,
      scaleZ: 1.25
    });

    expect(transform.offsetX).toBe(20);
    expect(transform.offsetY).toBe(0);
    expect(transform.rotationY).toBe(Math.PI / 2);
    expect(transform.scaleX).toBe(0.1);
    expect(transform.scaleY).toBe(5);
    expect(transform.scaleZ).toBe(1.25);
  });

  it("preserves known model overrides while filling catalog defaults", () => {
    const config = normalizeModelConfig({
      "vehicle.civilian": { scaleX: 1.2, scaleY: 1.1, scaleZ: 1.3, offsetX: 0.4 }
    });

    expect(modelTransformFor(config, "vehicle.civilian")).toMatchObject({ offsetX: 0.4, scaleX: 1.2, scaleY: 1.1, scaleZ: 1.3 });
    expect(modelTransformFor(config, "unit.player")).toMatchObject({ offsetX: 0, scaleX: 1, scaleY: 1, scaleZ: 1 });
  });
});

