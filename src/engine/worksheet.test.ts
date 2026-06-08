import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildWorksheet, regenerateAll } from "./worksheet";
import { QUADRATIC_FACTORING_ID } from "./generators/quadraticFactoring";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });

describe("buildWorksheet", () => {
  it("produces exactly `count` problems", () => {
    const ws = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 1,
      count: 12,
    });
    expect(ws.problems).toHaveLength(12);
  });

  it("is deterministic for the same recipe", () => {
    fc.assert(
      fc.property(anySeed, (baseSeed) => {
        const a = buildWorksheet({
          generatorId: QUADRATIC_FACTORING_ID,
          baseSeed,
          count: 6,
        });
        const b = buildWorksheet({
          generatorId: QUADRATIC_FACTORING_ID,
          baseSeed,
          count: 6,
        });
        expect(a).toEqual(b);
      }),
    );
  });

  it("defaults title and directions from the generator", () => {
    const ws = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 1,
      count: 1,
    });
    expect(ws.directions).toBe("Solve each equation by factoring.");
    expect(ws.title.length).toBeGreaterThan(0);
  });

  it("throws on an unknown generator", () => {
    expect(() =>
      buildWorksheet({ generatorId: "nope", baseSeed: 1, count: 1 }),
    ).toThrow(/Unknown generator/);
  });
});

describe("regenerateAll", () => {
  it("keeps the recipe but changes the problems with a new base seed", () => {
    const ws = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 100,
      count: 8,
    });
    const fresh = regenerateAll(ws, 200);
    expect(fresh.generatorId).toBe(ws.generatorId);
    expect(fresh.count).toBe(ws.count);
    expect(fresh.directions).toBe(ws.directions);
    // overwhelmingly likely the problem set differs
    expect(fresh.problems).not.toEqual(ws.problems);
  });
});
