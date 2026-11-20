import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { construct, generator, type NumberSet } from "./classifyingNumbers";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  includeNatural: fc.boolean(),
  includeRoots: fc.boolean(),
  disguised: fc.boolean(),
});

/**
 * Classify a printed number from its LaTeX alone, independently of the
 * generator: \pi, a never-repeating pattern (\ldots) or the root of a
 * non-square is irrational; otherwise the exact value decides.
 */
function classify(latex: string): { irrational: true } | { irrational: false; value: number } {
  if (latex.includes("\\pi") || latex.includes("\\ldots")) return { irrational: true };
  const root = latex.match(/\\sqrt\{(\d+)\}/);
  if (root && !Number.isInteger(Math.sqrt(Number(root[1])))) return { irrational: true };
  const sign = latex.startsWith("-") ? -1 : 1;
  const body = latex.replace(/^-/, "");
  let value: number;
  let m: RegExpMatchArray | null;
  if ((m = body.match(/^\\sqrt\{\\frac\{(\d+)\}\{(\d+)\}\}$/))) value = Math.sqrt(Number(m[1])) / Math.sqrt(Number(m[2]));
  else if ((m = body.match(/^\\sqrt\{(\d+)\}$/))) value = Math.sqrt(Number(m[1]));
  else if ((m = body.match(/^(\d+)\.\\overline\{(\d+)\}$/))) value = Number(m[1]) + Number(m[2]) / (10 ** m[2].length - 1);
  else if ((m = body.match(/^(\d+)\\frac\{(\d+)\}\{(\d+)\}$/))) value = Number(m[1]) + Number(m[2]) / Number(m[3]);
  else if ((m = body.match(/^\\frac\{(\d+)\}\{(\d+)\}$/))) value = Number(m[1]) / Number(m[2]);
  else if (/^\d+(\.\d+)?$/.test(body)) value = Number(body);
  else throw new Error(`cannot read ${latex}`);
  return { irrational: false, value: sign * value };
}

function expectedSets(latex: string, includeNatural: boolean): NumberSet[] {
  const c = classify(latex);
  let sets: NumberSet[];
  if (c.irrational) sets = ["irrational"];
  else {
    const isInt = Math.abs(c.value - Math.round(c.value)) < 1e-9;
    const v = Math.round(c.value);
    if (!isInt) sets = ["rational"];
    else if (v > 0) sets = ["natural", "whole", "integer", "rational"];
    else if (v === 0) sets = ["whole", "integer", "rational"];
    else sets = ["integer", "rational"];
  }
  return includeNatural ? sets : sets.filter((s) => s !== "natural");
}

const setsOf = (answer: string) => answer.replace(/^\\text\{|\}$/g, "").split(", ");

describe("classifying-numbers: answers", () => {
  it("names exactly the sets the printed number belongs to", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(setsOf(p.answer), p.prompt).toEqual(expectedSets(p.prompt, params.includeNatural));
      }),
      { numRuns: 300 },
    );
  });

  it("covers every kind of number across a sheet", () => {
    const answers = new Set(Array.from({ length: 80 }, (_, s) => generator.generate({}, s).answer));
    expect(answers).toEqual(
      new Set([
        "\\text{natural, whole, integer, rational}",
        "\\text{whole, integer, rational}",
        "\\text{integer, rational}",
        "\\text{rational}",
        "\\text{irrational}",
      ]),
    );
  });
});

describe("classifying-numbers: Topic Options", () => {
  it("leaves out natural numbers, and drops roots or disguises, when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        if (!params.includeNatural) expect(p.answer + p.distractorHints.join()).not.toContain("natural");
        if (!params.includeRoots) expect(p.prompt).not.toContain("\\sqrt");
        const k = construct(params, createRng(seed));
        if (!params.disguised && (k.kind === "natural" || k.kind === "negative" || k.kind === "zero")) {
          expect(p.prompt).toMatch(/^-?\d+$/);
        }
      }),
    );
  });
});

describe("classifying-numbers: Distractors", () => {
  it("are at least four distinct, well-formed chains, never the Answer", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        for (const d of p.distractorHints) expect(d).toMatch(/^\\text\{[a-z]+(, [a-z]+)*\}$/);
      }),
    );
  });

  it("lead with the mistake the number invites", () => {
    // a disguised natural number written as a root is mistaken for irrational
    const roots = Array.from({ length: 400 }, (_, s) => generator.generate({}, s)).filter((p) => /^\\sqrt\{\d+\}$/.test(p.prompt) && p.answer.includes("natural"));
    expect(roots.length).toBeGreaterThan(0);
    for (const p of roots) expect(p.distractorHints[0]).toBe("\\text{irrational}");
    // a repeating decimal is mistaken for irrational
    const repeating = Array.from({ length: 400 }, (_, s) => generator.generate({}, s)).filter((p) => p.prompt.includes("overline"));
    expect(repeating.length).toBeGreaterThan(0);
    for (const p of repeating) expect(p.distractorHints[0]).toBe("\\text{irrational}");
  });
});

describe("classifying-numbers: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section", () => {
    const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({}, s).prompt));
    expect(prompts.size).toBeGreaterThan(120);
  });
});
