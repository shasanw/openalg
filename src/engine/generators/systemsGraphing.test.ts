import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { assemble, choiceKey } from "../mc";
import { blankGraph, plot, type CoordinatePlaneSpec } from "../plot";
import { buildSection } from "../worksheet";
import { lineGrid } from "./lines";
import { systemEquations } from "./systemsKit";
import {
  construct,
  distractors,
  generator,
  INTERCEPT_LIMIT,
  MIN_CROSSING_DEGREES,
  SOLUTION_LIMIT,
  SYSTEMS_GRAPHING_ID,
  type SystemsGraphingConstruction,
} from "./systemsGraphing";
import { answerMatchesPrompt, classify, parsePoint, printedSystem } from "./systems.testUtil";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyOptions = fc.record({
  form: fc.constantFrom("slopeIntercept", "standard", "mixed"),
  fractions: fc.boolean(),
  includeSpecial: fc.boolean(),
  workSpace: fc.constantFrom("grid", "none"),
});

describe("solving systems by graphing: built answer-first", () => {
  it("the baked Answer is the printed system's solution set", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        expect(answerMatchesPrompt(p.prompt, p.answer)).toBe(true);
      }),
    );
  });

  it("crosses at a lattice point inside the grid, with whole-number y-intercepts on the grid", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        const pt = parsePoint(p.answer);
        if (pt) {
          for (const v of pt) {
            expect(Math.abs(v)).toBeLessThanOrEqual(SOLUTION_LIMIT);
            expect(v).not.toBe(0);
          }
        }
        for (const [, b, c] of printedSystem(p.prompt)) {
          // every line here crosses the y-axis (no vertical lines) at a whole number
          expect(b).not.toBe(0);
          const yIntercept = c / b;
          expect(Number.isInteger(yIntercept)).toBe(true);
          expect(Math.abs(yIntercept)).toBeLessThanOrEqual(INTERCEPT_LIMIT);
        }
      }),
    );
  });

  it("honours the Topic Options", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        const k = construct(opts, createRng(seed));
        const eqs = systemEquations(p.prompt);
        const slopeIntercept = (eq: string) => eq.startsWith("y = ");
        if (opts.form === "slopeIntercept") {
          expect(slopeIntercept(eqs[0])).toBe(true);
          // one line written twice shows its second copy in standard form
          if (k.solution.kind !== "infinite") expect(slopeIntercept(eqs[1])).toBe(true);
        }
        if (opts.form === "standard") for (const eq of eqs) expect(slopeIntercept(eq)).toBe(false);
        if (!opts.fractions) {
          for (const [a, b] of printedSystem(p.prompt)) expect(Number.isInteger(a / b)).toBe(true);
        }
        if (!opts.includeSpecial) expect(classify(p.prompt).kind).toBe("point");
        expect(p.graph === undefined).toBe(opts.workSpace === "none");
      }),
    );
  });

  it("includes both special cases when asked", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) kinds.add(classify(generator.generate({ includeSpecial: true }, seed).prompt).kind);
    expect([...kinds].sort()).toEqual(["infinite", "none", "point"]);
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
    for (const form of ["slopeIntercept", "standard", "mixed"]) {
      const s = buildSection({ generatorId: SYSTEMS_GRAPHING_ID, params: { form }, baseSeed: 2, count: 30 });
      expect(new Set(s.problems.map((p) => p.prompt)).size).toBe(30);
    }
  });
});

describe("solving systems by graphing: graphs", () => {
  it("gives nothing away: the student's grid is blank and the same for every Problem", () => {
    const grids = new Set<string>();
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate({ ...opts, workSpace: "grid" }, seed);
        expect(p.graph).toEqual(lineGrid());
        grids.add(plot(p.graph!));
      }),
    );
    expect(grids.size).toBe(1);
  });

  it("draws both lines on the student's window and marks their crossing", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate({ ...opts, workSpace: "grid" }, seed);
        const ag = p.answerGraph as CoordinatePlaneSpec;
        expect(blankGraph(ag)).toEqual(p.graph);
        const lines = ag.curves!.map((c) => {
          if (c.kind !== "line" || c.form !== "slopeIntercept") throw new Error("not a sloped line");
          return c;
        });
        const pt = parsePoint(p.answer);
        if (pt) {
          expect(lines).toHaveLength(2);
          expect(ag.points).toEqual([{ x: pt[0], y: pt[1] }]);
          for (const l of lines) expect(l.m * pt[0] + l.b).toBeCloseTo(pt[1], 9);
          const angle = (m: number) => (Math.atan(m) * 180) / Math.PI;
          expect(Math.abs(angle(lines[0].m) - angle(lines[1].m))).toBeGreaterThanOrEqual(MIN_CROSSING_DEGREES);
        } else {
          expect(ag.points).toEqual([]);
          expect(lines).toHaveLength(classify(p.prompt).kind === "infinite" ? 1 : 2);
        }
      }),
    );
  });
});

describe("solving systems by graphing: multiple choice", () => {
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

  it("leads with swapped coordinates, then a y-intercept read as the crossing", () => {
    // y = 2x - 1 and y = -x + 5 cross at (2, 3)
    const k: SystemsGraphingConstruction = {
      lines: [
        { vertical: false, m: { n: 2, d: 1 }, b: { n: -1, d: 1 } },
        { vertical: false, m: { n: -1, d: 1 }, b: { n: 5, d: 1 } },
      ],
      forms: ["slopeIntercept", "slopeIntercept"],
      solution: { kind: "point", x: 2, y: 3 },
    };
    expect(distractors(k, false).slice(0, 3)).toEqual(["(3, 2)", "(0, -1)", "(0, 5)"]);
    expect(distractors(k, true)).toContain("\\text{no solution}");
  });

  it("offers the other special case first for a special system", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        const p = generator.generate({ includeSpecial: true }, seed);
        if (p.answer === "\\text{no solution}") expect(p.distractorHints[0]).toBe("\\text{infinitely many solutions}");
        if (p.answer === "\\text{infinitely many solutions}") expect(p.distractorHints[0]).toBe("\\text{no solution}");
      }),
    );
  });
});
