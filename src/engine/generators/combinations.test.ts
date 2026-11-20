import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { construct, distractors, generator } from "./combinations";
import { expectKatex, proseNumbers, readCount } from "./matrices.testkit";
import { nCr, readNotation } from "./counting.testUtil";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  form: fc.constantFrom("notation", "words", "mixed"),
  maxN: fc.integer({ min: 5, max: 15 }),
  twoGroups: fc.boolean(),
});

describe("combinations: answers", () => {
  it("nCr is n!/(r!(n - r)!), and a two-group choice multiplies the groups' counts", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const answer = readCount(p.answer);
        const notation = readNotation(p.prompt);
        if (notation) {
          expect(notation.letter).toBe("C");
          expect(answer).toBe(nCr(notation.n, notation.r));
          return;
        }
        const k = construct(params, createRng(seed));
        if (k.form !== "words") throw new Error("expected a word problem");
        const stated = proseNumbers(p.prompt);
        if (k.scenario.groups) {
          expect(answer).toBe(k.scenario.groups.reduce((t, g) => t * nCr(g.n, g.r), 1));
          for (const g of k.scenario.groups) expect(stated).toEqual(expect.arrayContaining([g.n, g.r]));
        } else {
          expect(answer).toBe(nCr(k.scenario.n, k.scenario.r));
          expect(stated).toContain(k.scenario.n);
        }
      }),
    );
  });

  it("renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectKatex(p.prompt);
        expectKatex(p.answer);
      }),
    );
  });
});

describe("combinations: Topic Options", () => {
  it("gives the form asked for, within Largest n, and two groups only when allowed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.form !== "mixed") expect(k.form).toBe(params.form);
        if (k.form === "notation") {
          expect(k.n).toBeLessThanOrEqual(params.maxN);
          expect(k.r).toBeGreaterThanOrEqual(1);
          expect(k.r).toBeLessThan(k.n);
        } else {
          if (!params.twoGroups) expect(k.scenario.groups).toBeUndefined();
          for (const g of k.scenario.groups ?? [k.scenario]) expect(g.n).toBeLessThanOrEqual(params.maxN);
        }
      }),
    );
    const twoGroups = Array.from({ length: 200 }, (_, s) => construct({ form: "words" }, createRng(s))).filter(
      (k) => k.form === "words" && k.scenario.groups,
    );
    expect(twoGroups.length).toBeGreaterThan(10);
  });
});

describe("combinations: distractors", () => {
  it("are distinct whole numbers, never the Answer, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        for (const d of p.distractorHints) expect(readCount(d)).toBeGreaterThan(0);
      }),
    );
  });

  it("model not dividing by r!, and adding two groups' counts", () => {
    // 9C4 = 126: 9P4 = 3024
    expect(distractors({ form: "notation", n: 9, r: 4 })[0]).toBe("3024");
    const k = construct({ form: "words", twoGroups: true }, createRng(3));
    if (k.form === "words" && k.scenario.groups) {
      const [a, b] = k.scenario.groups;
      expect(distractors(k)[0]).toBe(String(nCr(a.n, a.r) + nCr(b.n, b.r)));
    }
  });
});

describe("combinations: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const form of ["notation", "words", "mixed"]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ form }, s).prompt));
      expect(prompts.size, form).toBeGreaterThan(40);
    }
  });
});
