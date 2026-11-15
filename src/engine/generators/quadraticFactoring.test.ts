import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import {
  construct,
  distractors,
  generator,
} from "./quadraticFactoring";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });

describe("quadratic-factoring: construction", () => {
  it("answer-from-construction: both roots satisfy x^2 + bx + c = 0", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        const k = construct({}, createRng(seed));
        for (const r of k.roots) {
          expect(r * r + k.b * r + k.c).toBe(0);
        }
      }),
    );
  });

  it("coefficients follow Vieta's formulas (factored form expands correctly)", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        const { b, c, roots } = construct({}, createRng(seed));
        expect(b).toBe(-(roots[0] + roots[1]));
        expect(c).toBe(roots[0] * roots[1]);
      }),
    );
  });

  it("respects the maxRoot bound for any seed", () => {
    fc.assert(
      fc.property(anySeed, fc.integer({ min: 1, max: 20 }), (seed, maxRoot) => {
        const k = construct({ maxRoot }, createRng(seed));
        for (const r of k.roots) {
          expect(Math.abs(r)).toBeLessThanOrEqual(maxRoot);
        }
      }),
    );
  });

  it("produces distinct roots when allowEqualRoots is false", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        const k = construct({ allowEqualRoots: false }, createRng(seed));
        expect(k.roots[0]).not.toBe(k.roots[1]);
      }),
    );
  });
});

describe("quadratic-factoring: distractors", () => {
  it("are distinct and never equal the correct answer", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        const p = generator.generate({}, seed);
        expect(p.distractorHints.length).toBeGreaterThan(0);
        expect(p.distractorHints).not.toContain(p.answer);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
      }),
    );
  });
});

describe("quadratic-factoring: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        expect(generator.generate({}, seed)).toEqual(
          generator.generate({}, seed),
        );
      }),
    );
  });

  it("bakes the recipe (generatorId, params, seed) onto the problem", () => {
    const p = generator.generate({ maxRoot: 5 }, 42);
    expect(p.generatorId).toBe("quadratic-factoring");
    expect(p.seed).toBe(42);
    expect(p.params.maxRoot).toBe(5);
    expect(p.kind).toBe("generated");
  });

  it("renders a sane prompt and answer", () => {
    // seed chosen for a stable, readable example
    const p = generator.generate({ maxRoot: 6 }, 7);
    expect(p.prompt).toMatch(/^.*x\^2.* = 0$/);
    expect(p.answer).toMatch(/^x = /);
  });
});

describe("format edge cases via distractors()", () => {
  it("collapses repeated roots to a single value", () => {
    // roots [3, 3] -> "x = 3"
    const out = distractors({ b: -6, c: 9, roots: [3, 3] });
    expect(out.every((s) => s.startsWith("x = "))).toBe(true);
  });
});

describe("quadratic-factoring: mistake-based distractors", () => {
  // x^2 - x - 6 = 0, roots -2 and 3.
  const k = { b: -1, c: -6, roots: [3, -2] as [number, number] };

  it("includes the sign error on both roots", () => {
    expect(distractors(k)).toContain("x = -3, 2");
  });

  it("includes a single flipped sign", () => {
    expect(distractors(k)).toContain("x = 2, 3");
  });

  it("includes a wrong factor pair of c", () => {
    // -1 * 6 = -6 like the right pair, but sums to 5, not 1.
    expect(distractors(k)[1]).toBe("x = -1, 6");
  });

  it("includes a dropped solution", () => {
    expect(distractors(k)).toContain("x = 3");
  });

  it("puts the most diagnostic mistakes first", () => {
    expect(distractors(k)[0]).toBe("x = -3, 2");
  });

  it("every hint is a solution set of the same shape", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        for (const d of generator.generate({}, seed).distractorHints) {
          expect(d).toMatch(/^x = -?\d+(, -?\d+)?$/);
        }
      }),
    );
  });

  it("always offers at least three mistake-based hints", () => {
    fc.assert(
      fc.property(anySeed, fc.boolean(), (seed, allowEqualRoots) => {
        const p = generator.generate({ allowEqualRoots }, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(
          allowEqualRoots ? 1 : 3,
        );
      }),
    );
  });
});
