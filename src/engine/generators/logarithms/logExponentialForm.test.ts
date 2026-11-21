import { describe, expect, it } from "vitest";
import fc from "fast-check";
import katex from "katex";
import { createRng } from "../../rng";
import { construct, distractors, generator, type Direction, type FormConstruction } from "./logExponentialForm";
import { close, evalLatex, splitEquation, type Env } from "../shared/latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const DIRECTIONS: Direction[] = ["mixed", "toLog", "toExponential"];
const anyParams = fc.record({
  direction: fc.constantFrom(...DIRECTIONS),
  negativesAndFractions: fc.boolean(),
  commonNatural: fc.boolean(),
});

/** The env that makes the fact true: e, plus its one letter (if any) at its true value. */
function envOf(k: FormConstruction): Env {
  const env: Env = { e: Math.E };
  const b = k.base.value!;
  if (k.exponent.value === null) env[k.exponent.tex] = Math.log(k.value.value!) / Math.log(b);
  if (k.value.value === null) env[k.value.tex] = b ** k.exponent.value!;
  return env;
}

function holds(statement: string, env: Env): boolean {
  const [l, r] = splitEquation(statement);
  try {
    const [a, b] = [evalLatex(l, env), evalLatex(r, env)];
    return Number.isFinite(a) && Number.isFinite(b) && close(a, b);
  } catch {
    return false; // e.g. a logarithm of a negative number
  }
}

const isLog = (s: string) => /\\log|\\ln/.test(s);

describe("log-exponential-form: answers", () => {
  it("the Problem and the Answer state the same true fact, one in each form", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const k = construct(params, createRng(seed));
        const env = envOf(k);
        expect(holds(p.prompt, env)).toBe(true);
        expect(holds(p.answer, env)).toBe(true);
        expect(isLog(p.prompt)).toBe(!k.toLog);
        expect(isLog(p.answer)).toBe(k.toLog);
        // the same three quantities appear in both
        for (const q of [k.exponent, k.value]) {
          expect(p.prompt).toContain(q.tex);
          expect(p.answer).toContain(q.tex);
        }
      }),
    );
  });

  it("never uses an exponent of 0 or 1, or a base of 1", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect([0, 1]).not.toContain(k.exponent.value);
        expect(k.value.value).not.toBe(1);
        expect(k.base.value).not.toBe(1);
      }),
    );
  });
});

describe("log-exponential-form: Topic Options", () => {
  it("rewrites in the direction asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.direction !== "mixed") expect(k.toLog).toBe(params.direction === "toLog");
      }),
    );
    const both = new Set(Array.from({ length: 30 }, (_, s) => construct({}, createRng(s)).toLog));
    expect(both).toEqual(new Set([true, false]));
  });

  it("uses only positive whole-number exponents unless negatives and fractions are on", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, negativesAndFractions: false }, createRng(seed));
        if (k.exponent.value !== null) {
          expect(Number.isInteger(k.exponent.value)).toBe(true);
          expect(k.exponent.value).toBeGreaterThan(1);
        }
      }),
    );
    const ks = Array.from({ length: 80 }, (_, s) => construct({ negativesAndFractions: true }, createRng(s)));
    expect(ks.some((k) => (k.exponent.value ?? 1) < 0)).toBe(true);
    expect(ks.some((k) => !Number.isInteger(k.exponent.value ?? 1))).toBe(true);
  });

  it("uses common and natural logarithms only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, commonNatural: false }, createRng(seed));
        expect(["10", "e"]).not.toContain(k.base.tex);
      }),
    );
    const bases = new Set(Array.from({ length: 80 }, (_, s) => construct({}, createRng(s)).base.tex));
    expect(bases).toContain("10");
    expect(bases).toContain("e");
  });
});

describe("log-exponential-form: distractors", () => {
  it("are distinct, in the Answer's form, false, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const k = construct(params, createRng(seed));
        const env = envOf(k);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        for (const d of p.distractorHints) {
          expect(d).not.toBe(p.answer);
          expect(isLog(d)).toBe(k.toLog);
          expect(holds(d, env), d).toBe(false);
        }
      }),
    );
  });

  it("put the numbers in the wrong places", () => {
    const k = construct({ direction: "toLog", commonNatural: false, negativesAndFractions: false }, createRng(1));
    const { base: b, exponent: y, value: v } = k;
    expect(distractors(k)[0]).toBe(`\\log_{${b.tex}} ${y.tex} = ${v.tex}`);
  });
});

describe("log-exponential-form: generate()", () => {
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
        for (const tex of [p.prompt, p.answer, ...p.distractorHints]) {
          expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow();
        }
      }),
      { numRuns: 100 },
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const direction of DIRECTIONS) {
      const prompts = new Set(Array.from({ length: 100 }, (_, s) => generator.generate({ direction }, s).prompt));
      expect(prompts.size, direction).toBeGreaterThan(40);
    }
  });
});
