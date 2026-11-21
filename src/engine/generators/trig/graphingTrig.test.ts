// Every check reads the BAKED prompt and Answer strings and recomputes the
// features from the printed equation numerically (sampling, period search,
// pole finding), never from the generator's construction.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { assemble, choiceKey } from "../../mc";
import { blankGraph, plot, graphSpecProblem, type CoordinatePlaneSpec, type TrigCurve } from "../../plot";
import type { ParamValues, Problem } from "../../types";
import { anySeed, expectLowestTerms, expectRenders } from "./trig.testkit";
import { generator, GRAPHING_TRIG_ID, schema } from "./graphingTrig";
import {
  near,
  curveValue,
  FN_NAMES,
  describesSameFunction,
  expectCorrectAnswer,
  readAnswer,
  readParts,
  readPrompt,
} from "./graphingTrig.answer.testkit";

const PI = Math.PI;

// ------------------------------------------------------------------ options

const enumValues = (key: string) => {
  const f = schema.find((s) => s.key === key)!;
  return f.type === "enum" ? f.options.map((o) => o.value) : [];
};
const anyOptions = fc.record({
  functions: fc.constantFrom(...enumValues("functions")),
  phaseShift: fc.boolean(),
  verticalShift: fc.boolean(),
  reflections: fc.boolean(),
  form: fc.constantFrom(...enumValues("form")),
  periods: fc.constantFrom(...enumValues("periods")),
  workSpace: fc.constantFrom(...enumValues("workSpace")),
});

/** Every combination of every Topic Option. */
function everyCombination(): ParamValues[] {
  let out: ParamValues[] = [{}];
  for (const f of schema) {
    const values: (string | boolean)[] = f.type === "enum" ? f.options.map((o) => o.value) : [true, false];
    out = out.flatMap((o) => values.map((v) => ({ ...o, [f.key]: v })));
  }
  return out;
}


function expectGraphs(p: Problem, opts: ParamValues): void {
  const printed = readPrompt(p.prompt);
  const stated = readAnswer(p.answer);
  if (opts.workSpace === "none") {
    expect(p.graph).toBeUndefined();
    expect(p.answerGraph).toBeUndefined();
    return;
  }
  const g = p.graph as CoordinatePlaneSpec;
  const ag = p.answerGraph as CoordinatePlaneSpec;
  expect(graphSpecProblem(ag)).toBeNull();
  expect(g).toEqual(blankGraph(g));
  expect(blankGraph(ag)).toEqual(g);
  expect(ag.curves).toHaveLength(1);
  const curve = ag.curves![0] as TrigCurve;
  expect(curve.kind).toBe("trig");
  expect(curve.fn).toBe(printed.fn);
  // The drawn curve is the printed function.
  for (let i = 0; i <= 160; i++) {
    const x = g.x.min + ((g.x.max - g.x.min) * i) / 160 + 1e-4;
    const want = printed.g(x);
    if (Math.abs(want) > 1e4) continue;
    expect(near(curveValue(curve, x), want, 1e-9), `${p.prompt} at ${x}`).toBe(true);
  }
  // At least one full period (two when asked) across the window.
  const periods = opts.periods === "two" ? 2 : 1;
  expect(g.x.max - g.x.min).toBeGreaterThanOrEqual(periods * stated.period - 1e-9);
  // Key points (every quarter period from the phase shift) on grid lines, a square inside the window.
  const onGrid = (v: number, step: number) => near(v / step, Math.round(v / step), 1e-9);
  for (let j = -32; j <= 32; j++) {
    const x = stated.shift + (j * stated.period) / 4;
    if (x < g.x.min || x > g.x.max) continue;
    expect(onGrid(x, g.xStep), `${p.prompt}: key x ${x}`).toBe(true);
    const y = printed.g(x);
    if (Math.abs(y) > 1e6) continue;
    expect(onGrid(y, g.yStep), `${p.prompt}: key y ${y}`).toBe(true);
    expect(Math.abs(y)).toBeLessThanOrEqual(g.y.max - g.yStep + 1e-9);
  }
  for (const x of stated.asymptotes ? [stated.asymptotes.start, stated.asymptotes.spacing] : []) {
    expect(onGrid(x, g.xStep)).toBe(true);
  }
}

/** A Distractor changes exactly one part, and that part is really wrong. */
function expectWrongDistractor(p: Problem, hint: string): void {
  const printed = readPrompt(p.prompt);
  const right = readParts(p.answer);
  const wrong = readParts(hint);
  expect([...wrong.keys()]).toEqual([...right.keys()]);
  const changed = [...right.keys()].filter((k) => right.get(k) !== wrong.get(k));
  expect(changed, hint).toHaveLength(1);
  const r = readAnswer(p.answer);
  const w = readAnswer(hint);
  switch (changed[0]) {
    case "Amplitude":
      expect(near(w.amplitude!, r.amplitude!)).toBe(false);
      break;
    case "Period":
      expect(near(w.period, r.period)).toBe(false);
      break;
    case "Vertical shift":
      expect(near(w.vshift, r.vshift)).toBe(false);
      break;
    case "Phase shift":
      // Not the same graph (shifted by a whole period), with the printed a.
      const { a } = describesSameFunction(printed, r.period, r.shift, r.vshift);
      expect(describesSameFunction(printed, r.period, w.shift, r.vshift, a).same, hint).toBe(false);
      break;
    case "Asymptotes": {
      const { start, spacing } = w.asymptotes!;
      const sameSet =
        near(spacing, r.asymptotes!.spacing) &&
        near(((start - r.asymptotes!.start) / spacing) % 1, 0, 1e-9);
      expect(sameSet, hint).toBe(false);
      break;
    }
  }
}

// ------------------------------------------------------------------ tests

describe("graphing-trig: the Answer is right for the printed equation", () => {
  it("for any seed and options", { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        expectCorrectAnswer(p);
        expectGraphs(p, opts);
      }),
      { numRuns: 300 },
    );
  });

  it("for every combination of Topic Options", { timeout: 60_000 }, () => {
    for (const [i, opts] of everyCombination().entries()) {
      for (const seed of [7919 * i + 13]) {
        const p = generator.generate(opts, seed);
        expectCorrectAnswer(p);
        expectGraphs(p, opts);
      }
    }
  });
});

describe("graphing-trig: Topic Options", () => {
  it("are honoured", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        const printed = readPrompt(p.prompt);
        const stated = readAnswer(p.answer);
        const allowed: Record<string, string[]> = {
          sinCos: ["sin", "cos"],
          tanCot: ["tan", "cot"],
          secCsc: ["sec", "csc"],
          all: [...FN_NAMES],
        };
        expect(allowed[opts.functions]).toContain(printed.fn);
        expect(stated.shift !== 0).toBe(opts.phaseShift);
        expect(stated.vshift !== 0).toBe(opts.verticalShift);
        const { a } = describesSameFunction(printed, stated.period, stated.shift, stated.vshift);
        if (!opts.reflections) expect(a).toBeGreaterThan(0);
        // Factored prints x − c inside b(...); expanded prints bx − bc (identical when b = 1).
        const B = printed.arg(1) - printed.arg(0);
        if (opts.form === "factored" && B !== 1 && opts.phaseShift) expect(p.prompt).toMatch(/\\left\(x [+-] /);
        if (opts.form === "expanded") expect(p.prompt).not.toMatch(/\d\\left\(x/);
      }),
      { numRuns: 300 },
    );
  });

  it("every option value occurs: each function, b, both signs of a, c and d, both forms", { timeout: 30_000 }, () => {
    const seen = new Set<string>();
    for (let s = 0; s < 3000; s++) {
      const p = generator.generate({ functions: "all", reflections: true, form: "mixed" }, s);
      const printed = readPrompt(p.prompt);
      const st = readAnswer(p.answer);
      const B = printed.arg(1) - printed.arg(0);
      seen.add(printed.fn).add(`b${B}`).add(`c${Math.sign(st.shift)}`).add(`d${Math.sign(st.vshift)}`);
      seen.add(p.prompt.includes("x - ") || p.prompt.includes("x + ") ? "x-c" : "nox-c");
      seen.add(describesSameFunction(printed, st.period, st.shift, st.vshift).a > 0 ? "a+" : "a-");
    }
    for (const k of [...FN_NAMES, "b0.5", "b1", "b2", "c1", "c-1", "d1", "d-1", "a+", "a-"]) expect(seen).toContain(k);
  });

  it("the prompt and Answer render and print fractions of π in lowest terms", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        for (const tex of [p.prompt, p.answer, ...p.distractorHints]) {
          expectRenders(tex);
          expectLowestTerms(tex);
        }
      }),
      { numRuns: 100 },
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

describe("graphing-trig: the student's grid gives nothing away", () => {
  it("is blank and the same window for every Problem under every option", () => {
    const grids = new Set<string>();
    const specs = new Set<string>();
    for (const [i, opts] of everyCombination().entries()) {
      if (opts.workSpace !== "grid") continue;
      for (const seed of [i, 31 * i + 5, 1e6 + i]) {
        const p = generator.generate(opts, seed);
        expect(p.graph).toEqual(blankGraph(p.graph!));
        specs.add(JSON.stringify(p.graph));
        grids.add(plot(p.graph!));
      }
    }
    expect(specs.size).toBe(1);
    expect(grids.size).toBe(1);
  });
});

describe("graphing-trig: multiple choice", () => {
  it("offers at least three mistake-based Distractors, distinct, each really wrong", { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        const keys = p.distractorHints.map(choiceKey);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).not.toContain(choiceKey(p.answer));
        for (const h of p.distractorHints) {
          // b-as-the-period prints a plain number for the period, still parseable.
          expectWrongDistractor(p, h);
        }
        const { choices, correctIndex } = assemble(p, { choices: 4, seed });
        expect(choices[correctIndex]).toBe(p.answer);
        for (const c of choices) expect([p.answer, ...p.distractorHints]).toContain(c);
      }),
      { numRuns: 300 },
    );
  });

  it("includes the named mistakes when they apply", () => {
    // y = 2 sin(2x − π/2) + 1 style: expanded, b = 2.
    for (let s = 0; s < 400; s++) {
      const p = generator.generate({ functions: "sinCos", form: "expanded", reflections: true }, s);
      const printed = readPrompt(p.prompt);
      const r = readAnswer(p.answer);
      const B = printed.arg(1) - printed.arg(0);
      const ws = p.distractorHints.map(readAnswer);
      if (B !== 1) {
        expect(ws.some((w) => near(w.period, 2 * PI * B))).toBe(true); // 2π·b
        expect(ws.some((w) => near(w.shift, r.shift * B))).toBe(true); // bc, not divided by b
      }
      expect(ws.some((w) => near(w.shift, -r.shift))).toBe(true); // sign flipped
      expect(ws.some((w) => near(w.vshift, -r.vshift))).toBe(true);
      const { a } = describesSameFunction(printed, r.period, r.shift, r.vshift);
      if (a < 0) expect(ws.some((w) => near(w.amplitude!, a))).toBe(true); // a without |.|
    }
    for (let s = 0; s < 100; s++) {
      const p = generator.generate({ functions: "tanCot" }, s);
      const r = readAnswer(p.answer);
      expect(p.distractorHints.map(readAnswer).some((w) => near(w.period, 2 * r.period))).toBe(true); // tan as 2π/b
    }
  });
});

describe("graphing-trig: registration", () => {
  it("has its id, title and directions", () => {
    expect(generator.id).toBe(GRAPHING_TRIG_ID);
    expect(generator.title).toBe("Graphing trig functions");
    expect(generator.defaultDirections).toMatch(/period/);
  });

  it("a worked example: y = 2 sin(2x − π/2) + 1", () => {
    // Found by search so the example does not depend on the generator's internals.
    let found: Problem | undefined;
    for (let s = 0; s < 5000 && !found; s++) {
      const p = generator.generate({ form: "expanded", functions: "sinCos" }, s);
      if (p.prompt === "y = 2\\sin\\left(2x - \\frac{\\pi}{2}\\right) + 1") found = p;
    }
    expect(found).toBeDefined();
    expect(found!.answer).toBe(
      [
        "\\text{Amplitude: } 2",
        "\\text{Period: } \\pi",
        "\\text{Phase shift: } \\frac{\\pi}{4} \\text{ right}",
        "\\text{Vertical shift: } 1 \\text{ up}",
      ].join(ANSWER_PART_SEPARATOR),
    );
  });
});
