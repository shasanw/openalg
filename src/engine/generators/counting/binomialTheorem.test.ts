import { binomialTheorem, readMonomial } from "./binomialTheorem.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, MAX_COEFFICIENT, MAX_EXPAND_POWER } from "./binomialTheorem";
import { expectKatex, expectTidy, readCount } from "../shared/matrices.testkit";
import { nCr } from "./counting.testUtil";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  task: fc.constantFrom("expand", "term", "coefficient", "mixed"),
  maxPower: fc.integer({ min: 3, max: 8 }),
  twoVariables: fc.boolean(),
});

describe("binomial-theorem: answers", () => {
  it("an expansion equals the power at sample points, and a term or coefficient is C(n, k) a^(n-k) b^k", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        binomialTheorem(p);
      }),
    );
  });

  it("prints tidy LaTeX that renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const s of [p.prompt, p.answer, ...p.distractorHints]) expectTidy(s);
        expectKatex(p.prompt);
        expectKatex(p.answer);
      }),
    );
  });
});

describe("binomial-theorem: Topic Options", () => {
  it("gives the task asked for, powers up to Highest power (expansions up to 6), and modest coefficients", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.task !== "mixed") expect(k.task).toBe(params.task);
        expect(k.n).toBeGreaterThanOrEqual(3);
        expect(k.n).toBeLessThanOrEqual(k.task === "expand" ? Math.min(params.maxPower, MAX_EXPAND_POWER) : params.maxPower);
        expect(k.k).toBeGreaterThanOrEqual(1);
        expect(k.k).toBeLessThanOrEqual(k.n - 1);
        for (let i = 0; i <= k.n; i++) expect(Math.abs(nCr(k.n, i) * k.a ** (k.n - i) * k.b ** i)).toBeLessThanOrEqual(MAX_COEFFICIENT);
        // never (x + y)^n or (x - 1)^n, where most slips vanish
        expect(Math.abs(k.a) + Math.abs(k.b)).toBeGreaterThanOrEqual(3);
      }),
    );
  });
});

describe("binomial-theorem: distractors", () => {
  it("are distinct, never the Answer, in the Answer's shape, and at least two", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(2);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        const k = construct(params, createRng(seed));
        for (const d of p.distractorHints) {
          if (k.task === "coefficient") readCount(d.replace(/^-/, ""));
          if (k.task === "term") readMonomial(d);
        }
      }),
    );
  });

  it("model the freshman's dream, a missing binomial coefficient and the term one place off", () => {
    const base = { a: 2, b: -3, n: 5, twoVariables: true, k: 3 };
    const expand = distractors({ ...base, task: "expand" });
    expect(expand[0]).toBe("32x^{5} - 243y^{5}");
    expect(expand[1]).toBe("32x^{5} - 48x^{4}y + 72x^{3}y^{2} - 108x^{2}y^{3} + 162xy^{4} - 243y^{5}");
    // the 4th term of (2x - 3y)^5 is -1080x^2y^3; the 5th is 810xy^4
    expect(distractors({ ...base, task: "term" })[0]).toBe("810xy^{4}");
  });
});

describe("binomial-theorem: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const task of ["expand", "term", "coefficient"]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ task }, s).prompt));
      expect(prompts.size, task).toBeGreaterThan(40);
    }
  });
});
