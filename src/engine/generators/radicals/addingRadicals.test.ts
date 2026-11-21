import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { answerTerms, construct, generator, printedTerm } from "./addingRadicals";
import { isSimplified, likeKey } from "./radicalKit";
import { anySeed, commonChecks, expectSimplest, expectValueDistractors, sameValue, valuesOf } from "./radicals.testkit";

const anyParams = fc.record({
  terms: fc.integer({ min: 2, max: 4 }),
  simplifyFirst: fc.boolean(),
  unlike: fc.boolean(),
  cubeRoots: fc.boolean(),
  variables: fc.boolean(),
});

describe("adding-radicals: answers", () => {
  it("the Answer equals the printed sum, simplified with like terms combined", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(sameValue(p.prompt, p.answer), `${p.prompt} = ${p.answer}`).toBe(true);
        expectSimplest(p.answer);
        const terms = answerTerms(construct(params, createRng(seed)));
        expect(terms.length).toBeGreaterThan(0);
        expect(new Set(terms.map(likeKey)).size).toBe(terms.length);
      }),
    );
  });
});

describe("adding-radicals: Topic Options", () => {
  it("prints the number of terms asked for, simplified only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        expect(k.terms).toHaveLength(params.terms);
        const printed = k.terms.map((a) => printedTerm(k, a));
        if (params.simplifyFirst) expect(printed.some((t) => !isSimplified(t))).toBe(true);
        else expect(printed.every(isSimplified)).toBe(true);
        if (!params.unlike) expect(answerTerms(k)).toHaveLength(1);
        if (!params.cubeRoots) expect(p.prompt).not.toContain("\\sqrt[3]");
        if (!params.variables) expect(p.prompt + p.answer).not.toContain("x");
      }),
    );
    const sizes = new Set(Array.from({ length: 60 }, (_, s) => answerTerms(construct({ unlike: true }, createRng(s))).length));
    expect(sizes).toEqual(new Set([1, 2]));
  });
});

describe("adding-radicals: distractors", () => {
  it("are distinct wrong values, at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectValueDistractors(p.answer, p.distractorHints);
      }),
    );
  });

  it("lead with adding the radicands as well as the coefficients", () => {
    let checked = 0;
    for (let seed = 0; seed < 100; seed++) {
      const k = construct({}, createRng(seed));
      const p = generator.generate({}, seed);
      const coef = k.terms.reduce((s, a) => s + a.k, 0);
      const inside = k.terms.reduce((s, a) => s + printedTerm(k, a).rad.n, 0);
      const wrong = coef * Math.sqrt(inside);
      if (coef === 0 || Math.abs(wrong - valuesOf(p.answer)[0]) < 1e-9) continue;
      expect(valuesOf(p.distractorHints[0])[0]).toBeCloseTo(wrong, 9);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe("adding-radicals: generate()", () => {
  it("is deterministic, renders, and has variety", () => {
    commonChecks(generator, anyParams, [{}, { terms: 2 }, { unlike: true, variables: true }], 150);
  });
});
