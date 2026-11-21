import { trigAnyAngle } from "./trigAnyAngle.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { forEachOptionSeed, anySeed, evalTrig, expectLowestTerms, expectRenders } from "./trig.testkit";
import { construct, distractors, generator } from "./trigAnyAngle";
import { angle, writeAngle } from "./trigKit";

const anyParams = fc.record({
  problems: fc.constantFrom("exact", "point", "fromValue", "mixed"),
  functions: fc.constantFrom("primary", "all", "sin", "cos", "tan", "cot", "sec", "csc"),
  units: fc.constantFrom("degrees", "radians", "mixed"),
  otherForms: fc.boolean(),
});

describe("trig-any-angle: answers", () => {
  it("are the values the prompt asks for", () => {
    forEachOptionSeed(generator.schema, (seed, params) => {
      trigAnyAngle(generator.generate(params, seed));
    });
  });
});

describe("trig-any-angle: Topic Options", () => {
  it("gives the problems, functions and units asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        if (params.problems !== "mixed") expect(k.problem).toBe(params.problems);
        if (params.functions === "primary") expect(p.prompt + p.answer).not.toMatch(/\\(csc|sec|cot)/);
        if (k.problem === "exact" && params.units === "degrees") expect(p.prompt).not.toContain("\\pi");
        if (k.problem === "exact" && params.units === "radians") expect(p.prompt).not.toContain("\\circ");
        if (!["primary", "all"].includes(params.functions)) {
          const asked = k.problem === "exact" ? [k.fn] : k.problem === "point" ? k.ask : [k.asked];
          expect(asked).toEqual([params.functions]);
        }
        // never an unreduced whole multiple of π like 3π/3
        if (k.problem === "exact" && k.written.d > 1) expect(k.written.n % k.written.d).not.toBe(0);
        if (k.problem === "exact" && !params.otherForms) {
          const a = k.written.n / k.written.d;
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThan(2);
          expectLowestTerms(p.prompt);
        }
      }),
    );
    const prompts = Array.from({ length: 100 }, (_, s) => generator.generate({ problems: "exact" }, s).prompt);
    expect(prompts.some((s) => s.includes("-"))).toBe(true);
    expect(prompts.some((s) => /\\csc|\\sec|\\cot/.test(s))).toBe(true);
    const kinds = new Set(Array.from({ length: 60 }, (_, s) => construct({}, createRng(s)).problem));
    expect(kinds.size).toBe(3);
  });

  it("asks for every function or one from a point", () => {
    const asks = Array.from({ length: 60 }, (_, s) => construct({ problems: "point" }, createRng(s)))
      .map((k) => (k.problem === "point" ? k.ask.length : 0));
    expect(new Set(asks)).toEqual(new Set([1, 6]));
  });
});

describe("trig-any-angle: distractors", () => {
  it("are distinct, never the Answer, and at least four", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        const values = (s: string) =>
          s.split(ANSWER_PART_SEPARATOR).map((part) => String(evalTrig(part.split(" = ").at(-1)!).toFixed(9)));
        const keys = [p.answer, ...p.distractorHints].map(s => values(s).join(","));
        expect(new Set(keys).size).toBe(keys.length);
      }),
    );
  });

  it("model the usual slips", () => {
    // sin 150° = 1/2: not -1/2 (sign) or -√3/2 (swapped with cos)
    const k = { problem: "exact", fn: "sin", base: angle(5, 6), written: writeAngle(angle(5, 6)), unit: "degrees" } as const;
    expect(distractors(k).slice(0, 2)).toEqual(["-\\frac{1}{2}", "-\\frac{\\sqrt{3}}{2}"]);
    // (-3, 4): cos θ = -3/5, not 3/5, 4/5, or -5/3
    const pt = { problem: "point", x: -3, y: 4, ask: ["cos"] } as const;
    expect(distractors({ ...pt, ask: [...pt.ask] }).slice(0, 3)).toEqual(["\\frac{3}{5}", "\\frac{4}{5}", "-\\frac{5}{3}"]);
  });
});

describe("trig-any-angle: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("prompt, answer and distractors render with KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const tex of [p.prompt, p.answer, ...p.distractorHints]) expectRenders(tex);
      }),
      { numRuns: 100 },
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const problems of ["exact", "point", "fromValue"]) {
      for (const functions of ["primary", "all"]) {
        const prompts = new Set(Array.from({ length: 100 }, (_, s) => generator.generate({ problems, functions }, s).prompt));
        expect(prompts.size, `${problems} ${functions}`).toBeGreaterThan(30);
      }
    }
  });
});
