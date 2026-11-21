import { describe, expect, it } from "vitest";
import fc from "fast-check";
import katex from "katex";
import { createRng } from "../../rng";
import { construct, distractors, exactLatex, generator, type AnswerForm } from "./exponentialEquationsLogs";
import { numberBase } from "./logKit";
import { rat } from "../shared/equationKit";
import { close, evalLatex, splitEquation } from "../shared/latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const FORMS: AnswerForm[] = ["exact", "decimal", "both"];
const anyParams = fc.record({
  answerForm: fc.constantFrom(...FORMS),
  decimalPlaces: fc.integer({ min: 1, max: 4 }),
  isolate: fc.boolean(),
  naturalCommon: fc.boolean(),
});

const E = { e: Math.E };
/** The exact value of "x = <exact>" (or the exact part of "x = <exact> \approx 1.23"). */
const exactValue = (answer: string) => evalLatex(answer.split("=")[1].split("\\approx")[0], E);
const rounded = (answer: string) => answer.split("\\approx")[1].trim();

function satisfies(prompt: string, x: number): boolean {
  const [l, r] = splitEquation(prompt);
  return close(evalLatex(l, { ...E, x }), evalLatex(r, { ...E, x }), 1e-9);
}

describe("exponential-equations-logs: answers", () => {
  it("the exact Answer makes the printed equation true", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, answerForm: "exact" }, seed);
        expect(p.answer).toMatch(/^x = /);
        expect(p.answer).toMatch(/\\ln|\\log/);
        const x = exactValue(p.answer);
        expect(satisfies(p.prompt, x)).toBe(true);
        expect(satisfies(p.prompt, x + 0.01)).toBe(false);
      }),
    );
  });

  it("the rounded Answer is the exact Answer rounded, for the same Problem", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const exact = generator.generate({ ...params, answerForm: "exact" }, seed);
        const x = exactValue(exact.answer);
        const places = params.decimalPlaces;
        const dec = generator.generate({ ...params, answerForm: "decimal" }, seed);
        expect(dec.prompt).toBe(exact.prompt);
        expect(dec.answer).toMatch(/^x \\approx -?\d+\.\d+$/);
        expect(rounded(dec.answer).split(".")[1]).toHaveLength(places);
        expect(Math.abs(Number(rounded(dec.answer)) - x)).toBeLessThanOrEqual(0.5 * 10 ** -places + 1e-12);
        const both = generator.generate({ ...params, answerForm: "both" }, seed);
        expect(both.answer).toBe(`${exact.answer} \\approx ${rounded(dec.answer)}`);
      }),
    );
  });

  it("never asks for a log that is rational (that is the common-base Topic)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, answerForm: "exact" }, seed);
        const x = exactValue(p.answer);
        // a rational log_b N would make x a fraction with a small denominator
        for (let den = 1; den <= 12; den++) expect(close(x * den, Math.round(x * den), 1e-9)).toBe(false);
      }),
    );
  });

  it("prints exact Answers in the usual shapes", () => {
    expect(exactLatex("\\ln 7", "\\ln 3", 1, 2)).toBe("\\frac{\\ln 7}{\\ln 3} - 2");
    expect(exactLatex("\\ln 7", "\\ln 3", 1, 0)).toBe("\\frac{\\ln 7}{\\ln 3}");
    expect(exactLatex("\\ln 7", "\\ln 3", 2, 0)).toBe("\\frac{\\ln 7}{2\\ln 3}");
    expect(exactLatex("\\ln 7", "\\ln 3", 3, -2)).toBe("\\frac{\\ln 7 + 2\\ln 3}{3\\ln 3}");
    expect(exactLatex("\\ln 5", null, 1, -1)).toBe("\\ln 5 + 1");
    expect(exactLatex("\\log 5", null, 2, 0)).toBe("\\frac{\\log 5}{2}");
  });
});

describe("exponential-equations-logs: Topic Options", () => {
  it("isolates only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, isolate: false }, createRng(seed));
        expect(k.k).toBe(1);
        expect(k.d).toBe(0);
        const j = construct({ ...params, isolate: true }, createRng(seed));
        expect(j.k !== 1 || j.d !== 0).toBe(true);
      }),
    );
  });

  it("uses base e and 10 only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(construct({ ...params, naturalCommon: false }, createRng(seed)).base.kind).toBe("number");
      }),
    );
    const kinds = new Set(Array.from({ length: 60 }, (_, s) => construct({}, createRng(s)).base.kind));
    expect(kinds).toEqual(new Set(["number", "common", "natural"]));
  });
});

describe("exponential-equations-logs: distractors", () => {
  it("are distinct, never the Answer's value, in the Answer's form, and at least two", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(2);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        const x = exactValue(generator.generate({ ...params, answerForm: "exact" }, seed).answer);
        for (const d of p.distractorHints) {
          if (params.answerForm === "decimal") {
            expect(d).toMatch(/^x \\approx -?\d+\.\d+$/);
            expect(rounded(d)).not.toBe(rounded(p.answer));
          } else expect(close(exactValue(d), x)).toBe(false);
        }
      }),
    );
  });

  it("model dividing by the base and the quotient of logarithms", () => {
    // 3^{x} = 7
    const k = { base: numberBase(rat(3)), a: 1, c: 0, n: 7, k: 1, d: 0, rhs: 7 };
    expect(distractors(k, "exact", 2).slice(0, 2)).toEqual(["x = \\frac{7}{3}", "x = \\ln 7 - \\ln 3"]);
  });
});

describe("exponential-equations-logs: generate()", () => {
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
    for (const isolate of [false, true]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ isolate }, s).prompt));
      expect(prompts.size).toBeGreaterThan(150);
    }
  });
});
