import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { assemble, choiceKey } from "../../mc";
import { blankGraph, plot, type CoordinatePlaneSpec } from "../../plot";
import { buildSection } from "../../worksheet";
import {
  answerGraph,
  construct,
  distractors,
  generator,
  GRAPHING_LINEAR_ID,
  graphWindow,
  INTERCEPT_LIMIT,
  type GraphingLinearConstruction,
} from "./graphingLinear";
import { isVertical, lineGrid } from "../shared/lines";
import { satisfies } from "../shared/lines.testUtil";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyOptions = fc.record({
  form: fc.constantFrom("slopeIntercept", "standard", "pointSlope", "mixed"),
  fractions: fc.boolean(),
  includeSpecial: fc.boolean(),
  workSpace: fc.constantFrom("grid", "none"),
});

describe("graphing linear equations: built answer-first", () => {
  it("the printed equation passes through both chosen lattice points", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        const p = generator.generate(opts, seed);
        const [[x0, y0], [x1, y1]] = k.points;
        expect(x0 !== x1 || y0 !== y1).toBe(true);
        expect(satisfies(p.prompt, x0, y0)).toBe(true);
        expect(satisfies(p.prompt, x1, y1)).toBe(true);
        // and they are rise/run apart along the chosen slope
        expect(k.slope.rise * (x1 - x0) === k.slope.run * (y1 - y0)).toBe(true);
      }),
    );
  });

  it("states the chosen slope and intercept as the Answer", () => {
    expect(generator.generate({}, 1).answer).toMatch(/^m = -?\d+;\\quad \\text\{\$y\$-intercept: \} \(0, -?\d+\)$/);
  });

  it("honours the Topic Options", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        if (opts.form !== "mixed") expect(k.form).toBe(opts.form);
        if (!opts.fractions && !isVertical(k.slope)) expect(k.slope.run).toBe(1);
        if (!opts.includeSpecial) {
          expect(isVertical(k.slope)).toBe(false);
          expect(k.slope.rise).not.toBe(0);
        }
        expect(Math.abs(k.c)).toBeLessThanOrEqual(INTERCEPT_LIMIT);
        const p = generator.generate(opts, seed);
        expect(p.graph === undefined).toBe(opts.workSpace === "none");
      }),
    );
  });

  it("writes a point-slope equation through a point off the y-axis", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        const k = construct({ form: "pointSlope" }, createRng(seed));
        expect(k.points[1][0]).not.toBe(0);
        expect(generator.generate({ form: "pointSlope" }, seed).prompt).toMatch(/= .*x [+-] \d+\)?$/);
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
    for (const form of ["slopeIntercept", "standard", "pointSlope"]) {
      const s = buildSection({ generatorId: GRAPHING_LINEAR_ID, params: { form }, baseSeed: 2, count: 30 });
      expect(new Set(s.problems.map((p) => p.prompt)).size).toBe(30);
    }
  });
});

describe("graphing linear equations: graphs", () => {
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

  it("draws the Answer on the student's window, through both marked points, inside the grid", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate({ ...opts, workSpace: "grid" }, seed);
        const k = construct(opts, createRng(seed));
        const ag = p.answerGraph as CoordinatePlaneSpec;
        expect(blankGraph(ag)).toEqual(p.graph);
        expect(ag.points).toEqual(k.points.map(([x, y]) => ({ x, y })));
        const [line] = ag.curves!;
        if (line.kind !== "line") throw new Error("not a line");
        for (const { x, y } of ag.points!) {
          expect(Math.abs(x)).toBeLessThanOrEqual(9);
          expect(Math.abs(y)).toBeLessThanOrEqual(9);
          if (line.form === "vertical") expect(line.x).toBe(x);
          else expect(line.m * x + line.b).toBeCloseTo(y, 9);
        }
      }),
    );
  });

  it("the answer graph and blank grid share one window", () => {
    expect(blankGraph(answerGraph(construct({}, createRng(3))))).toEqual(graphWindow());
  });
});

describe("graphing linear equations: multiple choice", () => {
  it("offers at least three Distractors, distinct and never the Answer", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        const keys = p.distractorHints.map(choiceKey);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).not.toContain(choiceKey(p.answer));
        const { choices, correctIndex } = assemble(p, { choices: 5, seed });
        expect(choices[correctIndex]).toBe(p.answer);
      }),
    );
  });

  it("models the point-slope sign slip", () => {
    // y - 1 = 2(x - 3): slope 2 through (3, 1), y-intercept -5
    const k: GraphingLinearConstruction = {
      form: "pointSlope",
      slope: { rise: 2, run: 1 },
      c: -5,
      points: [
        [0, -5],
        [3, 1],
      ],
    };
    const hints = distractors(k);
    // read as through (-3, -1): -1 = 2(-3) + b gives b = 5, the same as the intercept sign slip
    expect(hints).toContain("m = 2;\\quad \\text{$y$-intercept: } (0, 5)");
    // the point's y taken as the intercept
    expect(hints).toContain("m = 2;\\quad \\text{$y$-intercept: } (0, 1)");
  });
});

describe("graphing linear equations: registration", () => {
  it("is registered under its id and title", () => {
    expect(generator.id).toBe(GRAPHING_LINEAR_ID);
    expect(generator.title).toBe("Graphing linear equations");
  });
});
