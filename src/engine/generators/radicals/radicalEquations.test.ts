import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator } from "./radicalEquations";
import { close, evalLatex, splitEquation } from "../shared/latexEval.testkit";
import { anySeed, commonChecks } from "./radicals.testkit";

const anyParams = fc.record({
  form: fc.constantFrom("mixed", "number", "bothSides", "linear"),
  isolate: fc.boolean(),
  extraneous: fc.boolean(),
  cubeRoots: fc.boolean(),
});

/** Whether x makes the printed equation true (false where a square root is of a negative). */
function satisfies(prompt: string, x: number): boolean {
  const [l, r] = splitEquation(prompt);
  const L = evalLatex(l, { x });
  const R = evalLatex(r, { x });
  return Number.isFinite(L) && Number.isFinite(R) && close(L, R, 1e-9);
}

/** The values of "x = a, b", or [] for "no solution". */
function values(answer: string): number[] {
  if (answer.includes("\\text")) return [];
  return answer
    .split("=")[1]
    .split(/,(?![^{]*\})/)
    .map((s) => evalLatex(s));
}

describe("radical-equations: answers", () => {
  it("every Answer value makes the printed equation true", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const x of values(p.answer)) expect(satisfies(p.prompt, x), `${p.prompt} at ${x}`).toBe(true);
      }),
    );
  });

  it("an extraneous root fails the printed equation but solves the squared one", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        if (k.solutions.length === 0) expect(k.extraneous.length).toBeGreaterThan(0);
        for (const x of k.extraneous) {
          expect(satisfies(p.prompt, x)).toBe(false);
          expect(k.solutions).not.toContain(x);
          // Squaring loses which root was meant: x satisfies the equation with
          // the negative square root, or (radicals on both sides, both radicands
          // negative) with the radicands' sizes.
          const negative = p.prompt.replace(/\\sqrt\{/g, "(-1)\\sqrt{");
          const sizes = p.prompt.replace(/\\sqrt\{([^}]*)\}/g, "\\sqrt{|$1|}");
          expect(satisfies(negative, x) || satisfies(sizes, x), `${p.prompt} at ${x}`).toBe(true);
        }
      }),
    );
  });
});

describe("radical-equations: Topic Options", () => {
  it("uses the kinds of equation asked for, extraneous solutions and cube roots only when on", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.form !== "mixed") expect(k.form).toBe(params.form);
        if (!params.extraneous) expect(k.extraneous).toEqual([]);
        if (!params.cubeRoots) expect(k.index).toBe(2);
        if (k.index === 3) expect(k.extraneous).toEqual([]);
        if (!params.isolate) expect(generator.generate(params, seed).prompt).toMatch(/^\\sqrt(\[3\])?\{[^}]*\} = /);
      }),
    );
    const ks = Array.from({ length: 120 }, (_, s) => construct({}, createRng(s)));
    expect(new Set(ks.map((k) => k.form))).toEqual(new Set(["number", "bothSides", "linear"]));
    expect(ks.some((k) => k.extraneous.length > 0 && k.solutions.length > 0)).toBe(true);
    expect(ks.some((k) => k.solutions.length === 0)).toBe(true);
    expect(ks.some((k) => k.solutions.length === 2)).toBe(true);
  });
});

describe("radical-equations: distractors", () => {
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
    for (let s = 0; s < 300; s++) {
      const k = construct({ form: "linear" }, createRng(s));
      if (k.extraneous.length !== 1 || k.solutions.length !== 1) continue;
      expect(values(distractors(k)[0])).toHaveLength(2);
      return;
    }
    throw new Error("no one-extraneous-root Problem in 300 seeds");
  });
});

describe("radical-equations: generate()", () => {
  it("is deterministic, renders, and has variety", () => {
    commonChecks(generator, anyParams, [{}, { form: "number" }, { form: "bothSides" }, { form: "linear" }], 100);
  });
});
