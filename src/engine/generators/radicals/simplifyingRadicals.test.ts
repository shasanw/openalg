import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, generator } from "./simplifyingRadicals";
import { anySeed, commonChecks, expectSimplest, expectValueDistractors, sameValue } from "./radicals.testkit";

const anyParams = fc.record({
  coefficients: fc.boolean(),
  maxFactor: fc.integer({ min: 2, max: 12 }),
  cubeRoots: fc.boolean(),
  variables: fc.boolean(),
});

describe("simplifying-radicals: answers", () => {
  it("the Answer equals the printed radical and is in simplest form", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(sameValue(p.prompt, p.answer), `${p.prompt} = ${p.answer}`).toBe(true);
        expectSimplest(p.answer);
        // there is always something to simplify
        expect(p.answer).not.toBe(p.prompt);
      }),
    );
  });
});

describe("simplifying-radicals: Topic Options", () => {
  it("honours the largest factor, coefficients, cube roots and variables", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        expect(Math.abs(k.out)).toBeLessThanOrEqual(params.maxFactor);
        if (!params.coefficients) expect(k.k).toBe(1);
        if (!params.cubeRoots) expect(p.prompt + p.answer).not.toContain("\\sqrt[3]");
        if (!params.variables) expect(p.prompt + p.answer).not.toMatch(/[xy]/);
      }),
    );
    const ks = Array.from({ length: 100 }, (_, s) => construct({ cubeRoots: true, variables: true }, createRng(s)));
    expect(ks.some((k) => k.index === 3)).toBe(true);
    expect(ks.some((k) => k.index === 2)).toBe(true);
    expect(ks.every((k) => k.vars.length > 0)).toBe(true);
    expect(Array.from({ length: 100 }, (_, s) => construct({}, createRng(s))).some((k) => k.k !== 1)).toBe(true);
  });
});

describe("simplifying-radicals: distractors", () => {
  it("are distinct wrong values, at least four", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectValueDistractors(p.answer, p.distractorHints, 4);
      }),
    );
  });

  it("lead with leaving the power outside the root", () => {
    const seed = Array.from({ length: 500 }, (_, s) => s).find((s) => generator.generate({ coefficients: false }, s).prompt === "\\sqrt{8}")!;
    const p = generator.generate({ coefficients: false }, seed);
    expect(p.distractorHints[0]).toBe("4\\sqrt{2}");
  });
});

describe("simplifying-radicals: generate()", () => {
  it("is deterministic, renders, and has variety", () => {
    commonChecks(generator, anyParams, [{}, { cubeRoots: true }, { variables: true }], 60);
  });
});

it("offers the mistake of dividing 25 by the root index", () => {
  const p = generator.generate({}, 1);
  expect(p.distractorHints).toContain("\\frac{25}{2}");
});
