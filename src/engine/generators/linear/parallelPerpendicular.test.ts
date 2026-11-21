import { expectDistinctChoices, slopeValue } from "../shared/distractors.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { assemble } from "../../mc";
import { buildSection } from "../../worksheet";
import {
  construct,
  distractors,
  generator,
  PARALLEL_PERPENDICULAR_ID,
  type PPConstruction,
} from "./parallelPerpendicular";
import { isVertical, lineSlope, q, slope, type Line, type Slope } from "../shared/lines";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyOptions = fc.record({
  ask: fc.constantFrom("slope", "classify", "mixed"),
  relation: fc.constantFrom("both", "parallel", "perpendicular"),
  given: fc.constantFrom("slopeIntercept", "standard", "slope", "mixed"),
  fractions: fc.boolean(),
  includeSpecial: fc.boolean(),
});

/** Slopes as exact products: m1 * m2 = -1, with vertical and horizontal handled. */
const parallel = (a: Slope, b: Slope) => a.rise * b.run === b.rise * a.run;
const perpendicular = (a: Slope, b: Slope) => a.rise * b.rise + a.run * b.run === 0;
const sameLine = (a: Line, b: Line) =>
  a.vertical && b.vertical
    ? a.x.n === b.x.n && a.x.d === b.x.d
    : !a.vertical && !b.vertical && a.m.n === b.m.n && a.m.d === b.m.d && a.b.n === b.b.n && a.b.d === b.b.d;

describe("parallel and perpendicular slopes: built answer-first", () => {
  it("a found slope is parallel or perpendicular to the given line, as asked", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        if (k.ask !== "slope") return;
        const s = lineSlope(k.given.line);
        if (k.relation === "parallel") expect(parallel(s, k.answer)).toBe(true);
        else expect(perpendicular(s, k.answer)).toBe(true);
      }),
    );
  });

  it("classified lines really are parallel (and different), perpendicular, or neither", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        if (k.ask !== "classify") return;
        const [a, b] = k.given.map((g) => g.line);
        const [s, t] = [lineSlope(a), lineSlope(b)];
        expect(parallel(s, t)).toBe(k.relation === "parallel");
        expect(perpendicular(s, t)).toBe(k.relation === "perpendicular");
        expect(sameLine(a, b)).toBe(false);
        if (k.given[0].form === "slope") expect(k.given[1].form).toBe("slope");
      }),
    );
  });

  it("honours the Topic Options", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        if (opts.ask !== "mixed") expect(k.ask).toBe(opts.ask);
        const lines = k.ask === "slope" ? [k.given] : k.given;
        for (const g of lines) {
          if (opts.given !== "mixed") expect(g.form).toBe(opts.given);
          const s = lineSlope(g.line);
          if (!opts.includeSpecial) expect(isVertical(s) || s.rise === 0).toBe(false);
          // whole-number slopes, or the negative reciprocal of one
          if (!opts.fractions && !isVertical(s) && s.rise !== 0) {
            expect(s.run === 1 || Math.abs(s.rise) === 1).toBe(true);
          }
        }
        if (k.ask === "slope" && opts.relation !== "both") expect(k.relation).toBe(opts.relation);
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

  it("classifies all three ways, evenly enough to fill a Section", () => {
    const answers = new Map<string, number>();
    for (let seed = 0; seed < 300; seed++) {
      const a = generator.generate({ ask: "classify" }, seed).answer;
      answers.set(a, (answers.get(a) ?? 0) + 1);
    }
    expect([...answers.keys()].sort()).toEqual(["\\text{Neither}", "\\text{Parallel}", "\\text{Perpendicular}"]);
    for (const n of answers.values()) expect(n).toBeGreaterThan(60);
  });

  it("writes each line as it is given", () => {
    expect(generator.generate({ given: "standard", relation: "parallel" }, 1).prompt).toMatch(
      /^\\text\{Parallel to \} -?\d*x [+-] \d*y = -?\d+$/,
    );
    expect(generator.generate({ given: "slope", relation: "perpendicular" }, 1).prompt).toMatch(
      /^\\text\{Perpendicular to \} \\text\{a line with \} m = -?\d+$/,
    );
  });

  it("a Section has no repeated prompt", () => {
    for (const ask of ["slope", "classify"]) {
      const s = buildSection({ generatorId: PARALLEL_PERPENDICULAR_ID, params: { ask }, baseSeed: 4, count: 30 });
      expect(new Set(s.problems.map((p) => p.prompt)).size).toBe(30);
    }
  });
});

describe("parallel and perpendicular slopes: multiple choice", () => {
  it("offers at least four Distractors, distinct and never the Answer", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        expectDistinctChoices(p, slopeValue);
        const { choices, correctIndex } = assemble(p, { choices: 5, seed });
        expect(choices[correctIndex]).toBe(p.answer);
      }),
    );
  });

  it("models the classic mistakes: parallel for perpendicular, reciprocal without the sign, sign without the reciprocal", () => {
    const k: PPConstruction = {
      ask: "slope",
      relation: "perpendicular",
      given: { line: { vertical: false, m: q(2, 3), b: q(1) }, form: "slopeIntercept" },
      answer: slope(-3, 2),
    };
    expect(distractors(k)).toContain("\\text{Cannot be determined}"); // assumed a point was required
    expect(distractors(k).slice(0, 4)).toEqual(["\\frac{2}{3}", "\\frac{3}{2}", "-\\frac{2}{3}", "1"]);
  });
});

describe("parallel and perpendicular slopes: registration", () => {
  it("is registered under its id and title", () => {
    expect(generator.id).toBe(PARALLEL_PERPENDICULAR_ID);
    expect(generator.title).toBe("Slopes of parallel and perpendicular lines");
  });
});
