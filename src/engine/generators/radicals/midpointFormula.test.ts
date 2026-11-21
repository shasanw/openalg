import { midpointFormula, points } from "./midpointFormula.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, generator } from "./midpointFormula";
import { anySeed, commonChecks } from "./radicals.testkit";

const anyParams = fc.record({
  task: fc.constantFrom("midpoint", "endpoint", "mixed"),
  fractions: fc.boolean(),
  maxCoordinate: fc.integer({ min: 4, max: 20 }),
});

describe("midpoint-formula: answers", () => {
  it("the Answer is the midpoint, or the endpoint whose midpoint is the one printed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        midpointFormula(p);
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
