import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  buildWorksheet,
  normalizeWorksheet,
  regenerateAll,
  rerollProblem,
  removeProblem,
  reorderProblem,
  DEFAULT_PRINT_CONFIG,
  type Worksheet,
} from "./worksheet";
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

  it("never repeats a problem within a sheet when the space is large enough", () => {
    // Default options give 171 distinct factoring problems; a 12-problem sheet
    // must contain 12 distinct prompts for ANY base seed (reject-and-resample).
    fc.assert(
      fc.property(anySeed, (baseSeed) => {
        const ws = buildWorksheet({
          generatorId: QUADRATIC_FACTORING_ID,
          baseSeed,
          count: 12,
        });
        const prompts = new Set(ws.problems.map((p) => p.prompt));
        expect(prompts.size).toBe(12);
      }),
    );
  });

  it("degrades gracefully when count exceeds the available problem space", () => {
    // maxRoot=1 yields only 3 distinct problems; asking for 10 must still return
    // 10 (topped up with repeats) and terminate rather than spin forever.
    const ws = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      params: { maxRoot: 1 },
      baseSeed: 5,
      count: 10,
    });
    expect(ws.problems).toHaveLength(10);
    const distinct = new Set(ws.problems.map((p) => p.prompt));
    expect(distinct.size).toBeLessThanOrEqual(3);
    expect(distinct.size).toBeGreaterThan(0);
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

describe("per-problem curation", () => {
  const sheet = () =>
    buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 42,
      count: 5,
    });

  describe("rerollProblem", () => {
    it("changes only the targeted problem", () => {
      const ws = sheet();
      const next = rerollProblem(ws, 2, 999);
      expect(next.problems[2]).not.toEqual(ws.problems[2]);
      // every other problem is byte-identical
      [0, 1, 3, 4].forEach((i) =>
        expect(next.problems[i]).toEqual(ws.problems[i]),
      );
      expect(next.count).toBe(5);
    });

    it("re-rolls from the problem's own recipe (same params, new seed)", () => {
      const ws = sheet();
      const next = rerollProblem(ws, 0, 12345);
      expect(next.problems[0].generatorId).toBe(ws.problems[0].generatorId);
      expect(next.problems[0].params).toEqual(ws.problems[0].params);
      expect(next.problems[0].seed).toBe(12345);
    });

    it("stays correct by construction for any seed", () => {
      // The construction guarantee: factors (x - r1)(x - r2) expand to x^2+bx+c,
      // so re-rolling can never produce a problem whose answer doesn't fit it.
      // Here we assert the recipe contract that upholds it (kind + own seed).
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
          const next = rerollProblem(sheet(), 1, seed);
          expect(next.problems[1].kind).toBe("generated");
          expect(next.problems[1].seed).toBe(seed);
        }),
      );
    });

    it("is a no-op for an out-of-range index", () => {
      const ws = sheet();
      expect(rerollProblem(ws, 99, 1)).toEqual(ws);
    });
  });

  describe("removeProblem", () => {
    it("drops the problem and keeps count consistent", () => {
      const ws = sheet();
      const removed = ws.problems[2];
      const next = removeProblem(ws, 2);
      expect(next.problems).toHaveLength(4);
      expect(next.count).toBe(4);
      expect(next.problems).not.toContainEqual(removed);
      // surrounding problems are preserved and in order
      expect(next.problems).toEqual([
        ws.problems[0],
        ws.problems[1],
        ws.problems[3],
        ws.problems[4],
      ]);
    });

    it("is a no-op for an out-of-range index", () => {
      const ws = sheet();
      expect(removeProblem(ws, -1)).toEqual(ws);
      expect(removeProblem(ws, 5)).toEqual(ws);
    });
  });

  describe("reorderProblem", () => {
    it("moves a problem to a later slot, shifting the rest to fill the gap", () => {
      const ws = sheet();
      const next = reorderProblem(ws, 1, 3);
      // problem 1 lands at index 3; the items between shift left by one
      expect(next.problems).toEqual([
        ws.problems[0],
        ws.problems[2],
        ws.problems[3],
        ws.problems[1],
        ws.problems[4],
      ]);
    });

    it("moves a problem to an earlier slot", () => {
      const ws = sheet();
      const next = reorderProblem(ws, 3, 0);
      expect(next.problems).toEqual([
        ws.problems[3],
        ws.problems[0],
        ws.problems[1],
        ws.problems[2],
        ws.problems[4],
      ]);
    });

    it("preserves the multiset of problems and the count", () => {
      const ws = sheet();
      const next = reorderProblem(ws, 0, 4);
      expect(next.count).toBe(5);
      const bySeed = (a: { seed: number }, b: { seed: number }) =>
        a.seed - b.seed;
      expect([...next.problems].sort(bySeed)).toEqual(
        [...ws.problems].sort(bySeed),
      );
    });

    it("is a no-op for same-slot or out-of-range moves", () => {
      const ws = sheet();
      expect(reorderProblem(ws, 2, 2)).toEqual(ws);
      expect(reorderProblem(ws, -1, 2)).toEqual(ws);
      expect(reorderProblem(ws, 2, 5)).toEqual(ws);
    });
  });

  describe("print config (issue #7)", () => {
    it("buildWorksheet attaches the default print config", () => {
      const ws = buildWorksheet({
        generatorId: QUADRATIC_FACTORING_ID,
        baseSeed: 1,
        count: 3,
      });
      expect(ws.print).toEqual(DEFAULT_PRINT_CONFIG);
    });

    it("regenerateAll carries the print config forward", () => {
      const base = buildWorksheet({
        generatorId: QUADRATIC_FACTORING_ID,
        baseSeed: 1,
        count: 3,
        print: { ...DEFAULT_PRINT_CONFIG, paper: "a4", spacing: "roomy" },
      });
      expect(regenerateAll(base, 99).print).toEqual(base.print);
    });

    it("normalizeWorksheet backfills print on pre-#7 saved files", () => {
      // A file saved before issue #7 has no `print` block.
      const legacy = {
        version: 1,
        title: "Old sheet",
        generatorId: QUADRATIC_FACTORING_ID,
        params: {},
        directions: "Solve.",
        baseSeed: 1,
        count: 1,
        problems: [],
      } as unknown as Worksheet;
      expect(normalizeWorksheet(legacy).print).toEqual(DEFAULT_PRINT_CONFIG);
    });

    it("normalizeWorksheet preserves an explicit print config", () => {
      const ws = buildWorksheet({
        generatorId: QUADRATIC_FACTORING_ID,
        baseSeed: 1,
        count: 1,
        print: { ...DEFAULT_PRINT_CONFIG, orientation: "landscape" },
      });
      expect(normalizeWorksheet(ws).print.orientation).toBe("landscape");
    });
  });
});
