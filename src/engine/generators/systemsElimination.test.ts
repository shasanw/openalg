import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { assemble, choiceKey } from "../mc";
import { gcd } from "../format";
import { buildSection } from "../worksheet";
import {
  distractors,
  generator,
  SOLUTION_LIMIT,
  SYSTEMS_ELIMINATION_ID,
  type SystemsEliminationConstruction,
} from "./systemsElimination";
import { answerMatchesPrompt, classify, parsePoint, printedSystem } from "./systems.testUtil";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anySteps = fc.constantFrom("addSubtract", "multiplyOne", "multiplyBoth", "mixed");
const anyOptions = fc.record({ steps: anySteps, includeSpecial: fc.boolean() });

/** The least work before adding or subtracting eliminates a variable, read off the printed coefficients. */
function workNeeded(prompt: string): string {
  const [[a1, b1], [a2, b2]] = printedSystem(prompt);
  const level = (p: number, q: number) => (Math.abs(p) === Math.abs(q) ? 0 : p % q === 0 || q % p === 0 ? 1 : 2);
  return ["addSubtract", "multiplyOne", "multiplyBoth"][Math.min(level(a1, a2), level(b1, b2))];
}

describe("solving systems by elimination: built answer-first", () => {
  it("the baked Answer is the printed system's solution set", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        expect(answerMatchesPrompt(p.prompt, p.answer)).toBe(true);
      }),
    );
  });

  it("needs exactly the requested work before adding or subtracting", () => {
    fc.assert(
      fc.property(anySeed, anySteps, (seed, steps) => {
        const p = generator.generate({ steps }, seed);
        if (steps !== "mixed") expect(workNeeded(p.prompt)).toBe(steps);
      }),
    );
  });

  it("mixes all three amounts of work by default", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) seen.add(workNeeded(generator.generate({}, seed).prompt));
    expect(seen.size).toBe(3);
  });

  it("prints whole-number equations with both variables that do not simplify, and a small solution", () => {
    fc.assert(
      fc.property(anySeed, anySteps, (seed, steps) => {
        const p = generator.generate({ steps }, seed);
        for (const [a, b, c] of printedSystem(p.prompt)) {
          for (const v of [a, b, c]) expect(Number.isInteger(v)).toBe(true);
          expect(a).not.toBe(0);
          expect(b).not.toBe(0);
          expect(gcd(a, b)).toBe(1);
        }
        for (const v of parsePoint(p.answer)!) {
          expect(v).not.toBe(0);
          expect(Math.abs(v)).toBeLessThanOrEqual(SOLUTION_LIMIT);
        }
      }),
    );
  });

  it("includes special cases only when asked, and both of them", () => {
    fc.assert(
      fc.property(anySeed, anySteps, (seed, steps) => {
        expect(classify(generator.generate({ steps }, seed).prompt).kind).toBe("point");
      }),
    );
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) kinds.add(classify(generator.generate({ includeSpecial: true }, seed).prompt).kind);
    expect([...kinds].sort()).toEqual(["infinite", "none", "point"]);
  });

  it("is deterministic for a seed", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        expect(generator.generate(opts, seed)).toEqual(generator.generate(opts, seed));
      }),
    );
  });

  it("a Section has no repeated prompt", () => {
    for (const steps of ["addSubtract", "multiplyOne", "multiplyBoth", "mixed"]) {
      const s = buildSection({ generatorId: SYSTEMS_ELIMINATION_ID, params: { steps }, baseSeed: 4, count: 30 });
      expect(new Set(s.problems.map((p) => p.prompt)).size).toBe(30);
    }
  });
});

describe("solving systems by elimination: multiple choice", () => {
  it("offers at least four Distractors, distinct and never the Answer", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        const keys = p.distractorHints.map(choiceKey);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).not.toContain(choiceKey(p.answer));
        const { choices, correctIndex } = assemble(p, { choices: 5, seed });
        expect(choices[correctIndex]).toBe(p.answer);
      }),
    );
  });

  it("models combining the constants the wrong way, then swapped coordinates and one variable only", () => {
    // 3x + y = 10, x - y = 2: adding gives 4x = 12, x = 3, y = 1. Subtracting
    // the constants instead gives 4x = 8, so x = 2 and y = 10 - 6 = 4.
    const k: SystemsEliminationConstruction = {
      equations: [
        { a: 3, b: 1, c: 10 },
        { a: 1, b: -1, c: 2 },
      ],
      solution: { kind: "point", x: 3, y: 1 },
      steps: "addSubtract",
    };
    const d = distractors(k);
    expect(d.slice(0, 2)).toEqual(["(2, 4)", "(1, 3)"]);
    expect(d).toContain("x = 3");
  });

  it("models multiplying the left side but not the constant", () => {
    // 2x + y = 5, 3x + 2y = 8 at (2, 1): twice the first minus the second
    // gives x = 10 - 8 = 2. Doubling 2x + y but not its 5 gives x = 5 - 8 = -3,
    // and then y = 5 + 6 = 11.
    const k: SystemsEliminationConstruction = {
      equations: [
        { a: 2, b: 1, c: 5 },
        { a: 3, b: 2, c: 8 },
      ],
      solution: { kind: "point", x: 2, y: 1 },
      steps: "multiplyOne",
    };
    expect(distractors(k)).toContain("(-3, 11)");
  });
});
