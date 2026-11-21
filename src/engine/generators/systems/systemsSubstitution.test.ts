import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { assemble, choiceKey } from "../../mc";
import { buildSection } from "../../worksheet";
import { systemEquations } from "../shared/systemsKit";
import {
  CONSTANT_LIMIT,
  distractors,
  generator,
  SOLUTION_LIMIT,
  SYSTEMS_SUBSTITUTION_ID,
  type SystemsSubstitutionConstruction,
} from "./systemsSubstitution";
import { answerMatchesPrompt, classify, coefficients, parsePoint } from "./systems.testUtil";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyIsolated = fc.constantFrom("y", "x", "mixed", "none");
const anyOptions = fc.record({ isolated: anyIsolated, includeSpecial: fc.boolean() });

/** "y = 3x - 4" / "x = -2y + 5": the solved equations of a printed system, by the variable they solve for. */
const solvedFor = (eq: string) => eq.match(/^([xy]) = /)?.[1];

describe("solving systems by substitution: built answer-first", () => {
  it("the baked Answer is the printed system's solution set", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        expect(answerMatchesPrompt(p.prompt, p.answer)).toBe(true);
      }),
    );
  });

  it("prints exactly one equation solved for the chosen variable, in either position", () => {
    const firsts = new Set<boolean>();
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const eqs = systemEquations(generator.generate(opts, seed).prompt);
        const solved = eqs.map(solvedFor).filter(Boolean);
        if (opts.isolated === "none") {
          expect(solved).toEqual([]);
          // one equation has a variable with coefficient 1 or -1 to isolate
          expect(eqs.some((eq) => coefficients(eq).slice(0, 2).some((c) => Math.abs(c) === 1))).toBe(true);
          return;
        }
        expect(solved).toHaveLength(1);
        if (opts.isolated !== "mixed") expect(solved[0]).toBe(opts.isolated);
        firsts.add(solvedFor(eqs[0]) !== undefined);
        // the solved variable appears only on the left: s = m t + b
        const eq = eqs.find((e) => solvedFor(e))!;
        expect(eq.split("=")[1]).not.toContain(solvedFor(eq));
        const [, b] = eq.split(" = ");
        const constant = Number(b.match(/[+-] (\d+)$/)?.[0].replace(" ", "") ?? 0);
        expect(Math.abs(constant)).toBeLessThanOrEqual(CONSTANT_LIMIT);
      }),
    );
    expect(firsts.size).toBe(2);
  });

  it("mixes y and x by default", () => {
    const seen = new Set<string | undefined>();
    for (let seed = 1; seed <= 40; seed++) {
      const eqs = systemEquations(generator.generate({}, seed).prompt);
      seen.add(eqs.map(solvedFor).find(Boolean));
    }
    expect([...seen].sort()).toEqual(["x", "y"]);
  });

  it("has a small whole-number solution, with neither coordinate zero", () => {
    fc.assert(
      fc.property(anySeed, anyIsolated, (seed, isolated) => {
        for (const v of parsePoint(generator.generate({ isolated }, seed).answer)!) {
          expect(v).not.toBe(0);
          expect(Math.abs(v)).toBeLessThanOrEqual(SOLUTION_LIMIT);
        }
      }),
    );
  });

  it("includes special cases only when asked, and both of them", () => {
    fc.assert(
      fc.property(anySeed, anyIsolated, (seed, isolated) => {
        expect(classify(generator.generate({ isolated }, seed).prompt).kind).toBe("point");
      }),
    );
    for (const isolated of ["y", "x", "none"]) {
      const kinds = new Set<string>();
      for (let seed = 1; seed <= 200; seed++) {
        kinds.add(classify(generator.generate({ isolated, includeSpecial: true }, seed).prompt).kind);
      }
      expect([...kinds].sort()).toEqual(["infinite", "none", "point"]);
    }
  });

  it("never prints the same equation twice", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const [a, b] = systemEquations(generator.generate(opts, seed).prompt);
        expect(a).not.toBe(b);
      }),
    );
  });

  it("is deterministic for a seed", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        expect(generator.generate(opts, seed)).toEqual(generator.generate(opts, seed));
      }),
    );
  });

  it("a Section has no repeated prompt", () => {
    for (const isolated of ["y", "x", "mixed", "none"]) {
      const s = buildSection({ generatorId: SYSTEMS_SUBSTITUTION_ID, params: { isolated }, baseSeed: 6, count: 30 });
      expect(new Set(s.problems.map((p) => p.prompt)).size).toBe(30);
    }
  });
});

describe("solving systems by substitution: multiple choice", () => {
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

  it("models swapped coordinates, a sign slip substituting back and one variable only", () => {
    // y = 2x + 1 into 3x + 2y = 16: 7x + 2 = 16, so x = 2 and y = 5. Both
    // slips while solving for x land on fractions (skipped); substituting
    // back as y = 2x - 1 gives (2, 3).
    const k: SystemsSubstitutionConstruction = {
      solvedFor: "y",
      m: 2,
      b: 1,
      printSolved: true,
      other: { a: 3, b: 2, c: 16 },
      solvedFirst: true,
      solution: { kind: "point", x: 2, y: 5 },
    };
    expect(distractors(k).slice(0, 3)).toEqual(["(5, 2)", "(2, 3)", "x = 2"]);
  });

  it("models not distributing over the constant when it lands on whole numbers", () => {
    // y = x + 5 into 2x + 3y = 25: 5x + 15 = 25, so (2, 7). Not distributing
    // the 3 over the 5: 5x + 5 = 25, so x = 4 and y = 9.
    const k: SystemsSubstitutionConstruction = {
      solvedFor: "y",
      m: 1,
      b: 5,
      printSolved: true,
      other: { a: 2, b: 3, c: 25 },
      solvedFirst: true,
      solution: { kind: "point", x: 2, y: 7 },
    };
    expect(distractors(k)[0]).toBe("(4, 9)");
  });
});
