import { describe, expect, it } from "vitest";
import fc from "fast-check";
import katex from "katex";
import { createRng } from "../../rng";
import { construct, distractors, generator, type Direction, type LogType } from "./logProperties";
import { rat } from "../shared/equationKit";
import { numberBase } from "./logKit";
import { close, evalLatex, type Env } from "../shared/latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const DIRECTIONS: Direction[] = ["expand", "condense", "mixed"];
const LOG_TYPES: LogType[] = ["mixed", "number", "common", "natural"];
const anyParams = fc.record({
  direction: fc.constantFrom(...DIRECTIONS),
  terms: fc.integer({ min: 2, max: 4 }),
  roots: fc.boolean(),
  numbers: fc.boolean(),
  logType: fc.constantFrom(...LOG_TYPES),
});

/** Two sample points with positive variables (logarithms need them). */
const POINTS: Env[] = [
  { x: 2.3, y: 5.7, z: 1.9, w: 3.1, e: Math.E },
  { x: 0.7, y: 11.2, z: 4.4, w: 0.35, e: Math.E },
];

const at = (tex: string, env: Env) => evalLatex(tex, env);
/** Equal at every sample point; a side undefined there (a log of a negative) is not equal. */
const equivalent = (a: string, b: string) =>
  POINTS.every((env) => {
    try {
      return close(at(a, env), at(b, env), 1e-9);
    } catch {
      return false;
    }
  });
const singleLog = (s: string) => (s.match(/\\log|\\ln/g) ?? []).length === 1;

describe("log-properties: answers", () => {
  it("the Answer equals the Problem for any positive values of the variables", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(equivalent(p.prompt, p.answer)).toBe(true);
      }),
    );
  });

  it("expands to one logarithm per factor, or condenses to a single logarithm", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const k = construct(params, createRng(seed));
        const [single, sum] = k.expand ? [p.prompt, p.answer] : [p.answer, p.prompt];
        expect(singleLog(single)).toBe(true);
        expect((sum.match(/\\log|\\ln/g) ?? []).length).toBe(k.factors.length);
        expect(k.factors.length + (k.k !== 0 ? 1 : 0)).toBe(params.terms);
      }),
    );
  });

  it("prints no 1 coefficients, 1 exponents or double signs", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const s of [p.prompt, p.answer]) {
          expect(s).not.toMatch(/(^|[^0-9}])1\\l/);
          expect(s).not.toMatch(/\^\{1\}/);
          expect(s).not.toMatch(/[+-] [+-]/);
        }
      }),
    );
  });
});

describe("log-properties: Topic Options", () => {
  it("expands or condenses as asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.direction !== "mixed") expect(k.expand).toBe(params.direction === "expand");
      }),
    );
  });

  it("uses fraction coefficients only with roots on", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, roots: false }, seed);
        expect(p.prompt + p.answer).not.toContain("\\sqrt");
      }),
    );
    const some = Array.from({ length: 40 }, (_, s) => generator.generate({ roots: true }, s).prompt);
    expect(some.some((s) => s.includes("\\sqrt") || s.includes("\\frac{1}{"))).toBe(true);
  });

  it("includes a number term only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(construct({ ...params, numbers: false }, createRng(seed)).k).toBe(0);
      }),
    );
    const ks = Array.from({ length: 40 }, (_, s) => construct({ numbers: true }, createRng(s)).k);
    expect(ks.some((k) => k !== 0)).toBe(true);
  });

  it("uses the kind of logarithm asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, logType: "natural" }, seed);
        expect(p.prompt).toContain("\\ln");
        expect(p.prompt).not.toContain("\\log");
        const q = generator.generate({ ...params, logType: "number" }, seed);
        expect(q.prompt).toContain("\\log_{");
        expect(q.prompt).not.toContain("\\ln");
        const r = generator.generate({ ...params, logType: "common" }, seed);
        expect(r.prompt).not.toMatch(/\\log_|\\ln/);
      }),
    );
  });
});

describe("log-properties: distractors", () => {
  it("are distinct, never equivalent to the Answer, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        for (const d of p.distractorHints) expect(equivalent(d, p.answer), d).toBe(false);
      }),
    );
  });

  it("model the quotient and power rule mistakes", () => {
    // log_3 (x^2 / y): 2log_3 x - log_3 y
    const base = numberBase(rat(3));
    const factors = [
      { v: "x", e: rat(2) },
      { v: "y", e: rat(-1) },
    ];
    const expand = { expand: true, base, factors, k: 0, order: [0, 1] };
    expect(distractors(expand).slice(0, 2)).toEqual(["2\\log_{3} x + \\log_{3} y", "\\log_{3} x - \\log_{3} y"]);
    const condense = { ...expand, expand: false };
    expect(distractors(condense)[0]).toBe("\\frac{\\log_{3} x^{2}}{\\log_{3} y}");
  });
});

describe("log-properties: generate()", () => {
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
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ direction }, s).prompt));
      expect(prompts.size, direction).toBeGreaterThan(150);
    }
  });
});
