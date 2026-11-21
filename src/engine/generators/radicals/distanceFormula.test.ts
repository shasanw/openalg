import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distanceLatex, generator } from "./distanceFormula";
import { evalLatex } from "../shared/latexEval.testkit";
import { anySeed, commonChecks, expectSimplest } from "./radicals.testkit";

const anyParams = fc.record({
  distances: fc.constantFrom("mixed", "whole", "radical"),
  answerForm: fc.constantFrom("exact", "rounded"),
  maxCoordinate: fc.integer({ min: 4, max: 20 }),
});

/** The two points of a printed prompt "(x1, y1) \text{ and } (x2, y2)". */
function points(prompt: string): number[] {
  return [...prompt.matchAll(/-?\d+/g)].map((m) => Number(m[0]));
}

const valueOf = (answer: string) => evalLatex(answer);

describe("distance-formula: answers", () => {
  it("the Answer is the distance between the printed points", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const [x1, y1, x2, y2] = points(p.prompt);
        const d = Math.hypot(x2 - x1, y2 - y1);
        if (params.answerForm === "rounded") {
          expect(Math.abs(valueOf(p.answer) - d)).toBeLessThanOrEqual(0.05 + 1e-9);
          expect(p.answer).toMatch(/^\d+(\.\d)?$/);
        } else {
          expect(valueOf(p.answer)).toBeCloseTo(d, 9);
          expectSimplest(p.answer);
        }
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
  it("are distinct, never the Answer's value, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        for (const d of p.distractorHints) expect(Math.abs(valueOf(d) - valueOf(p.answer)), d).toBeGreaterThan(1e-9);
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
