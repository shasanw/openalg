import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, schema } from "./factoringGcf";
import { coefGcd, mono, mul } from "./polyKit";
import {
  anyParams,
  anySeed,
  expectGoodHints,
  expectHintsWrongInValue,
  expectKatex,
  expectTidy,
  sameValue,
} from "./polynomials.testkit";

const params = anyParams(schema);

describe("factoring-gcf: answers", () => {
  it("the Answer multiplies back out to the Problem", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expect(sameValue(p.prompt, p.answer), `${p.prompt} = ${p.answer}`).toBe(true);
      }),
    );
  });

  it("takes out the GREATEST common factor: nothing common is left inside", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        expect(coefGcd(k.inner)).toBe(1);
        expect(Math.min(...k.inner.map((t) => t.e[0]))).toBe(0);
        expect(Math.min(...k.inner.map((t) => t.e[1]))).toBe(0);
        expect(k.inner.length).toBeGreaterThanOrEqual(2);
        // the GCF is never just 1
        expect(k.gcf.c > 1 || k.gcf.e[0] + k.gcf.e[1] > 0).toBe(true);
      }),
    );
  });

  it("honours the term count, the GCF size and the variables", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        expect(k.expanded.length).toBeLessThanOrEqual(ps.terms as number);
        expect(k.gcf.c).toBeLessThanOrEqual(ps.maxGcf as number);
        if (!ps.variableGcf) expect(k.gcf.e).toEqual([0, 0]);
        if (!ps.twoVariables) expect(k.expanded.every((t) => t.e[1] === 0)).toBe(true);
      }),
    );
  });

  it("is deterministic, tidy, and renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expect(generator.generate(ps, seed)).toEqual(p);
        for (const t of [p.prompt, p.answer]) {
          expectTidy(t);
          expectKatex(t);
        }
      }),
    );
  });
});

describe("factoring-gcf: distractors", () => {
  it("are distinct, never the Answer, and wrong in value (no unfinished-but-equal choices)", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expectGoodHints(p, 4);
        expectHintsWrongInValue(p);
      }),
    );
  });

  it("6x^3 + 3x = 3x(2x^2 + 1): offers the unreduced powers, the dropped 1 and a partial GCF", () => {
    const gcf = mono(3, 1);
    const inner = [mono(2, 2), mono(1)];
    const out = distractors({ vars: ["x", "y"], gcf, inner, expanded: mul([gcf], inner) });
    expect(out).toContain("3x(2x^{2} + 3x)"); // last term left undivided
    expect(out[0]).toBe("3x(2x^{3} + x)");
    expect(out).toContain("3x(2x^{2})");
    expect(out).toContain("3(2x^{2} + 1)");
    expect(out).toContain("x(2x^{2} + 1)");
  });
});
