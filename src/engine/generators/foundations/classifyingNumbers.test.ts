import { classifyingNumbers } from "./classifyingNumbers.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, generator } from "./classifyingNumbers";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  includeNatural: fc.boolean(),
  includeRoots: fc.boolean(),
  disguised: fc.boolean(),
});

describe("classifying-numbers: answers", () => {
  it("names exactly the sets the printed number belongs to", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        classifyingNumbers(p);
      }),
      { numRuns: 300 },
    );
  });

  it("covers every kind of number across a sheet", () => {
    const answers = new Set(Array.from({ length: 80 }, (_, s) => generator.generate({}, s).answer));
    expect(answers).toEqual(
      new Set([
        "\\text{natural, whole, integer, rational}",
        "\\text{whole, integer, rational}",
        "\\text{integer, rational}",
        "\\text{rational}",
        "\\text{irrational}",
      ]),
    );
  });
});

describe("classifying-numbers: Topic Options", () => {
  it("leaves out natural numbers, and drops roots or disguises, when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        if (!params.includeNatural) expect(p.answer + p.distractorHints.join()).not.toContain("natural");
        if (!params.includeRoots) expect(p.prompt).not.toContain("\\sqrt");
        const k = construct(params, createRng(seed));
        if (!params.disguised && (k.kind === "natural" || k.kind === "negative" || k.kind === "zero")) {
          expect(p.prompt).toMatch(/^-?\d+$/);
        }
      }),
    );
  });
});

describe("classifying-numbers: Distractors", () => {
  it("are at least four distinct, well-formed chains, never the Answer", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        for (const d of p.distractorHints) expect(d).toMatch(/^\\text\{[a-z]+(, [a-z]+)*\}$/);
      }),
    );
  });

  it("lead with the mistake the number invites", () => {
    // a disguised natural number written as a root is mistaken for irrational
    const roots = Array.from({ length: 400 }, (_, s) => generator.generate({}, s)).filter((p) => /^\\sqrt\{\d+\}$/.test(p.prompt) && p.answer.includes("natural"));
    expect(roots.length).toBeGreaterThan(0);
    for (const p of roots) expect(p.distractorHints[0]).toBe("\\text{irrational}");
    // a repeating decimal is mistaken for irrational
    const repeating = Array.from({ length: 400 }, (_, s) => generator.generate({}, s)).filter((p) => p.prompt.includes("overline"));
    expect(repeating.length).toBeGreaterThan(0);
    for (const p of repeating) expect(p.distractorHints[0]).toBe("\\text{irrational}");
  });
});

describe("classifying-numbers: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section", () => {
    const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({}, s).prompt));
    expect(prompts.size).toBeGreaterThan(120);
  });
});
