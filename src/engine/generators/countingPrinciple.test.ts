import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import type { ParamValues } from "../types";
import { construct, countOf, distractors, generator, positions, type CountingConstruction } from "./countingPrinciple";
import { expectKatex, proseNumbers, proseOf, readCount } from "./matrices.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  context: fc.constantFrom("choices", "experiments", "codes", "mixed"),
  maxStages: fc.integer({ min: 2, max: 4 }),
});

const built = (params: ParamValues, seed: number): CountingConstruction => construct(params, createRng(seed));

/** Ways a stage can go that the prompt implies rather than states (a coin, a die, letters, digits, vowels). */
const IMPLIED = new Set([2, 5, 6, 10, 26]);

describe("counting-principle: answers", () => {
  it("the Answer is the product of each stage's ways, and the prompt states every number that goes in", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = built(params, seed);
        const p = generator.generate(params, seed);
        let product = 1;
        for (const s of k.stages) for (let i = 0; i < s.times; i++) product *= s.ways;
        expect(readCount(p.answer)).toBe(product);
        const stated = proseNumbers(p.prompt);
        for (const s of k.stages) {
          if (!IMPLIED.has(s.ways)) expect(stated, p.prompt).toContain(s.ways);
          if (s.times > 1) expect(stated, p.prompt).toContain(s.times);
        }
        // and nothing else
        for (const n of stated) expect(k.stages.some((s) => s.ways === n || s.times === n), p.prompt).toBe(true);
      }),
    );
  });

  it("prints a sentence that ends in a question and an Answer that renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(proseOf(p.prompt)).toMatch(/^[A-Z0-9].*\?$/);
        expect(p.prompt).toBe(`\\textnormal{${proseOf(p.prompt)}}`);
        expectKatex(p.prompt);
        expectKatex(p.answer);
      }),
    );
  });
});

describe("counting-principle: Topic Options", () => {
  it("draws from the context asked for, with 2 to Most stages of choices", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = built(params, seed);
        if (params.context !== "mixed") expect(k.context).toBe(params.context);
        if (k.context === "choices") {
          expect(k.stages.length).toBeGreaterThanOrEqual(2);
          expect(k.stages.length).toBeLessThanOrEqual(params.maxStages);
        }
      }),
    );
    const contexts = new Set(Array.from({ length: 60 }, (_, s) => built({}, s).context));
    expect(contexts).toEqual(new Set(["choices", "experiments", "codes"]));
  });

  it("never makes a one-way stage or a count of 1", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = built(params, seed);
        for (const s of k.stages) expect(s.ways).toBeGreaterThanOrEqual(2);
        expect(positions(k)).toBeGreaterThanOrEqual(2);
      }),
    );
  });
});

describe("counting-principle: distractors", () => {
  it("are distinct whole numbers, never the Answer, and at least two", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(2);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        for (const d of p.distractorHints) expect(readCount(d)).toBeGreaterThan(0);
      }),
    );
  });

  it("model adding instead of multiplying, and a coin's 2^n as 2n", () => {
    const outfit: CountingConstruction = {
      context: "choices",
      text: "",
      stages: [
        { ways: 4, times: 1 },
        { ways: 3, times: 1 },
        { ways: 5, times: 1 },
      ],
    };
    expect(countOf(outfit)).toBe(60);
    expect(distractors(outfit)[0]).toBe("12");
    const coin: CountingConstruction = { context: "experiments", text: "", stages: [{ ways: 2, times: 5 }] };
    expect(distractors(coin)).toEqual(expect.arrayContaining(["10", "25"]));
    // a PIN of 4 digits without repeats: 10 * 9 * 8 * 7
    const pin: CountingConstruction = { context: "codes", text: "", stages: [{ ways: 10, times: 4 }] };
    expect(distractors(pin)).toContain("5040");
  });
});

describe("counting-principle: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const context of ["choices", "experiments", "codes", "mixed"]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ context }, s).prompt));
      expect(prompts.size, context).toBeGreaterThan(35);
    }
  });
});
