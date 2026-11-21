import { distanceFormula, valueOf } from "./distanceFormula.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distanceLatex, generator } from "./distanceFormula";
import { anySeed, commonChecks } from "./radicals.testkit";

const anyParams = fc.record({
  distances: fc.constantFrom("mixed", "whole", "radical"),
  answerForm: fc.constantFrom("exact", "rounded"),
  maxCoordinate: fc.integer({ min: 4, max: 20 }),
});

describe("distance-formula: answers", () => {
  it("the Answer is the distance between the printed points", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        distanceFormula(p);
      }),
    );
  });

  it("rounds to the nearest tenth", () => {
    expect(distanceLatex(29, true)).toBe("5.4");
    expect(distanceLatex(25, true)).toBe("5");
    expect(distanceLatex(40, false)).toBe("2\\sqrt{10}");
  });
});

describe("distance-formula: Topic Options", () => {
  it("keeps points inside the limit, distinct, and the distance kind asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        for (const v of [...k.p1, ...k.p2]) expect(Math.abs(v)).toBeLessThanOrEqual(params.maxCoordinate);
        // both legs nonzero: never a horizontal or vertical segment
        expect(k.p1[0]).not.toBe(k.p2[0]);
        expect(k.p1[1]).not.toBe(k.p2[1]);
        const whole = Number.isInteger(Math.sqrt(k.squared));
        if (params.distances === "whole") expect(whole).toBe(true);
        if (params.distances === "radical") expect(whole).toBe(false);
      }),
    );
    const kinds = new Set(Array.from({ length: 60 }, (_, s) => Number.isInteger(Math.sqrt(construct({}, createRng(s)).squared))));
    expect(kinds).toEqual(new Set([true, false]));
  });
});

describe("distance-formula: distractors", () => {
  it("are distinct, never the Answer's value, and at least four", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        const values = [p.answer, ...p.distractorHints].map(valueOf).sort((a, b) => a - b);
        for (let i = 1; i < values.length; i++) expect(values[i] - values[i - 1]).toBeGreaterThan(1e-9);
      }),
    );
  });

  it("lead with forgetting the square root", () => {
    const k = construct({}, createRng(5));
    expect(generator.generate({}, 5).distractorHints[0]).toBe(String(k.squared));
  });
});

describe("distance-formula: generate()", () => {
  it("is deterministic, renders, and has variety", () => {
    commonChecks(generator, anyParams, [{}, { distances: "whole" }, { distances: "radical", answerForm: "rounded" }], 100);
  });
});

it("offers the mistake of halving the diagonal distance as in the midpoint formula", () => {
  const p = generator.generate({ distances: "radical" }, 7);
  expect(p.distractorHints).toContain("\\frac{\\sqrt{2}}{2}");
});
