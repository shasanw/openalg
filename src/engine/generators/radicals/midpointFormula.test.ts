import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { construct, generator } from "./midpointFormula";
import { evalLatex } from "../shared/latexEval.testkit";
import { anySeed, commonChecks } from "./radicals.testkit";

const anyParams = fc.record({
  task: fc.constantFrom("midpoint", "endpoint", "mixed"),
  fractions: fc.boolean(),
  maxCoordinate: fc.integer({ min: 4, max: 20 }),
});

/** The points printed in a prompt or Answer, in order, as numbers. */
function points(latex: string): [number, number][] {
  const out: [number, number][] = [];
  const body = latex.replace(/\\left\(/g, "(").replace(/\\right\)/g, ")");
  for (const m of body.matchAll(/\(([^,()]+), ([^()]+)\)/g)) out.push([evalLatex(m[1]), evalLatex(m[2])]);
  return out;
}

describe("midpoint-formula: answers", () => {
  it("the Answer is the midpoint, or the endpoint whose midpoint is the one printed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const [[ax, ay], [bx, by]] = points(p.prompt);
        const [[x, y]] = points(p.answer);
        if (p.prompt.includes("midpoint")) {
          expect(p.prompt).toContain(ANSWER_PART_SEPARATOR);
          expect((ax + x) / 2).toBeCloseTo(bx, 12);
          expect((ay + y) / 2).toBeCloseTo(by, 12);
        } else {
          expect(x).toBeCloseTo((ax + bx) / 2, 12);
          expect(y).toBeCloseTo((ay + by) / 2, 12);
        }
      }),
    );
  });
});

describe("midpoint-formula: Topic Options", () => {
  it("honours the task, the coordinate limit and halves", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        if (params.task !== "mixed") expect(k.task).toBe(params.task);
        for (const v of [...k.a, ...k.b]) expect(Math.abs(v)).toBeLessThanOrEqual(params.maxCoordinate);
        expect(k.a).not.toEqual(k.b);
        if (!params.fractions) expect(p.prompt + p.answer).not.toContain("\\frac");
      }),
    );
    const tasks = new Set(Array.from({ length: 40 }, (_, s) => construct({ task: "mixed" }, createRng(s)).task));
    expect(tasks).toEqual(new Set(["midpoint", "endpoint"]));
    expect(Array.from({ length: 40 }, (_, s) => generator.generate({ fractions: true }, s).answer).some((a) => a.includes("\\frac"))).toBe(true);
  });
});

describe("midpoint-formula: distractors", () => {
  it("are distinct points, never the Answer, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        for (const d of p.distractorHints) expect(points(d)).toHaveLength(1);
      }),
    );
  });
});

describe("midpoint-formula: generate()", () => {
  it("is deterministic, renders, and has variety", () => {
    commonChecks(generator, anyParams, [{}, { task: "endpoint" }, { fractions: true }], 150);
  });
});
