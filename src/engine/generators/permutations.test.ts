import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { construct, distractors, generator, REPEAT_WORDS } from "./permutations";
import { perm } from "./countingKit";
import { expectKatex, proseNumbers, proseOf, readCount } from "./matrices.testkit";
import { fact, nPr, readNotation } from "./counting.testUtil";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  form: fc.constantFrom("notation", "words", "letters", "mixed"),
  maxN: fc.integer({ min: 5, max: 12 }),
});

/** The letters or digits a "letters" prompt arranges, read from its prose. */
function readSymbols(prompt: string): string[] | null {
  const text = proseOf(prompt);
  const word = text.match(/the letters of ([A-Z]+) be arranged/);
  if (word) return [...word[1]];
  const digits = text.match(/all of the digits ([\d, ]+)\?$/);
  return digits ? digits[1].split(", ") : null;
}

const multinomial = (symbols: string[]): number => {
  const counts = new Map<string, number>();
  for (const s of symbols) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.values()].reduce((q, c) => q / fact(c), fact(symbols.length));
};

describe("permutations: answers", () => {
  it("nPr is n!/(n - r)!, and arrangements of repeated symbols are n! over each repeat's factorial", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const answer = readCount(p.answer);
        const notation = readNotation(p.prompt);
        const symbols = readSymbols(p.prompt);
        if (notation) {
          expect(notation.letter).toBe("P");
          expect(answer).toBe(nPr(notation.n, notation.r));
        } else if (symbols) {
          expect(answer).toBe(multinomial(symbols));
        } else {
          const k = construct(params, createRng(seed));
          if (k.form !== "words") throw new Error("expected a word problem");
          expect(answer).toBe(nPr(k.scenario.n, k.scenario.r));
          // the prompt states how many there are to arrange (a code's ten digits are "0 to 9")
          expect(proseNumbers(p.prompt)).toContain(k.scenario.n === 10 && /0 to 9/.test(proseOf(p.prompt)) ? 9 : k.scenario.n);
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

describe("permutations: Topic Options", () => {
  it("gives the form asked for, never with n above Largest n", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.form !== "mixed") expect(k.form).toBe(params.form);
        if (k.form === "notation") {
          expect(k.n).toBeLessThanOrEqual(params.maxN);
          expect(k.r).toBeGreaterThanOrEqual(2);
          expect(k.r).toBeLessThanOrEqual(k.n);
        }
        if (k.form === "letters") {
          expect(k.symbols.length).toBeLessThanOrEqual(params.maxN);
          // something repeats, so dividing matters
          expect(new Set(k.symbols).size).toBeLessThan(k.symbols.length);
        }
        if (k.form === "words" && !(k.scenario.n === 10 && k.scenario.r <= 5)) {
          expect(k.scenario.n).toBeLessThanOrEqual(params.maxN);
        }
      }),
    );
  });

  it("every word for arranging letters repeats a letter", () => {
    for (const w of REPEAT_WORDS) expect(new Set(w).size, w).toBeLessThan(w.length);
  });
});

describe("permutations: distractors", () => {
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

  it("model dividing by r! too, repetition, and ignoring repeated letters", () => {
    // 8P3 = 336: 8C3 = 56, 8^3 = 512
    expect(distractors({ form: "notation", n: 8, r: 3 }).slice(0, 2)).toEqual(["56", "512"]);
    // BANANA: 60; 6! = 720 ignores the repeats, 6!/3! = 120 divides by one of them
    expect(distractors({ form: "letters", symbols: [..."BANANA"], word: true }).slice(0, 2)).toEqual(["720", "120"]);
    expect(perm(8, 3)).toBe(336);
  });
});

describe("permutations: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const form of ["notation", "words", "letters", "mixed"]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ form }, s).prompt));
      expect(prompts.size, form).toBeGreaterThan(25);
    }
  });
});
