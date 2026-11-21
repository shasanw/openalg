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
  it("are distinct points, never the Answer, and at least four", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        const choices = [p.answer, ...p.distractorHints].map(s => points(s));
        for (const choice of choices) expect(choice).toHaveLength(1);
        expect(new Set(choices.map(choice => JSON.stringify(choice[0]))).size).toBe(choices.length);
      }),
    );
  });
});

describe("midpoint-formula: generate()", () => {
  it("is deterministic, renders, and has variety", () => {
    commonChecks(generator, anyParams, [{}, { task: "endpoint" }, { fractions: true }], 150);
  });
});

it("offers the mistake of averaging x but copying the first y coordinate", () => {
  const p = generator.generate({}, 0);
  expect(p.distractorHints).toContain("(-5, -9)");
});
