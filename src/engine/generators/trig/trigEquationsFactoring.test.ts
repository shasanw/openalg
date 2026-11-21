import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, generator } from "./trigEquationsFactoring";
import { anySeed, expectLowestTerms, expectRenders } from "./trig.testkit";
import { expectSetDistractors, parsePrompt, satisfies, optionCombinations } from "./trigEquation.testkit";
import { trigEquationsFactoring } from "./trigEquationsFactoring.answer.testkit";
import { radiansValue } from "./trigKit";

const anyParams = fc.record({
  form: fc.constantFrom("mixed", "quadratic", "commonFactor", "identity"),
  unit: fc.constantFrom("radians", "degrees"),
  solutions: fc.constantFrom("interval", "general"),
});

describe("trig-equations-factoring: answers", () => {
  it("the Answer is exactly the printed equation's solution set", () => {
    for (const params of optionCombinations(generator.schema)) {
      fc.assert(fc.property(anySeed, (seed) => {
        const p = generator.generate(params, seed);
        trigEquationsFactoring(p);
      }), { numRuns: 20 });
    }
  }, 60_000);

  it("an extraneous angle solves the factored form but leaves a printed function undefined", () => {
    const params = { form: "commonFactor" };
    for (let seed = 0; seed < 256; seed++) {
      const k = construct(params, createRng(seed));
      if (!k.extraneous.length) continue;
      const q = parsePrompt(generator.generate(params, seed).prompt);
      for (const t of k.extraneous) expect(satisfies(q, radiansValue(t))).toBe(false);
      return;
    }
    throw new Error("No common-factor example exercised an excluded angle");
  });

  it("prints fractions of π in lowest terms and no 1 coefficients, + 0 or double signs", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectLowestTerms(p.answer);
        expect(p.prompt).not.toMatch(/(^|[^0-9.])1 \\(sin|cos|tan|sec|csc|cot)/);
        expect(p.prompt).not.toMatch(/[+-] 0(?![.\d])/);
        expect(p.prompt).not.toMatch(/[+-] [+-]|--/);
      }),
    );
  });
});

describe("trig-equations-factoring: Topic Options", () => {
  it("uses the kind of equation asked for, and all kinds when mixed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.form === "quadratic") expect(k.form).toBe("quadratic");
        if (params.form === "commonFactor") expect(k.form).toBe("commonFactor");
        if (params.form === "identity") expect(["pythagorean", "reciprocal"]).toContain(k.form);
      }),
    );
    const forms = new Set(Array.from({ length: 100 }, (_, s) => construct({}, createRng(s)).form));
    expect(forms).toEqual(new Set(["quadratic", "commonFactor", "pythagorean", "reciprocal"]));
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
});

describe("trig-equations-factoring: distractors", () => {
  it("are at least three, distinct, and never the Answer's solution set", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => expectSetDistractors(generator.generate(params, seed))),
    );
  });

  it("lead with dividing out the common factor", () => {
    const k = construct({ form: "commonFactor" }, createRng(3));
    const [first] = generator.generate({ form: "commonFactor" }, 3).distractorHints;
    expect(first.split(",").length).toBeLessThan(k.solutions.length);
  });
});

describe("trig-equations-factoring: generate()", () => {
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
    for (const form of ["mixed", "quadratic", "commonFactor", "identity"]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ form }, s).prompt));
      expect(prompts.size, form).toBeGreaterThan(40);
    }
  });
});
