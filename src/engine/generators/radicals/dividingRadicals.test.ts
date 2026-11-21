import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { answerFraction, construct, generator } from "./dividingRadicals";
import { anySeed, commonChecks, expectSimplest, expectValueDistractors, sameValue } from "./radicals.testkit";
import { gcd } from "../../format";

const anyParams = fc.record({
  form: fc.constantFrom("mixed", "monomial", "binomial"),
  cubeRoots: fc.boolean(),
  variables: fc.boolean(),
});

describe("dividing-radicals: answers", () => {
  it("the Answer equals the printed quotient, with no radical in its denominator", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(sameValue(p.prompt, p.answer), `${p.prompt} = ${p.answer}`).toBe(true);
        expectSimplest(p.answer);
      }),
    );
  });

  it("is reduced: no whole number divides the denominator and every numerator coefficient", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const f = answerFraction(construct(params, createRng(seed)));
        expect(f.den.n).toBeGreaterThan(0);
        const g = f.num.reduce((g, t) => gcd(g, t.coef.n), f.den.n);
        expect(g).toBe(1);
      }),
    );
  });
});

describe("dividing-radicals: Topic Options", () => {
  it("uses the denominators asked for, and cube roots and variables only when on", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        if (params.form === "binomial") expect(k.bin).not.toBeNull();
        if (params.form === "monomial") expect(k.bin).toBeNull();
        if (!params.cubeRoots) expect(p.prompt).not.toContain("\\sqrt[3]");
        if (!params.variables) expect(p.prompt + p.answer).not.toContain("x");
        // a binomial denominator never leads with a minus
        if (k.bin) expect(p.prompt).not.toMatch(/\}\{-/);
      }),
    );
    const kinds = new Set(Array.from({ length: 120 }, (_, s) => construct({}, createRng(s)).kind));
    expect(kinds).toEqual(new Set(["number", "quotient", "rootOfFraction", "conjugate"]));
    expect(Array.from({ length: 60 }, (_, s) => generator.generate({ cubeRoots: true, form: "monomial" }, s).prompt).some((q) => q.includes("\\sqrt[3]"))).toBe(true);
  });
});

describe("dividing-radicals: distractors", () => {
  it("are distinct wrong values, at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectValueDistractors(p.answer, p.distractorHints);
      }),
    );
  });

  it("lead with rationalizing only the bottom, or a conjugate sign slip", () => {
    expect(generator.generate({ form: "binomial" }, 1).distractorHints.length).toBeGreaterThan(2);
    for (let s = 0; s < 100; s++) {
      const k = construct({ form: "monomial" }, createRng(s));
      if (k.kind !== "number" || k.index !== 2) continue;
      // k / (c\sqrt{R}) as k / (cR): no radical anywhere
      expect(generator.generate({ form: "monomial" }, s).distractorHints[0]).not.toContain("\\sqrt");
      return;
    }
    throw new Error("no number-over-root Problem in 100 seeds");
  });
});

describe("dividing-radicals: generate()", () => {
  it("is deterministic, renders, and has variety", () => {
    commonChecks(generator, anyParams, [{}, { form: "monomial" }, { form: "binomial" }, { variables: true, cubeRoots: true }], 120);
  });
});
