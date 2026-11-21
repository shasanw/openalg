import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, generator } from "./trigEquationsMultipleAngle";
import { anySeed, expectLowestTerms, expectRenders } from "./trig.testkit";
import { expectSetDistractors, parsePrompt, optionCombinations } from "./trigEquation.testkit";
import { trigEquationsMultipleAngle } from "./trigEquationsMultipleAngle.answer.testkit";

const FORMS = ["mixed", "double", "half", "sumDifference"] as const;
const anyParams = fc.record({
  form: fc.constantFrom(...FORMS),
  unit: fc.constantFrom("radians", "degrees"),
  solutions: fc.constantFrom("interval", "general"),
});

describe("trig-equations-multiple-angle: answers", () => {
  it("the Answer is exactly the printed equation's solution set", () => {
    for (const params of optionCombinations(generator.schema)) {
      fc.assert(fc.property(anySeed, (seed) => {
        const p = generator.generate(params, seed);
        trigEquationsMultipleAngle(p);
      }), { numRuns: 20 });
    }
  }, 60_000);

  it("prints fractions of π in lowest terms and no 1 coefficients, + 0 or double signs", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectLowestTerms(p.answer);
        expect(p.prompt).not.toMatch(/(^|[^0-9.])1 \\(sin|cos|tan)/);
        expect(p.prompt).not.toMatch(/[+-] 0(?![.\d])/);
        expect(p.prompt).not.toMatch(/[+-] [+-]|--/);
      }),
    );
  });
});

describe("trig-equations-multiple-angle: Topic Options", () => {
  it("uses the identities asked for, and all of them when mixed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        if (params.form !== "mixed") expect(k.form).toBe(params.form);
        if (k.form === "double") expect(p.prompt).toMatch(/2(x|\\theta)/);
        if (k.form === "half") expect(p.prompt).toMatch(/\\frac\{(x|\\theta)\}\{2\}/);
        if (k.form === "sumDifference") expect(p.prompt).toMatch(/\\frac\{\\pi\}\{[346]\}|(30|45|60)\^\{\\circ\}/);
      }),
    );
    const forms = new Set(Array.from({ length: 60 }, (_, s) => construct({}, createRng(s)).form));
    expect(forms).toEqual(new Set(["double", "half", "sumDifference"]));
  });

  it("states the interval or asks for all solutions, in the unit asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const q = parsePrompt(p.prompt);
        expect(q.general).toBe(params.solutions === "general");
        expect(q.v).toBe(params.unit === "degrees" ? "theta" : "x");
        if (params.unit === "degrees") expect(p.answer).toMatch(/\^\{\\circ\}/);
        else expect(p.answer).not.toMatch(/circ/);
      }),
    );
  });

  it("gives half-angle general solutions a period of 4π", () => {
    const p = generator.generate({ form: "half", solutions: "general" }, 7);
    expect(p.answer).toMatch(/4\\pi k/);
  });
});

describe("trig-equations-multiple-angle: distractors", () => {
  it("are at least three, distinct, and never the Answer's solution set", () => {
    fc.assert(fc.property(anySeed, anyParams, (seed, params) => expectSetDistractors(generator.generate(params, seed))));
  });
});

describe("trig-equations-multiple-angle: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("prompt, answer and distractors all render with KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const tex of [p.prompt, p.answer, ...p.distractorHints]) expectRenders(tex);
      }),
      { numRuns: 100 },
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const form of FORMS) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ form }, s).prompt));
      expect(prompts.size, form).toBeGreaterThan(40);
    }
  });
});
