import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

describe("seeded rng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng("seed-a");
    const b = createRng("seed-a");
    const seqA = Array.from({ length: 16 }, () => a.next());
    const seqB = Array.from({ length: 16 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = Array.from({ length: 16 }, (() => { const r = createRng("a"); return () => r.next(); })());
    const b = Array.from({ length: 16 }, (() => { const r = createRng("b"); return () => r.next(); })());
    expect(a).not.toEqual(b);
  });

  it("emits values in [0, 1)", () => {
    const rng = createRng("range");
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("forks are isolated from parent consumption", () => {
    // A fork depends only on the seed + label, not on how much the parent ran.
    const parent1 = createRng("root");
    const forkBefore = parent1.fork("layer").next();

    const parent2 = createRng("root");
    parent2.next();
    parent2.next();
    parent2.next();
    const forkAfter = parent2.fork("layer").next();

    expect(forkBefore).toEqual(forkAfter);
  });

  it("different fork labels produce different streams", () => {
    const root = createRng("root");
    expect(root.fork("a").next()).not.toEqual(root.fork("b").next());
  });

  it("int respects bounds and handles empty ranges", () => {
    const rng = createRng("int");
    for (let i = 0; i < 500; i += 1) {
      const value = rng.int(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThan(7);
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(rng.int(5, 5)).toBe(5);
  });

  it("pick throws on an empty array", () => {
    expect(() => createRng("pick").pick([])).toThrow();
  });
});
