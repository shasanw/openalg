import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { assemble, choiceKey } from "../mc";
import { blankGraph, plot, type CoordinatePlaneSpec } from "../plot";
import { factsFrom, answerToLatex } from "./parabolaProperties";
import {
  answerGraph,
  construct,
  FEATURE_LIMIT,
  featurePoints,
  generator,
  graphWindow,
  GRAPHING_QUADRATICS_ID,
  type GraphForm,
} from "./graphingQuadratics";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const FORMS: GraphForm[] = ["vertex", "standard", "mixed"];
const anyOptions = fc.record({
  form: fc.constantFrom(...FORMS),
  allowLeadingCoefficient: fc.boolean(),
  allowOpensDown: fc.boolean(),
  allowNoXIntercepts: fc.boolean(),
  maxValue: fc.integer({ min: 2, max: FEATURE_LIMIT }),
  workSpace: fc.constantFrom("grid", "none"),
});

describe("graphing-quadratics: built answer-first", () => {
  it("expands the chosen vertex and intercepts into the printed coefficients", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        const f = (x: number) => k.a * x * x + k.b * x + k.c;
        expect(Number.isInteger(k.a) && k.a !== 0).toBe(true);
        expect([k.b, k.c, k.h, k.k].every(Number.isInteger)).toBe(true);
        // the vertex is on the curve, on its axis 2ah + b = 0
        expect(f(k.h)).toBe(k.k);
        expect(2 * k.a * k.h + k.b).toBe(0);
        // the chosen intercepts are zeros; with none, the vertex is on the far side of the axis
        if (k.m > 0) {
          expect(f(k.h - k.m)).toBe(0);
          expect(f(k.h + k.m)).toBe(0);
        } else {
          expect(Math.sign(k.k)).toBe(Math.sign(k.a));
          expect(opts.allowNoXIntercepts).toBe(true);
        }
        // and the y-intercept is c
        expect(f(0)).toBe(k.c);
      }),
    );
  });

  it("honours the Topic Options", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        if (!opts.allowLeadingCoefficient) expect(Math.abs(k.a)).toBe(1);
        if (!opts.allowOpensDown) expect(k.a).toBeGreaterThan(0);
        if (opts.form !== "mixed") expect(k.form).toBe(opts.form);
        expect(Math.abs(k.h)).toBeLessThanOrEqual(opts.maxValue);
        expect(Math.abs(k.k)).toBeLessThanOrEqual(opts.maxValue);
        if (k.m > 0) {
          expect(Math.abs(k.h - k.m)).toBeLessThanOrEqual(opts.maxValue);
          expect(Math.abs(k.h + k.m)).toBeLessThanOrEqual(opts.maxValue);
        }
      }),
    );
  });

  it("states the Answer read off the construction", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        const k = construct(opts, createRng(seed));
        expect(p.answer).toBe(answerToLatex(factsFrom(k.a, k.b, k.c), "all"));
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
});

describe("graphing-quadratics: graphs", () => {
  const inWindow = (g: CoordinatePlaneSpec, x: number, y: number) =>
    x >= g.x.min + g.xStep && x <= g.x.max - g.xStep && y >= g.y.min + g.yStep && y <= g.y.max - g.yStep;

  it("the grid fits the vertex and every intercept, a square in from the edge", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        const g = graphWindow(k);
        for (const q of featurePoints(k)) expect(inWindow(g, q.x, q.y)).toBe(true);
      }),
    );
  });

  it("gives nothing away: the student's grid is blank and the same for every Problem", () => {
    const grids = new Set<string>();
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate({ ...opts, workSpace: "grid" }, seed);
        expect(p.graph).toBeDefined();
        expect(p.graph).toEqual(blankGraph(p.graph!));
        grids.add(plot(p.graph!));
      }),
    );
    expect(grids.size).toBe(1);
  });

  it("draws the Answer on the student's window, through the vertex and intercepts it states", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate({ ...opts, workSpace: "grid" }, seed);
        const k = construct(opts, createRng(seed));
        const ag = p.answerGraph as CoordinatePlaneSpec;
        expect(blankGraph(ag)).toEqual(p.graph);
        expect(ag.curves).toEqual([{ kind: "parabola", form: "vertex", a: k.a, h: k.h, k: k.k }]);
        expect(ag.lines).toEqual([{ x: k.h, dashed: true }]);
        const f = (x: number) => k.a * (x - k.h) ** 2 + k.k;
        for (const pt of ag.points!) {
          expect(f(pt.x)).toBe(pt.y);
          expect(inWindow(ag, pt.x, pt.y)).toBe(true);
        }
        // vertex, y-intercept and each x-intercept, each marked once
        const marked = new Set(ag.points!.map((q) => `${q.x},${q.y}`));
        expect(marked.size).toBe(ag.points!.length);
        for (const q of featurePoints(k)) expect(marked.has(`${q.x},${q.y}`)).toBe(true);
      }),
    );
  });

  it("prints no grid when the work space is the student's own graph paper", () => {
    const p = generator.generate({ workSpace: "none" }, 7);
    expect(p.graph).toBeUndefined();
    expect(p.answerGraph).toBeDefined();
  });
});

describe("graphing-quadratics: multiple choice", () => {
  // A vertex on the y-axis makes several mistakes harmless (h = -h, c = k), so
  // three is the floor; the assembler tops a fifth choice up with fallbacks.
  it("offers at least three text Distractors, distinct from the Answer and from each other", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        const keys = p.distractorHints.map(choiceKey);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).not.toContain(choiceKey(p.answer));
        const { choices, correctIndex } = assemble(p, { choices: 4, seed });
        expect(choices[correctIndex]).toBe(p.answer);
        // every choice comes from the mistake-based hints, not the fallback
        for (const c of choices) expect([p.answer, ...p.distractorHints]).toContain(c);
      }),
    );
  });
});

describe("graphing-quadratics: registration", () => {
  it("is registered under its id and title", () => {
    expect(generator.id).toBe(GRAPHING_QUADRATICS_ID);
    expect(generator.title).toBe("Graphing quadratics");
  });

  it("the answer graph and blank grid are drawn from the same window function", () => {
    const k = construct({}, createRng(3));
    expect(blankGraph(answerGraph(k))).toEqual(graphWindow(k));
  });
});
