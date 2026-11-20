import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { answerTerms, construct, generator } from "./multiplyingRadicals";
import { isSimplified, likeKey, mono, term } from "./radicalKit";
import { anySeed, commonChecks, expectSimplest, expectValueDistractors, sameValue } from "./radicals.testkit";

const anyParams = fc.record({
  form: fc.constantFrom("mixed", "monomial", "distribute", "binomial"),
  cubeRoots: fc.boolean(),
  variables: fc.boolean(),
});

describe("multiplying-radicals: answers", () => {
  it("the Answer equals the printed product, simplified with like terms combined", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(sameValue(p.prompt, p.answer), `${p.prompt} = ${p.answer}`).toBe(true);
        expectSimplest(p.answer);
        const terms = answerTerms(construct(params, createRng(seed)));
        expect(new Set(terms.map(likeKey)).size).toBe(terms.length);
      }),
    );
  });

  it("one-term products always have something to simplify", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, form: "monomial" }, createRng(seed));
        const [[a], [b]] = k.factors;
        expect(isSimplified(term(1, k.index, mono(a.rad.n * b.rad.n, [...a.rad.vars, ...b.rad.vars])))).toBe(false);
      }),
    );
  });
});

describe("multiplying-radicals: Topic Options", () => {
  it("uses the products asked for, and cube roots and variables only when on", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        if (params.form === "monomial") expect(k.factors.map((f) => f.length)).toEqual([1, 1]);
        if (params.form === "distribute") expect(k.factors.map((f) => f.length)).toEqual([1, 2]);
        if (params.form === "binomial") expect(k.factors.map((f) => f.length)).toEqual([2, 2]);
        if (!params.cubeRoots) expect(p.prompt).not.toContain("\\sqrt[3]");
        if (!params.variables) expect(p.prompt + p.answer).not.toContain("x");
      }),
    );
    const forms = new Set(Array.from({ length: 120 }, (_, s) => construct({}, createRng(s)).form));
    expect(forms).toEqual(new Set(["monomial", "distribute", "binomial", "square"]));
  });
});

describe("multiplying-radicals: distractors", () => {
  it("are distinct wrong values, at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectValueDistractors(p.answer, p.distractorHints);
      }),
    );
  });

  it("include the binomial square missing its middle term", () => {
    for (let s = 0; s < 300; s++) {
      const k = construct({ form: "binomial" }, createRng(s));
      if (k.form !== "square") continue;
      const [a, b] = k.factors[0];
      const firstLast = a.coef.n ** 2 + b.coef.n ** 2 * b.rad.n;
      expect(generator.generate({ form: "binomial" }, s).distractorHints[0]).toBe(String(firstLast));
      return;
    }
    throw new Error("no square in 300 seeds");
  });
});

describe("multiplying-radicals: generate()", () => {
  it("is deterministic, renders, and has variety", () => {
    commonChecks(generator, anyParams, [{}, { form: "monomial" }, { form: "distribute" }, { form: "binomial" }], 120);
  });
});
