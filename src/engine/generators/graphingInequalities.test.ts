import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import {
  construct,
  describeLatex,
  generator,
  inequalityLatex,
  mistakes,
  type Kinds,
  type Task,
} from "./graphingInequalities";
import { blankGraph, graphSpecProblem, isLabelledTick, type NumberLineSpec } from "../plot";
import { rat } from "./equationKit";
import { answerHolds, inequalityHolds, isInterval, printedNumbers, probePoints } from "./inequalityEval.testkit";
import { anySeed, expectTidy } from "./inequalitySuite.testkit";

const anyParams = fc.record({
  task: fc.constantFrom<Task>("graph", "write", "mixed"),
  kinds: fc.constantFrom<Kinds>("simple", "compound", "mixed"),
  reversed: fc.boolean(),
  fractions: fc.boolean(),
  maxValue: fc.integer({ min: 2, max: 20 }),
  notation: fc.constantFrom("inequality", "interval"),
  showNumberLine: fc.boolean(),
});

/** Whether a number line shows x as part of the set: shaded, or a closed circle, and not an open one. */
function shownAt(spec: NumberLineSpec, x: number): boolean {
  const dot = (spec.points ?? []).find((p) => Math.abs(p.x - x) < 1e-9);
  if (dot) return dot.closed;
  return (spec.shaded ?? []).some((s) => (s.from === null || s.from < x) && (s.to === null || x < s.to));
}

const isWrite = (prompt: string) => prompt.startsWith("\\text{Write");

describe("graphing-inequalities: graphing", () => {
  it("the Answer Key's number line shows exactly the printed inequality", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, task: "graph" }, seed);
        const line = p.answerGraph as NumberLineSpec;
        expect(line.kind).toBe("numberLine");
        expect(graphSpecProblem(line)).toBeNull();
        for (const x of probePoints(p.prompt)) expect(shownAt(line, x), `${p.prompt} at ${x}`).toBe(inequalityHolds(p.prompt, x));
      }),
    );
  });

  it("describes the graph in words, with distinct mistaken descriptions", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, task: "graph" }, seed);
        const k = construct({ ...params, task: "graph" }, createRng(seed));
        expect(p.answer).toBe(describeLatex(k.solution));
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        expect(p.distractorHints).not.toContain(p.answer);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        for (const t of [p.prompt, p.answer, ...p.distractorHints]) expectTidy(t);
      }),
    );
  });

  it("prints a blank number line on the same window only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, task: "graph" }, seed);
        if (params.showNumberLine) expect(p.graph).toEqual(blankGraph(p.answerGraph!));
        else expect(p.graph).toBeUndefined();
      }),
    );
  });
});

describe("graphing-inequalities: writing from a graph", () => {
  it("the Answer is exactly the set the given graph shows", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, task: "write" }, seed);
        const line = p.graph as NumberLineSpec;
        expect(p.answerGraph).toBeUndefined();
        expect(graphSpecProblem(line)).toBeNull();
        const ticks = Array.from({ length: 11 }, (_, i) => line.range.min + i);
        for (const x of [...probePoints(p.answer), ...ticks]) {
          expect(shownAt(line, x), `${p.answer} at ${x}`).toBe(answerHolds(p.answer, x));
        }
        expect(isInterval(p.answer)).toBe(params.notation === "interval");
      }),
    );
  });

  it("puts whole-number boundaries on labelled ticks inside the window, and labels no circle", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, task: "write" }, seed);
        const line = p.graph as NumberLineSpec;
        for (const pt of line.points ?? []) {
          expect(pt.label).toBeUndefined();
          expect(Number.isInteger(pt.x)).toBe(true);
          expect(isLabelledTick(line, pt.x)).toBe(true);
          expect(pt.x).toBeGreaterThan(line.range.min);
          expect(pt.x).toBeLessThan(line.range.max);
        }
        expect((line.range.max - line.range.min) / line.step).toBe(10);
      }),
    );
  });

  it("Distractors are different sets in the same notation", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, task: "write" }, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        for (const d of p.distractorHints) {
          expect(isInterval(d)).toBe(isInterval(p.answer));
          expect(probePoints(p.answer, d).some((x) => answerHolds(d, x) !== answerHolds(p.answer, x))).toBe(true);
          expectTidy(d);
        }
      }),
    );
  });
});

describe("graphing-inequalities: Topic Options", () => {
  it("does the chosen task", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        if (params.task === "graph") expect(isWrite(p.prompt)).toBe(false);
        if (params.task === "write") expect(isWrite(p.prompt)).toBe(true);
      }),
    );
    const tasks = new Set(Array.from({ length: 40 }, (_, s) => construct({ task: "mixed" }, createRng(s)).task));
    expect(tasks).toEqual(new Set(["graph", "write"]));
  });

  it("uses the chosen kinds of inequality", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.kinds === "simple") expect(k.solution.kind).toBe("ray");
        if (params.kinds === "compound") expect(["between", "outside"]).toContain(k.solution.kind);
      }),
    );
  });

  it("writes number-first inequalities only when asked, and only to graph", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (!params.reversed || k.task === "write") expect(k.reversed).toBe(false);
        const p = generator.generate({ ...params, task: "graph", kinds: "simple" }, seed);
        if (!params.reversed) expect(p.prompt).toMatch(/^x /);
      }),
    );
    const reversed = Array.from({ length: 100 }, (_, s) => construct({}, createRng(s))).filter((k) => k.reversed);
    expect(reversed.length).toBeGreaterThan(10);
  });

  it("keeps boundaries within Largest boundary value, fractions only when asked and only to graph", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const text = isWrite(p.prompt) ? p.answer : p.prompt;
        for (const n of printedNumbers(text)) expect(Math.abs(n)).toBeLessThanOrEqual(params.maxValue);
        if (!params.fractions || isWrite(p.prompt)) expect(text).not.toContain("\\frac");
      }),
    );
    const withFractions = Array.from({ length: 60 }, (_, s) => generator.generate({ fractions: true }, s));
    expect(withFractions.some((p) => p.prompt.includes("\\frac"))).toBe(true);
  });

  it("is deterministic and varied", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
      { numRuns: 30 },
    );
    const prompts = new Set(Array.from({ length: 100 }, (_, s) => generator.generate({}, s).prompt));
    expect(prompts.size).toBeGreaterThan(50);
  });
});

describe("graphing-inequalities: printing and Distractors", () => {
  const ray = { kind: "ray" as const, at: rat(-3), dir: "below" as const, closed: true };

  it("prints a number-first inequality and describes its graph", () => {
    expect(inequalityLatex({ task: "graph", solution: ray, reversed: true })).toBe("-3 \\ge x");
    expect(describeLatex(ray)).toBe("\\text{closed circle at } x = -3;\\quad \\text{shade left}");
  });

  it("lead with shading the wrong way, then the wrong circle", () => {
    expect(mistakes(ray).slice(0, 2).map(describeLatex)).toEqual([
      "\\text{closed circle at } x = -3;\\quad \\text{shade right}",
      "\\text{open circle at } x = -3;\\quad \\text{shade left}",
    ]);
  });
});
