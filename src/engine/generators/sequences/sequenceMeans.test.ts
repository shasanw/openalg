import { expectDistinctDistractors } from "./distinctDistractors.testkit";
import { sequenceMeans } from "./sequenceMeans.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, MAX_PRINTED } from "./sequenceMeans";
import { rat } from "./sequenceKit";
import { expectKatex, expectTidy, parseList, printedNumbers } from "./sequences.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  type: fc.constantFrom("arithmetic", "geometric", "mixed"),
  maxMeans: fc.integer({ min: 1, max: 4 }),
  fractions: fc.boolean(),
  allowNegatives: fc.boolean(),
});

describe("arithmetic-geometric-means: answers", () => {
  it("the means complete the printed run as labelled", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        sequenceMeans(p);
      }),
    );
  });

  it("prints tidy, modest numbers and renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const s of [p.prompt, p.answer, ...p.distractorHints]) expectTidy(s);
        for (const s of [p.prompt, p.answer]) {
          expectKatex(s);
          for (const n of printedNumbers(s)) expect(n).toBeLessThanOrEqual(MAX_PRINTED);
        }
      }),
    );
  });
});

describe("arithmetic-geometric-means: Topic Options", () => {
  it("inserts between 1 and Most means, of the type asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(k.m).toBeGreaterThanOrEqual(1);
        expect(k.m).toBeLessThanOrEqual(params.maxMeans);
        if (params.type !== "mixed") expect(k.type).toBe(params.type);
      }),
    );
    const ms = new Set(Array.from({ length: 60 }, (_, s) => construct({ maxMeans: 4 }, createRng(s)).m));
    expect(ms).toEqual(new Set([1, 2, 3, 4]));
  });

  it("keeps whole numbers unless fractions are allowed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, fractions: false }, seed);
        for (const s of [p.prompt, p.answer, ...p.distractorHints]) expect(s).not.toContain("\\frac");
      }),
    );
    const fractional = Array.from({ length: 60 }, (_, s) =>
      generator.generate({ type: "arithmetic", fractions: true }, s),
    ).filter((p) => p.answer.includes("\\frac"));
    expect(fractional.length).toBeGreaterThan(15);
  });

  it("prints no negative numbers when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        expect(p.prompt).not.toContain("-");
        expect(p.answer).not.toContain("-");
      }),
    );
  });
});

describe("arithmetic-geometric-means: distractors", () => {
  it("are distinct, never the Answer, and at least four", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectDistinctDistractors(p, (a, b) => {
          const left = parseList(a), right = parseList(b);
          return left.length === right.length && left.every((x, i) => x === right[i]);
        });
        expect(p.distractorHints).not.toContain(p.answer);
      }),
    );
  });

  it("model dividing by the number of means and the negative ratio", () => {
    // 2, _, _, _, 26 arithmetic: d = 6; 24/3 = 8 divides by the means, not the steps
    const a = { type: "arithmetic" as const, m: 3, first: rat(2), step: rat(6), positiveRatio: false };
    expect(distractors(a)).toContain("32, 38, 44"); // add the difference to the far end
    expect(distractors(a).slice(0, 2)).toEqual(["10, 18, 26", "-4, -10, -16"]);
    // 4, _, _, _, 24: 20/3 and 20/5... 20/5 = 4 is whole, 20/3 is not (dropped among whole Answers)
    expect(distractors({ ...a, first: rat(4), step: rat(5) })[0]).toBe("8, 12, 16");
    // 2, _, _, _, 32 geometric, r > 0
    const g = { type: "geometric" as const, m: 3, first: rat(2), step: rat(2), positiveRatio: true };
    expect(distractors(g)[0]).toBe("-4, 8, -16");
  });
});

describe("arithmetic-geometric-means: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const type of ["arithmetic", "geometric"]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ type }, s).prompt));
      expect(prompts.size, type).toBeGreaterThan(60);
    }
  });
});
