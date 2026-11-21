// Every check reads the BAKED prompt and Answer strings and recomputes the
// features from the printed equation numerically (sampling, period search,
// pole finding), never from the generator's construction.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { assemble, choiceKey } from "../../mc";
import { blankGraph, plot, graphSpecProblem, type CoordinatePlaneSpec, type TrigCurve } from "../../plot";
import type { ParamValues, Problem } from "../../types";
import { evalLatex, splitEquation } from "../shared/latexEval.testkit";
import { anySeed, expectLowestTerms, expectRenders } from "./trig.testkit";
import { generator, GRAPHING_TRIG_ID, schema } from "./graphingTrig";

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

// ------------------------------------------------------------------ reading the prompt

const FN_NAMES = ["sin", "cos", "tan", "cot", "sec", "csc"] as const;
type Fn = (typeof FN_NAMES)[number];
const F: Record<Fn, (u: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  cot: (u) => Math.cos(u) / Math.sin(u),
  sec: (u) => 1 / Math.cos(u),
  csc: (u) => 1 / Math.sin(u),
};

interface Printed {
  fn: Fn;
  /** The printed function y(x), evaluated from the prompt LaTeX. */
  g: (x: number) => number;
  /** The printed argument of fn as a function of x. */
  arg: (x: number) => number;
}

function readPrompt(prompt: string): Printed {
  const [lhs, rhs] = splitEquation(prompt);
  expect(lhs).toBe("y");
  const m = rhs.match(/\\(sin|cos|tan|cot|sec|csc)(?:\\left\((.*)\\right\)| (\d*x))/);
  expect(m, prompt).not.toBeNull();
  const argTex = m![2] ?? m![3];
  return {
    fn: m![1] as Fn,
    g: (x) => evalLatex(rhs, { x }),
    arg: (x) => evalLatex(argTex, { x }),
  };
}

// ------------------------------------------------------------------ reading the Answer

interface Stated {
  amplitude?: number;
  period: number;
  /** Signed: right is positive. */
  shift: number;
  vshift: number;
  asymptotes?: { start: number; spacing: number };
}

const PART = /^\\text\{([A-Za-z ]+):( none)? ?\}\s*(.*?)(?:\s*\\text\{ (right|left|up|down)\})?$/;

function readParts(answer: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const p of answer.split(ANSWER_PART_SEPARATOR)) {
    const m = p.match(PART);
    expect(m, p).not.toBeNull();
    parts.set(m![1], p);
  }
  return parts;
}

function readAnswer(answer: string): Stated {
  const out: Partial<Stated> = {};
  for (const p of answer.split(ANSWER_PART_SEPARATOR)) {
    const [, label, none, value, dir] = p.match(PART)!;
    const signed = () => (none ? 0 : evalLatex(value) * (dir === "left" || dir === "down" ? -1 : 1));
    if (label === "Amplitude") out.amplitude = evalLatex(value);
    else if (label === "Period") out.period = evalLatex(value);
    else if (label === "Phase shift") {
      expect(none || dir === "right" || dir === "left").toBeTruthy();
      out.shift = signed();
    } else if (label === "Vertical shift") {
      expect(none || dir === "up" || dir === "down").toBeTruthy();
      out.vshift = signed();
    } else if (label === "Asymptotes") {
      const [x, rhs] = splitEquation(value);
      expect(x).toBe("x");
      const s0 = evalLatex(rhs, { k: 0 });
      out.asymptotes = { start: s0, spacing: evalLatex(rhs, { k: 1 }) - s0 };
    } else throw new Error(`unknown part ${label}`);
  }
  return out as Stated;
}

// ------------------------------------------------------------------ numerics

const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const SAMPLES = Array.from({ length: 97 }, (_, i) => -4 * PI + 0.0731 + (i * 8 * PI) / 97);

/**
 * The smallest p = jπ/8 (j = 1..64) with g(x + p) = g(x) at 65 points across
 * 8π (a lattice π/8 apart, off every special angle), skipping points near a pole.
 */
function numericPeriod(g: (x: number) => number): number {
  const at = Array.from({ length: 129 }, (_, i) => g(-4 * PI + 0.0731 + (i * PI) / 8));
  for (let j = 1; j <= 64; j++) {
    let ok = true;
    for (let i = 0; i + j < at.length && i <= 64; i++) {
      const [u, v] = [at[i], at[i + j]];
      if (Math.abs(u) > 1e4 || Math.abs(v) > 1e4) continue;
      if (!near(u, v, 1e-7)) {
        ok = false;
        break;
      }
    }
    if (ok) return (j * PI) / 8;
  }
  throw new Error("no period up to 8π");
}

/** Where g blows up over [lo, hi]: a sign change with |g| large on both sides, refined by bisection. */
function numericPoles(g: (x: number) => number, lo: number, hi: number): number[] {
  const n = 40000;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let p = lo + ((hi - lo) * i) / n;
    let q = lo + ((hi - lo) * (i + 1)) / n;
    if (Math.sign(g(p)) === Math.sign(g(q))) continue;
    for (let k = 0; k < 60; k++) {
      const m = (p + q) / 2;
      if (Math.sign(g(m)) === Math.sign(g(p))) p = m;
      else q = m;
    }
    // A pole, not a zero crossing: |g| is huge just either side.
    if (Math.abs(g(p)) > 1e5 && Math.abs(g(q)) > 1e5) out.push((p + q) / 2);
  }
  return out;
}

/** Sampled values of g over the window, densely. */
function dense(g: (x: number) => number, n = 20000): number[] {
  return Array.from({ length: n + 1 }, (_, i) => g(-2 * PI + (4 * PI * i) / n));
}

const curveValue = (c: TrigCurve, x: number) => c.a * F[c.fn](c.b * (x - c.c)) + c.d;

/** a·fn(B(x − s)) + D fitted at one well-behaved sample for a, then checked at every sample. */
function describesSameFunction(
  p: Printed,
  period: number,
  shift: number,
  vshift: number,
  fixedA?: number,
): { same: boolean; a: number; fitted: (x: number) => number } {
  const B = (["tan", "cot"].includes(p.fn) ? PI : 2 * PI) / period;
  const h = (x: number) => F[p.fn](B * (x - shift));
  const x0 = SAMPLES.find((x) => Math.abs(h(x)) > 0.3 && Math.abs(h(x)) < 3 && Math.abs(p.g(x)) < 1e3)!;
  const a = fixedA ?? (p.g(x0) - vshift) / h(x0);
  const same = SAMPLES.every((x) => {
    const want = p.g(x);
    return Math.abs(want) > 1e4 || Math.abs(h(x)) > 1e4 || near(a * h(x) + vshift, want, 1e-7);
  });
  return { same, a, fitted: (x) => a * h(x) + vshift };
}

// ------------------------------------------------------------------ the checks

function expectCorrectAnswer(p: Problem): void {
  const printed = readPrompt(p.prompt);
  const stated = readAnswer(p.answer);
  const sineLike = ["sin", "cos", "sec", "csc"].includes(printed.fn);

  // Parts in the documented order.
  const labels = [...readParts(p.answer).keys()];
  expect(labels).toEqual([
    ...(["sin", "cos"].includes(printed.fn) ? ["Amplitude"] : []),
    "Period",
    "Phase shift",
    "Vertical shift",
    ...(["sin", "cos"].includes(printed.fn) ? [] : ["Asymptotes"]),
  ]);

  // Period: found by search on the printed equation.
  expect(near(stated.period, numericPeriod(printed.g)), p.prompt).toBe(true);

  // Phase shift: the printed argument is B(x − s), read as a line in x.
  const B = printed.arg(1) - printed.arg(0);
  expect(B).toBeGreaterThan(0);
  expect(near(stated.shift, -printed.arg(0) / B, 1e-9), p.prompt).toBe(true);
  expect(near(stated.period, (sineLike ? 2 * PI : PI) / B, 1e-9)).toBe(true);

  // The stated period, shift and vertical shift rebuild the printed function.
  const fit = describesSameFunction(printed, stated.period, stated.shift, stated.vshift);
  expect(fit.same, p.prompt).toBe(true);

  // Dense sampling on the closed form just shown equal to the printed equation (evalLatex is slow).
  const ys = dense(fit.fitted).filter((y) => Math.abs(y) < 20);
  if (stated.amplitude !== undefined) {
    // Amplitude and midline from the sampled max and min.
    const max = Math.max(...ys);
    const min = Math.min(...ys);
    expect(near(stated.amplitude, (max - min) / 2, 1e-4), p.prompt).toBe(true);
    expect(near(stated.vshift, (max + min) / 2, 1e-4), p.prompt).toBe(true);
    expect(near(Math.abs(fit.a), stated.amplitude, 1e-9)).toBe(true);
  }
  if (printed.fn === "sec" || printed.fn === "csc") {
    // The gap no value falls in is (d − |a|, d + |a|).
    const sorted = [...ys].sort((u, v) => u - v);
    let gap = [0, 0];
    for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] > gap[1] - gap[0]) gap = [sorted[i - 1], sorted[i]];
    expect(near(stated.vshift, (gap[0] + gap[1]) / 2, 1e-4), p.prompt).toBe(true);
  }

  if (stated.asymptotes) {
    // Every numeric pole in the window is in the stated family, and every member is a pole.
    const poles = numericPoles(fit.fitted, -2 * PI, 2 * PI);
    const { start, spacing } = stated.asymptotes;
    expect(start).toBeGreaterThanOrEqual(0);
    expect(start).toBeLessThan(spacing);
    const family: number[] = [];
    for (let k = -40; k <= 40; k++) {
      const x = start + k * spacing;
      if (x > -2 * PI + 1e-6 && x < 2 * PI - 1e-6) family.push(x);
    }
    expect(poles.length, p.prompt).toBe(family.length);
    poles.forEach((x, i) => expect(near(x, family[i], 1e-7), p.prompt).toBe(true));
    // and the printed equation itself blows up there.
    for (const x of family) expect(Math.min(Math.abs(printed.g(x - 1e-9)), Math.abs(printed.g(x + 1e-9))), p.prompt).toBeGreaterThan(1e6);
    if (printed.fn === "tan" || printed.fn === "cot") {
      // Midway between two asymptotes the curve is at its midline d.
      expect(near(printed.g(start + spacing / 2), stated.vshift, 1e-9), p.prompt).toBe(true);
    }
  }
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
