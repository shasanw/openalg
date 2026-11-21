import { expectDistinctChoices, slopeValue } from "../shared/distractors.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { assemble } from "../../mc";
import { lineSegment, plot, type CoordinatePlaneSpec } from "../../plot";
import { buildSection, questionKey } from "../../worksheet";
import { fractionToLatex } from "../../format";
import {
  construct,
  distractors,
  generator,
  SLOPE_ID,
  type SlopeConstruction,
  type SlopeSource,
} from "./slope";
import { lineGrid } from "../shared/lines";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyOptions = fc.record({
  source: fc.constantFrom<SlopeSource>("points", "graph", "mixed"),
  fractions: fc.boolean(),
  includeSpecial: fc.boolean(),
  maxCoordinate: fc.integer({ min: 3, max: 12 }),
});

describe("slope: built answer-first", () => {
  it("the Answer is rise over run between the two points", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        const p = generator.generate(opts, seed);
        const dx = k.p2[0] - k.p1[0];
        const dy = k.p2[1] - k.p1[1];
        // two different points: never a degenerate "line"
        expect(dx !== 0 || dy !== 0).toBe(true);
        expect(p.answer).toBe(dx === 0 ? "\\text{undefined}" : fractionToLatex(dy, dx));
        // and the chosen slope is that same value
        expect(k.slope.rise * dx === k.slope.run * dy).toBe(true);
      }),
    );
  });

  it("honours the Topic Options", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        if (opts.source !== "mixed") expect(k.source).toBe(opts.source);
        const M = k.source === "graph" ? Math.min(opts.maxCoordinate, 9) : opts.maxCoordinate;
        for (const v of [...k.p1, ...k.p2]) expect(Math.abs(v)).toBeLessThanOrEqual(M);
        if (!opts.fractions && k.slope.run !== 0) expect(k.slope.run).toBe(1);
        if (!opts.includeSpecial) {
          expect(k.slope.run).not.toBe(0);
          expect(k.slope.rise).not.toBe(0);
        }
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

  it("offers every kind of slope when asked", () => {
    const answers = new Set<string>();
    for (let seed = 0; seed < 400; seed++) {
      answers.add(generator.generate({ fractions: true, includeSpecial: true }, seed).answer);
    }
    expect(answers).toContain("0");
    expect(answers).toContain("\\text{undefined}");
    expect([...answers].some((a) => a.includes("\\frac"))).toBe(true);
    expect([...answers].some((a) => a.startsWith("-"))).toBe(true);
  });
});

describe("slope: from a graph", () => {
  it("draws the line through both marked points on the standard grid, labelling nothing", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate({ ...opts, source: "graph" }, seed);
        const k = construct({ ...opts, source: "graph" }, createRng(seed));
        expect(p.answerGraph).toBeUndefined();
        const g = p.graph as CoordinatePlaneSpec;
        const { curves, points, ...frame } = g;
        expect(frame).toEqual(lineGrid());
        expect(points).toEqual([
          { x: k.p1[0], y: k.p1[1] },
          { x: k.p2[0], y: k.p2[1] },
        ]);
        const [line] = curves!;
        if (line.kind !== "line") throw new Error("not a line");
        for (const [x, y] of [k.p1, k.p2]) {
          if (line.form === "vertical") expect(line.x).toBe(x);
          else expect(line.m * x + line.b).toBeCloseTo(y, 9);
        }
        expect(lineSegment(line, g.x, g.y)).not.toBeNull();
      }),
    );
  });

  it("gives a Section of graphs no repeated question, though every prompt reads the same", () => {
    const s = buildSection({ generatorId: SLOPE_ID, params: { source: "graph" }, baseSeed: 5, count: 20 });
    expect(new Set(s.problems.map((p) => p.prompt)).size).toBe(1);
    expect(new Set(s.problems.map(questionKey)).size).toBe(20);
    expect(new Set(s.problems.map((p) => plot(p.graph!))).size).toBe(20);
  });

  it("a Section of point pairs has no repeated prompt", () => {
    const s = buildSection({ generatorId: SLOPE_ID, baseSeed: 9, count: 30 });
    expect(new Set(s.problems.map((p) => p.prompt)).size).toBe(30);
  });
});

describe("slope: multiple choice", () => {
  it("offers at least four mistake-based Distractors, distinct and never the Answer", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        expectDistinctChoices(p, slopeValue);
        const { choices, correctIndex } = assemble(p, { choices: 5, seed });
        expect(choices[correctIndex]).toBe(p.answer);
      }),
    );
  });

  it("leads with rise and run swapped, then the sign error", () => {
    // (1, 2) to (3, 8): slope 3
    const k: SlopeConstruction = { source: "points", slope: { rise: 3, run: 1 }, p1: [1, 2], p2: [3, 8] };
    expect(distractors(k)).toContain("6"); // used the rise alone
    expect(distractors(k).slice(0, 4)).toEqual(["\\frac{1}{3}", "-3", "-\\frac{1}{3}", "\\frac{5}{2}"]);
  });
});

describe("slope: registration", () => {
  it("is registered under its id and title", () => {
    expect(generator.id).toBe(SLOPE_ID);
    expect(generator.title).toBe("Finding slope");
  });
});
