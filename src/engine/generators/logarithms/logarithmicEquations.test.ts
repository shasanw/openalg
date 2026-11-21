import { describe, expect, it } from "vitest";
import fc from "fast-check";
import katex from "katex";
import { createRng } from "../../rng";
import { construct, distractors, exactELatex, generator, type FormMode } from "./logarithmicEquations";
import { close, evalLatex, splitEquation } from "../shared/latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const FORMS: FormMode[] = ["mixed", "exponential", "oneToOne"];
const anyParams = fc.record({
  form: fc.constantFrom(...FORMS),
  extraneous: fc.boolean(),
  naturalCommon: fc.boolean(),
});

const E = { e: Math.E };

/** Whether x makes the printed equation true (false where a logarithm is undefined). */
function satisfies(prompt: string, x: number): boolean {
  const [l, r] = splitEquation(prompt);
  try {
    return close(evalLatex(l, { ...E, x }), evalLatex(r, { ...E, x }), 1e-9);
  } catch {
    return false;
  }
}

/** The values of "x = a, b" (each may use e), or [] for "no solution". */
function values(answer: string): number[] {
  if (answer.includes("\\text")) return [];
  const rhs = answer.split("=")[1];
  return rhs.split(/,(?![^{]*\})/).map((s) => evalLatex(s, E));
}

describe("logarithmic-equations: answers", () => {
  it("every Answer value makes the printed equation true", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const xs = values(p.answer);
        expect(xs.length).toBeGreaterThan(0);
        for (const x of xs) expect(satisfies(p.prompt, x), `${p.prompt} at ${x}`).toBe(true);
        expect(satisfies(p.prompt, xs[0] + 0.37)).toBe(false);
      }),
    );
  });

  it("an extraneous root solves the algebra but makes a logarithm undefined", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (k.extraneous === null) return;
        const p = generator.generate(params, seed);
        expect(satisfies(p.prompt, k.extraneous)).toBe(false);
        expect(k.solutions).not.toContain(k.extraneous);
        const [l] = splitEquation(p.prompt);
        expect(() => evalLatex(l, { ...E, x: k.extraneous! })).toThrow(/non-positive/);
      }),
    );
  });

  it("prints no 1x, + 0 or double signs", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.prompt).not.toMatch(/(^|[^0-9.])1x/);
        expect(p.prompt).not.toMatch(/[+-] 0(?![.\d])/);
        expect(p.prompt).not.toMatch(/[+-] [+-]/);
      }),
    );
  });
});

describe("logarithmic-equations: Topic Options", () => {
  it("uses the kind of equation asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.form === "exponential") expect(["exponential", "sum"]).toContain(k.form);
        if (params.form === "oneToOne") expect(["oneToOne", "quadratic"]).toContain(k.form);
      }),
    );
  });

  it("gives extraneous-solution equations only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, extraneous: false }, createRng(seed));
        expect(["exponential", "oneToOne"]).toContain(k.form);
        expect(k.extraneous).toBeNull();
      }),
    );
    const ks = Array.from({ length: 60 }, (_, s) => construct({ extraneous: true }, createRng(s)));
    expect(new Set(ks.map((k) => k.form))).toEqual(new Set(["exponential", "oneToOne", "sum", "quadratic"]));
    expect(ks.some((k) => k.extraneous !== null)).toBe(true);
  });

  it("uses ln and log only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, naturalCommon: false }, seed);
        expect(p.prompt).not.toMatch(/\\ln|\\log [^_]|\\log \(/);
      }),
    );
    const kinds = new Set(Array.from({ length: 80 }, (_, s) => construct({}, createRng(s)).base.kind));
    expect(kinds).toEqual(new Set(["number", "common", "natural"]));
  });
});

describe("logarithmic-equations: distractors", () => {
  it("are distinct, never the Answer, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        const answer = values(p.answer);
        for (const d of p.distractorHints) {
          const v = values(d);
          const same = v.length === answer.length && v.every((x, i) => close(x, answer[i]));
          expect(same, d).toBe(false);
        }
      }),
    );
  });

  it("lead with keeping the extraneous root", () => {
    for (let s = 0; s < 200; s++) {
      const k = construct({ extraneous: true, form: "exponential" }, createRng(s));
      if (k.form !== "sum") continue;
      const [first] = distractors(k);
      expect(values(first)).toHaveLength(2);
      return;
    }
    throw new Error("no sum-of-logs Problem in 200 seeds");
  });

  it("prints exact e answers", () => {
    expect(exactELatex(3, 1, 2)).toBe("x = e^{3} - 2");
    expect(exactELatex(1, 2, -5)).toBe("x = \\frac{e + 5}{2}");
  });
});

describe("logarithmic-equations: generate()", () => {
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
    for (const form of FORMS) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ form }, s).prompt));
      expect(prompts.size, form).toBeGreaterThan(150);
    }
  });
});
