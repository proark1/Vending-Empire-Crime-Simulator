import { describe, expect, it } from "vitest";
import { distanceMeters, formatDistanceMeters, guidanceRotationDegrees, smoothGuidanceRotationDegrees } from "./GuidanceArrow";

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

  it("reports world units as real meters without a display multiplier", () => {
    expect(distanceMeters({ x: 0, z: 0 }, { x: 3, z: 4 })).toBeCloseTo(5);
    expect(formatDistanceMeters(5)).toBe("5.0 m");
    expect(formatDistanceMeters(24.4)).toBe("24 m");
  });

  it("smooths across the wrap boundary using the shortest turn", () => {
    expect(smoothGuidanceRotationDegrees(179, -179, 0.5)).toBeCloseTo(180);
    expect(smoothGuidanceRotationDegrees(-179, 179, 0.5)).toBeCloseTo(-180);
  });
});
