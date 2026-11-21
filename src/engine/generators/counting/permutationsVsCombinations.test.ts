import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { construct, distractors, generator } from "./permutationsVsCombinations";
import { expectKatex, proseNumbers, readCount } from "../shared/matrices.testkit";
import { nCr, nPr } from "./counting.testUtil";
import { countLatex } from "./countingKit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  ask: fc.constantFrom("both", "count"),
  maxN: fc.integer({ min: 5, max: 15 }),
});

/** "\text{permutation};\quad 720" -> ["permutation", 720]; "720" -> [null, 720] */
function readAnswer(latex: string): [string | null, number] {
  const parts = latex.split(ANSWER_PART_SEPARATOR);
  if (parts.length === 1) return [null, readCount(latex)];
  const kind = parts[0].match(/^\\text\{(permutation|combination)\}$/);
  expect(kind, latex).not.toBeNull();
  return [kind![1], readCount(parts[1])];
}

describe("permutations-vs-combinations: answers", () => {
  it("names the right kind of count and counts it that way", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const k = construct(params, createRng(seed));
        const [kind, count] = readAnswer(p.answer);
        const { n, r } = k.scenario;
        expect(count).toBe(k.scenario.kind === "permutation" ? nPr(n, r) : nCr(n, r));
        expect(kind).toBe(params.ask === "both" ? k.scenario.kind : null);
        expect(proseNumbers(p.prompt).length).toBeGreaterThan(0);
        expectKatex(p.prompt);
        expectKatex(p.answer);
      }),
    );
  });

  it("asks half its Problems each way, and never one where every item is arranged", () => {
    const kinds = Array.from({ length: 400 }, (_, s) => construct({}, createRng(s)).scenario);
    const perms = kinds.filter((s) => s.kind === "permutation").length;
    expect(perms).toBeGreaterThan(150);
    expect(perms).toBeLessThan(250);
    for (const s of kinds) expect(s.r).toBeLessThan(s.n);
  });
});

describe("permutations-vs-combinations: distractors", () => {
  it("are distinct, never the Answer, in the Answer's shape, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        for (const d of p.distractorHints) {
          const [kind] = readAnswer(d);
          expect(kind === null).toBe(params.ask === "count");
        }
      }),
    );
  });

  it("lead with the other kind of count, named and counted that way", () => {
    for (let s = 0; s < 50; s++) {
      const k = construct({ ask: "both" }, createRng(s));
      const { n, r, kind } = k.scenario;
      const [first] = distractors(k);
      const other = kind === "permutation" ? "combination" : "permutation";
      expect(first).toBe(`\\text{${other}}${ANSWER_PART_SEPARATOR}${countLatex(other === "permutation" ? nPr(n, r) : nCr(n, r))}`);
    }
  });
});

describe("permutations-vs-combinations: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({}, s).prompt));
    expect(prompts.size).toBeGreaterThan(100);
  });
});
