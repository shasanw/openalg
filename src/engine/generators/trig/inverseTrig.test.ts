import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, generator } from "./inverseTrig";
import { anySeed, evalTrig, expectLowestTerms, expectRationalized, expectRenders, sameTrigValue } from "./trig.testkit";
import { optionCombinations } from "./trigEquation.testkit";
import { DEGREES_NOTE, inverseTrig } from "./inverseTrig.answer.testkit";

const anyParams = fc.record({
  problems: fc.constantFrom("mixed", "values", "triangles", "undo"),
  functions: fc.constantFrom("primary", "all"),
  notation: fc.constantFrom("arc", "power", "mixed"),
  unit: fc.constantFrom("radians", "degrees"),
});


describe("inverse-trig: answers", () => {
  it("the Answer is the printed expression's value (undefined where it is undefined), in the unit asked for", () => {
    for (const params of optionCombinations(generator.schema)) {
      fc.assert(fc.property(anySeed, (seed) => {
        const p = generator.generate(params, seed);
        inverseTrig(p);
      }), { numRuns: 10 });
    }
  });

  it("prints exact values reduced and rationalized", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectLowestTerms(p.answer);
        expectRationalized(p.prompt);
        for (const m of p.answer.matchAll(/\\frac\{(\d+)\}\{(\d+)\}/g)) expect(Number(m[2])).toBeGreaterThan(1);
      }),
    );
  });
});

describe("inverse-trig: Topic Options", () => {
  it("gives the kind of Problem asked for, and every kind when mixed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.problems !== "mixed") expect(k.kind).toBe(params.problems);
      }),
    );
    const kinds = new Set(Array.from({ length: 60 }, (_, s) => construct({}, createRng(s)).kind));
    expect(kinds).toEqual(new Set(["values", "triangles", "undo"]));
  });

  it("uses sec, csc and cot only when asked, and the notation asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        if (params.functions === "primary") expect(p.prompt).not.toMatch(/sec|csc|cot/);
        if (params.notation === "arc") expect(p.prompt).not.toMatch(/\^\{-1\}/);
        if (params.notation === "power") expect(p.prompt).not.toMatch(/arc/);
      }),
    );
    const prompts = Array.from({ length: 200 }, (_, s) => generator.generate({ functions: "all", notation: "mixed" }, s).prompt).join(" ");
    for (const f of ["sec", "csc", "cot", "^{-1}", "\\arc"]) expect(prompts).toContain(f);
  });

  it("gives angles in the unit asked for, and says so in degrees", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        if (k.kind === "triangles") expect(p.answer).not.toMatch(/pi|circ/);
        if (k.kind === "values") {
          expect(p.prompt.endsWith(DEGREES_NOTE)).toBe(params.unit === "degrees");
          if (params.unit === "degrees") expect(p.answer).toMatch(/\^\{\\circ\}/);
          else expect(p.answer).not.toMatch(/circ/);
        }
      }),
    );
  });

  it("undoing Problems use angles outside the principal range (the trap)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, problems: "undo" }, seed);
        const m = p.prompt.match(/^\\(?:arc|operatorname\{arc)?(\w+?)\}?(?:\^\{-1\})?\\left\(\\(sin|cos|tan|sec|csc|cot) (.*)\\right\)$/);
        if (!m) return;
        expect(Math.abs(evalTrig(m[3]) - evalTrig(p.answer)), p.prompt).toBeGreaterThan(1e-9);
      }),
    );
  });
});

describe("inverse-trig: distractors", () => {
  it("are at least four, distinct in value, and never the Answer's value", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        const all = [p.answer, ...p.distractorHints];
        for (let i = 0; i < all.length; i++)
          for (let j = i + 1; j < all.length; j++) expect(sameTrigValue(all[i], all[j]), `${all[i]} vs ${all[j]}`).toBe(false);
      }),
    );
  });
});

describe("inverse-trig: generate()", () => {
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
        for (const tex of [p.prompt, p.answer, ...p.distractorHints]) expectRenders(tex);
      }),
      { numRuns: 100 },
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({}, s).prompt));
    expect(prompts.size).toBeGreaterThan(80);
  });
});

it("offers the mistake of taking sine instead of cotangent in the 5-12-13 triangle", () => {
  const p = generator.generate({ functions: "all" }, 22);
  expect(p.distractorHints).toContain("-\\frac{5}{13}");
});
