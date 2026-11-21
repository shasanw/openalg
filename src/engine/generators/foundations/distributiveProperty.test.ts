import { choiceKey } from "../../mc";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, type DistributiveConstruction, type Multiplier } from "./distributiveProperty";
import { rat } from "../shared/equationKit";
import { close, evalLatex } from "../shared/latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  multiplier: fc.constantFrom<Multiplier>("integer", "fraction", "variable"),
  terms: fc.integer({ min: 2, max: 3 }),
  combineLikeTerms: fc.boolean(),
  allowNegatives: fc.boolean(),
  maxCoefficient: fc.integer({ min: 2, max: 12 }),
  varyVariable: fc.boolean(),
});

const PROBES = [-2.5, -1, 0.5, 2, 3.7];

/** Are two printed expressions in v the same function (at several points)? */
function sameExpression(a: string, b: string, v: string): boolean {
  return PROBES.every((x) => close(evalLatex(a, { [v]: x }), evalLatex(b, { [v]: x })));
}

describe("distributive-property: answers", () => {
  it("the Answer equals the printed expression for every value of the variable", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const k = construct(params, createRng(seed));
        expect(sameExpression(p.prompt, p.answer, k.v), `${p.prompt} = ${p.answer}`).toBe(true);
      }),
    );
  });

  it("the Answer has no parentheses, and each power of the variable at most once", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const k = construct(params, createRng(seed));
        expect(p.answer).not.toContain("(");
        const degs = k.answer.map((t) => t.deg);
        expect(new Set(degs).size).toBe(degs.length);
        expect(p.answer).not.toMatch(/(^|[^0-9.])1[a-z]/);
        expect(p.prompt + p.answer).not.toMatch(/[+-] [+-]|--|\+-|-\+/);
      }),
    );
  });
});

describe("distributive-property: Topic Options", () => {
  it("puts the requested number of terms in the parentheses, and multiplies every one", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(k.group.inner).toHaveLength(params.terms);
        if (!params.combineLikeTerms) expect(k.answer).toHaveLength(params.terms);
      }),
    );
  });

  it("uses the chosen kind of multiplier", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const m = k.group.mult;
        if (params.multiplier === "integer") expect(m.deg === 0 && m.coef.d === 1).toBe(true);
        if (params.multiplier === "fraction") expect(m.deg === 0 && m.coef.d > 1).toBe(true);
        if (params.multiplier === "variable") expect(m.deg).toBe(1);
        // a fraction multiplier still leaves whole-number coefficients
        for (const t of k.answer) if (!params.combineLikeTerms) expect(t.coef.d).toBe(1);
      }),
    );
  });

  it("adds something to combine only when asked, and then the Answer is in standard form", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(k.extra !== null).toBe(params.combineLikeTerms);
        if (params.combineLikeTerms) {
          const degs = k.answer.map((t) => t.deg);
          expect(degs).toEqual([...degs].sort((a, b) => b - a));
        }
      }),
    );
  });

  it("prints no negative numbers when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        expect(p.prompt + p.answer).not.toContain("-");
      }),
    );
  });
});

describe("distributive-property: Distractors", () => {
  it("are distinct, never equal to the Answer, and at least four", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const k = construct(params, createRng(seed));
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        expect(new Set(p.distractorHints.map(choiceKey)).size).toBe(p.distractorHints.length);
        const choices = [p.answer, ...p.distractorHints];
        for (const [i, d] of choices.entries()) {
          for (const earlier of choices.slice(0, i)) expect(sameExpression(d, earlier, k.v), d).toBe(false);
        }
      }),
    );
  });

  it("model the real mistakes", () => {
    // -4(2x - 3) = -8x + 12
    const k: DistributiveConstruction = {
      v: "x",
      group: { mult: { coef: rat(-4), deg: 0 }, inner: [{ coef: rat(2), deg: 1 }, { coef: rat(-3), deg: 0 }] },
      extra: null,
      combined: false,
      answer: [{ coef: rat(-8), deg: 1 }, { coef: rat(12), deg: 0 }],
    };
    expect(distractors(k).slice(0, 2)).toEqual(["-8x - 12", "-8x - 3"]);
    // x(2x + 3) = 2x^2 + 3x: powers not added gives 2x + 3x = 5x
    const v: DistributiveConstruction = {
      v: "x",
      group: { mult: { coef: rat(1), deg: 1 }, inner: [{ coef: rat(2), deg: 1 }, { coef: rat(3), deg: 0 }] },
      extra: null,
      combined: false,
      answer: [{ coef: rat(2), deg: 2 }, { coef: rat(3), deg: 1 }],
    };
    expect(distractors(v)).toContain("5x");
    expect(distractors(v)).toContain("2x + 3"); // omitted the outside factor
  });
});

describe("distributive-property: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({}, s).prompt));
    expect(prompts.size).toBeGreaterThan(150);
  });
});

describe("distributive-property: soak regressions", () => {
  it("keeps four Distractors for 2(t + 2) + 2(2 + t) (seed 989682511)", () => {
    const params = { multiplier: "integer", terms: 2, combineLikeTerms: true, allowNegatives: false, maxCoefficient: 2, varyVariable: true };
    const p = generator.generate(params, 989682511);
    expect(p.prompt).toBe("2(t + 2) + 2(2 + t)");
    expect(p.answer).toBe("4t + 8");
    expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
    expect(new Set(p.distractorHints.map(choiceKey)).size).toBe(p.distractorHints.length);
    // the slip in only one group: 2(t + 2) as 2t + 2, the other group worked correctly
    expect(p.distractorHints).toContain("4t + 6");
    // combined the unlike terms 4t + 8 as 12t
    expect(p.distractorHints).toContain("12t");
  });
});
