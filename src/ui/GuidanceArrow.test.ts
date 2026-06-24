import { describe, expect, it } from "vitest";
import { guidanceRotationDegrees } from "./GuidanceArrow";

describe("guidanceRotationDegrees", () => {
  it("points straight ahead when the player faces the target", () => {
    expect(guidanceRotationDegrees({ x: 0, z: 0 }, { x: 0, z: -2 }, 0)).toBeCloseTo(0);
    expect(guidanceRotationDegrees({ x: 0, z: 0 }, { x: 2, z: 0 }, 90)).toBeCloseTo(0);
  });

  it("uses camera-relative left and right turns", () => {
    expect(guidanceRotationDegrees({ x: 0, z: 0 }, { x: 2, z: 0 }, 0)).toBeCloseTo(90);
    expect(guidanceRotationDegrees({ x: 0, z: 0 }, { x: -2, z: 0 }, 0)).toBeCloseTo(-90);
    expect(guidanceRotationDegrees({ x: 0, z: 0 }, { x: 0, z: -2 }, 180)).toBeCloseTo(-180);
  });
});
