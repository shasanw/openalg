import { coefficients } from "../systems/systems.testUtil";
import { expectDistinctChoices } from "../shared/distractors.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { assemble } from "../../mc";
import { plot, type CoordinatePlaneSpec } from "../../plot";
import { buildSection, questionKey } from "../../worksheet";
import {
  construct,
  distractors,
  generator,
  INTERCEPT_LIMIT,
  WRITING_LINEAR_ID,
  type WritingConstruction,
} from "./writingLinear";
import { isVertical, lineGrid } from "../shared/lines";
import { satisfies } from "../shared/lines.testUtil";

function lineValue(tex: string) {
  const [a, b, c] = coefficients(tex);
  return b === 0 ? ["x", c / a] : ["y", (-a / b).toFixed(9), (c / b).toFixed(9)];
}

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyOptions = fc.record({
  given: fc.constantFrom("slopePoint", "twoPoints", "graph", "mixed"),
  answerForm: fc.constantFrom("slopeIntercept", "pointSlope", "standard"),
  fractions: fc.boolean(),
  includeSpecial: fc.boolean(),
});

describe("writing linear equations: built answer-first", () => {
  it("the Answer passes through every given point, with the chosen slope", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        const p = generator.generate(opts, seed);
        for (const [x, y] of k.points) expect(satisfies(p.answer, x, y)).toBe(true);
        // a second point one rise/run step along is on it too, so the slope is right
        const [x, y] = k.points[0];
        if (isVertical(k.slope)) expect(satisfies(p.answer, x, y + 1)).toBe(true);
        else expect(satisfies(p.answer, x + k.slope.run, y + k.slope.rise)).toBe(true);
        // and a point off the line is not
        expect(satisfies(p.answer, isVertical(k.slope) ? x + 0.5 : x, isVertical(k.slope) ? y : y + 0.5)).toBe(false);
      }),
    );
  });

  it("writes the Answer in the requested form", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        const a = generator.generate(opts, seed).answer;
        if (isVertical(k.slope)) expect(a).toMatch(/^x = -?\d+$/);
        else if (k.slope.rise === 0) expect(a).toMatch(/^y = -?\d+$/);
        else if (opts.answerForm === "slopeIntercept") expect(a).toMatch(/^y = [^=y]*x[^=y]*$/);
        else if (opts.answerForm === "standard") {
          expect(a).toMatch(/^\d*x [+-] \d*y = -?\d+$/);
          expect(a).not.toContain("\\frac");
        } else {
          const [x1, y1] = k.points[0];
          const sign = (v: number) => (v === 0 ? "" : ` ${v > 0 ? "-" : "+"} ${Math.abs(v)}`);
          expect(a.startsWith(`y${sign(y1)} = `)).toBe(true);
          expect(a).toContain(`x${sign(x1)}`);
        }
      }),
    );
  });

  it("honours the Topic Options", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        if (opts.given !== "mixed") expect(k.given).toBe(opts.given);
        expect(k.form).toBe(opts.answerForm);
        expect(k.points).toHaveLength(k.given === "slopePoint" ? 1 : 2);
        if (k.points.length === 2) expect(k.points[0]).not.toEqual(k.points[1]);
        for (const [x, y] of k.points) {
          expect(Math.abs(x)).toBeLessThanOrEqual(9);
          expect(Math.abs(y)).toBeLessThanOrEqual(9);
        }
        expect(Math.abs(k.c)).toBeLessThanOrEqual(INTERCEPT_LIMIT);
        if (!opts.fractions && !isVertical(k.slope)) expect(k.slope.run).toBe(1);
        if (!opts.includeSpecial) {
          expect(isVertical(k.slope)).toBe(false);
          expect(k.slope.rise).not.toBe(0);
          // a given point is never the y-intercept itself (that would hand over b),
          // except the marked intercept on a graph
          if (k.given !== "graph") for (const [x] of k.points) expect(x).not.toBe(0);
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

  it("a Section has no repeated question", () => {
    for (const given of ["slopePoint", "twoPoints", "graph"]) {
      const s = buildSection({ generatorId: WRITING_LINEAR_ID, params: { given }, baseSeed: 6, count: 24 });
      expect(new Set(s.problems.map(questionKey)).size).toBe(24);
    }
  });
});

describe("writing linear equations: from a graph", () => {
  it("draws the line through the marked y-intercept and one more point, labelling nothing", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate({ ...opts, given: "graph" }, seed);
        const k = construct({ ...opts, given: "graph" }, createRng(seed));
        expect(p.answerGraph).toBeUndefined();
        const { curves, points, ...frame } = p.graph as CoordinatePlaneSpec;
        expect(frame).toEqual(lineGrid());
        expect(points).toEqual(k.points.map(([x, y]) => ({ x, y })));
        if (!isVertical(k.slope) && k.slope.rise !== 0) expect(k.points[1]).toEqual([0, k.c]);
        const [line] = curves!;
        if (line.kind !== "line") throw new Error("not a line");
        for (const [x, y] of k.points) {
          if (line.form === "vertical") expect(line.x).toBe(x);
          else expect(line.m * x + line.b).toBeCloseTo(y, 9);
        }
        expect(points!.every((pt) => pt.label === undefined)).toBe(true);
        expect(plot(p.graph!)).toContain("<path d='M"); // the line itself is drawn
      }),
    );
  });
});

describe("writing linear equations: multiple choice", () => {
  it("offers at least four Distractors, distinct and never the Answer", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        expectDistinctChoices(p, lineValue);
        const { choices, correctIndex } = assemble(p, { choices: 5, seed });
        expect(choices[correctIndex]).toBe(p.answer);
      }),
    );
  });

  it("excludes equivalent point-slope equations through a different point", () => {
    const p = generator.generate({ answerForm: "pointSlope" }, 4294967295);
    expect(p.answer).toBe("y = -(x - 3)");
    for (const hint of p.distractorHints)
      expect([0, 1].every(x => satisfies(hint, x, 3 - x)), hint).toBe(false);
  });

  it("still offers three Distractors when a slope of -1 passes through a point on y = -x", () => {
    // Through (3, -3) with m = -1: the unflipped point (-3, 3) and the swapped
    // point both lie on the Answer's own line, so they are dropped.
    const p = generator.generate({ answerForm: "pointSlope" }, 1);
    expect(p.answer).toBe("y + 3 = -(x - 3)");
    expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
    for (const hint of p.distractorHints)
      expect([0, 1].every((x) => satisfies(hint, x, -x)), hint).toBe(false);
  });

  it("models the classic mistakes", () => {
    // through (2, 1) with slope 3: y = 3x - 5
    const k: WritingConstruction = { given: "slopePoint", form: "slopeIntercept", slope: { rise: 3, run: 1 }, c: -5, points: [[2, 1]] };
    expect(distractors(k)).toEqual([
      "y = -3x + 7", // slope sign
      "y = \\frac{1}{3}x + \\frac{1}{3}", // rise and run swapped
      "y = 3x + 7", // b = y1 + m x1
      "y = 3x + 1", // b taken as the point's y
      "y = 3x - 1", // the point's coordinates swapped: through (1, 2)
      "y = -\\frac{1}{3}x + \\frac{5}{3}", // the negative reciprocal
      "y = 4x - 7", // the rise miscounted by one
      "y = 3x", // omitted the intercept
      "y = 3x - 7", // changed the sign of the point’s y-coordinate
    ]);
    expect(distractors({ ...k, form: "pointSlope" }).slice(0, 3)).toEqual([
      "y - 1 = -3(x - 2)",
      "y - 1 = \\frac{1}{3}(x - 2)",
      "y + 1 = 3(x + 2)",
    ]);
  });
});

describe("writing linear equations: registration", () => {
  it("is registered under its id and title", () => {
    expect(generator.id).toBe(WRITING_LINEAR_ID);
    expect(generator.title).toBe("Writing linear equations");
  });
});
