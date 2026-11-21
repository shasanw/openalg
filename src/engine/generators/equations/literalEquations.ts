// "Solving literal equations": solve a formula (A = ½bh for h) or an equation
// with letters (ax + b = c for x) for the indicated variable.
//
// Built ANSWER-FROM-CONSTRUCTION: every entry in the catalogue below is
// written together with its solved form and its mistake-based wrong forms, so
// the Answer is authored, never derived. Equations with letters get fresh
// letters each time for variety. Each entry is a tiny expression tree that
// both prints as LaTeX and evaluates, so the tests check every entry by
// substituting the Answer back into the printed equation.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { distinctHints } from "../shared/equationKit";

export const LITERAL_EQUATIONS_ID = "literal-equations";

export type Source = "mixed" | "formulas" | "equations";
export type Steps = "any" | "one" | "multi";

export const schema = [
  {
    type: "enum",
    key: "source",
    label: "Equations",
    default: "mixed",
    options: [
      { value: "mixed", label: "Formulas and equations with letters" },
      { value: "formulas", label: "Formulas (geometry and science)" },
      { value: "equations", label: "Equations with letters, like ax + b = c" },
    ],
  },
  {
    type: "enum",
    key: "steps",
    label: "Steps",
    default: "any",
    options: [
      { value: "any", label: "Any number of steps" },
      { value: "one", label: "One step" },
      { value: "multi", label: "Two or more steps" },
    ],
  },
] as const satisfies ParamSchema;

// ------------------------------------------------------------------ expressions

export type Expr =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "add"; l: Expr; r: Expr }
  | { t: "sub"; l: Expr; r: Expr }
  | { t: "mul"; fs: Expr[] }
  | { t: "div"; n: Expr; d: Expr }
  | { t: "neg"; e: Expr }
  | { t: "pow"; b: Expr; e: number };

/** Parse the catalogue's plain notation: + - * / ^ and parentheses, numbers,
 * single letters with optional digit subscripts (b1), and pi. */
export function parse(src: string): Expr {
  const toks = src.match(/\d+|pi|[a-zA-Z]\d*|[-+*/^()]/g) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  function expr(): Expr {
    let e = term();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const r = term();
      e = op === "+" ? { t: "add", l: e, r } : { t: "sub", l: e, r };
    }
    return e;
  }
  function term(): Expr {
    let e = unary();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const r = unary();
      if (op === "/") e = { t: "div", n: e, d: r };
      else e = { t: "mul", fs: [...(e.t === "mul" ? e.fs : [e]), r] };
    }
    return e;
  }
  function unary(): Expr {
    if (peek() === "-") {
      next();
      return { t: "neg", e: unary() };
    }
    const b = atom();
    if (peek() === "^") {
      next();
      return { t: "pow", b, e: Number(next()) };
    }
    return b;
  }
  function atom(): Expr {
    const tok = next();
    if (tok === "(") {
      const e = expr();
      if (next() !== ")") throw new Error(`unbalanced: ${src}`);
      return e;
    }
    if (/^\d+$/.test(tok)) return { t: "num", v: Number(tok) };
    if (/^(pi|[a-zA-Z]\d*)$/.test(tok)) return { t: "var", name: tok };
    throw new Error(`unexpected "${tok}" in ${src}`);
  }
  const e = expr();
  if (i !== toks.length) throw new Error(`trailing input in ${src}`);
  return e;
}

const isSum = (e: Expr) => e.t === "add" || e.t === "sub";

function varLatex(name: string): string {
  if (name === "pi") return "\\pi";
  const m = name.match(/^([a-zA-Z])(\d+)$/);
  return m ? `${m[1]}_{${m[2]}}` : name;
}

/** Render as LaTeX: \frac for division, juxtaposition for products. */
export function toLatex(e: Expr): string {
  switch (e.t) {
    case "num":
      return String(e.v);
    case "var":
      return varLatex(e.name);
    case "add":
      return `${toLatex(e.l)} + ${toLatex(e.r)}`;
    case "sub":
      return `${toLatex(e.l)} - ${isSum(e.r) ? `(${toLatex(e.r)})` : toLatex(e.r)}`;
    case "neg":
      return `-${isSum(e.e) ? `(${toLatex(e.e)})` : toLatex(e.e)}`;
    case "div":
      return `\\frac{${toLatex(e.n)}}{${toLatex(e.d)}}`;
    case "pow": {
      const base = e.b.t === "var" || e.b.t === "num" ? toLatex(e.b) : `(${toLatex(e.b)})`;
      return `${base}^{${e.e}}`;
    }
    case "mul": {
      let out = "";
      e.fs.forEach((f, i) => {
        let s = isSum(f) || (f.t === "neg" && i > 0) ? `(${toLatex(f)})` : toLatex(f);
        // keep "\pi r" apart, and never let two numbers run together
        if (i > 0 && /\\[a-zA-Z]+$/.test(out) && /^[a-zA-Z]/.test(s)) s = " " + s;
        if (i > 0 && /\d$/.test(out) && /^\d/.test(s)) s = ` \\cdot ${s}`;
        out += s;
      });
      return out;
    }
  }
}

/** Evaluate with the given variable values (pi is built in). */
export function evaluate(e: Expr, env: Record<string, number>): number {
  switch (e.t) {
    case "num":
      return e.v;
    case "var":
      if (e.name === "pi") return Math.PI;
      if (!(e.name in env)) throw new Error(`unbound ${e.name}`);
      return env[e.name];
    case "add":
      return evaluate(e.l, env) + evaluate(e.r, env);
    case "sub":
      return evaluate(e.l, env) - evaluate(e.r, env);
    case "neg":
      return -evaluate(e.e, env);
    case "div":
      return evaluate(e.n, env) / evaluate(e.d, env);
    case "pow":
      return evaluate(e.b, env) ** e.e;
    case "mul":
      return e.fs.reduce((acc, f) => acc * evaluate(f, env), 1);
  }
}

/** Every variable name used, pi excluded. */
export function variables(e: Expr): Set<string> {
  const out = new Set<string>();
  const walk = (x: Expr) => {
    switch (x.t) {
      case "var":
        if (x.name !== "pi") out.add(x.name);
        break;
      case "add":
      case "sub":
        walk(x.l);
        walk(x.r);
        break;
      case "neg":
        walk(x.e);
        break;
      case "div":
        walk(x.n);
        walk(x.d);
        break;
      case "pow":
        walk(x.b);
        break;
      case "mul":
        x.fs.forEach(walk);
        break;
      case "num":
        break;
    }
  };
  walk(e);
  return out;
}

function rename(e: Expr, map: Record<string, string>): Expr {
  switch (e.t) {
    case "num":
      return e;
    case "var":
      return { t: "var", name: map[e.name] ?? e.name };
    case "add":
    case "sub":
      return { t: e.t, l: rename(e.l, map), r: rename(e.r, map) };
    case "neg":
      return { t: "neg", e: rename(e.e, map) };
    case "div":
      return { t: "div", n: rename(e.n, map), d: rename(e.d, map) };
    case "pow":
      return { t: "pow", b: rename(e.b, map), e: e.e };
    case "mul":
      return { t: "mul", fs: e.fs.map((f) => rename(f, map)) };
  }
}

// ------------------------------------------------------------------ catalogue

/**
 * One literal equation: `lhs = rhs` solved for `target` is `answer`; `wrong`
 * are the solved forms a student making a common mistake would write, in
 * order of how common the mistake is.
 */
export interface Entry {
  source: "formulas" | "equations";
  steps: 1 | 2;
  lhs: string;
  rhs: string;
  target: string;
  answer: string;
  wrong: string[];
  /** letters of an equation that must not be renamed */
  fixed?: string[];
}

const f = (steps: 1 | 2, eq: string, target: string, answer: string, wrong: string[]): Entry => {
  const [lhs, rhs] = eq.split("=").map((s) => s.trim());
  return { source: "formulas", steps, lhs, rhs, target, answer, wrong };
};
const q = (steps: 1 | 2, eq: string, target: string, answer: string, wrong: string[], fixed?: string[]): Entry => ({
  ...f(steps, eq, target, answer, wrong),
  source: "equations",
  fixed,
});

// Mistakes modelled throughout: the inverse operation done the wrong way
// (multiplied instead of divided), dividing upside down, subtracting instead
// of dividing, moving a term without changing its sign, and doing the steps
// in the wrong order (dividing before subtracting).
export const CATALOGUE: readonly Entry[] = [
  // formulas, one step
  f(1, "A = l*w", "l", "A/w", ["A*w", "w/A", "A - w", "A + w"]),
  f(1, "A = l*w", "w", "A/l", ["A*l", "l/A", "A - l", "A + l"]),
  f(1, "d = r*t", "t", "d/r", ["d*r", "r/d", "d - r", "d + r"]),
  f(1, "d = r*t", "r", "d/t", ["d*t", "t/d", "d - t", "d + t"]),
  f(1, "V = l*w*h", "h", "V/(l*w)", ["V*l*w", "l*w/V", "V - l*w", "V/l*w"]),
  f(1, "V = l*w*h", "w", "V/(l*h)", ["V*l*h", "l*h/V", "V - l*h", "V/l*h"]),
  f(1, "C = 2*pi*r", "r", "C/(2*pi)", ["2*pi*C", "2*pi/C", "C - 2*pi", "C/2 - pi"]),
  f(1, "C = pi*d", "d", "C/pi", ["C*pi", "pi/C", "C - pi", "C + pi"]),
  f(1, "I = P*r*t", "P", "I/(r*t)", ["I*r*t", "r*t/I", "I - r*t", "I/r*t"]),
  f(1, "I = P*r*t", "t", "I/(P*r)", ["I*P*r", "P*r/I", "I - P*r", "I/P*r"]),
  f(1, "F = m*a", "a", "F/m", ["F*m", "m/F", "F - m", "F + m"]),
  f(1, "F = m*a", "m", "F/a", ["F*a", "a/F", "F - a", "F + a"]),
  f(1, "E = m*c^2", "m", "E/c^2", ["E*c^2", "c^2/E", "E - c^2", "E/(2*c)"]),
  f(1, "W = F*d", "F", "W/d", ["W*d", "d/W", "W - d", "W + d"]),
  f(1, "y = m*x + b", "b", "y - m*x", ["y + m*x", "m*x - y", "y/(m*x)", "y - x"]),
  f(1, "P = a + b + c", "a", "P - b - c", ["P + b + c", "P - b + c", "b + c - P", "P - b"]),
  f(1, "D = m/V", "m", "D*V", ["D/V", "V/D", "D + V", "D - V"]),
  f(1, "P = W/t", "W", "P*t", ["P/t", "t/P", "P + t", "P - t"]),
  f(1, "V = B*h", "B", "V/h", ["V*h", "h/V", "V - h", "V + h"]),
  f(1, "v = u + a*t", "u", "v - a*t", ["v + a*t", "a*t - v", "v/(a*t)", "v - a"]),
  f(1, "S = 2*pi*r*h", "h", "S/(2*pi*r)", ["2*pi*r*S", "2*pi*r/S", "S - 2*pi*r", "S/2 - pi*r"]),
  // formulas, two or more steps
  f(2, "A = 1/2*b*h", "h", "2*A/b", ["A/(2*b)", "A*b/2", "b/(2*A)", "2*A - b"]),
  f(2, "A = 1/2*b*h", "b", "2*A/h", ["A/(2*h)", "A*h/2", "h/(2*A)", "2*A - h"]),
  f(2, "P = 2*l + 2*w", "l", "(P - 2*w)/2", ["P/2 - 2*w", "(P + 2*w)/2", "P - 2*w", "(P - w)/2"]),
  f(2, "P = 2*l + 2*w", "w", "(P - 2*l)/2", ["P/2 - 2*l", "(P + 2*l)/2", "P - 2*l", "(P - l)/2"]),
  f(2, "P = 2*(l + w)", "l", "P/2 - w", ["P/2 + w", "(P - w)/2", "P - 2*w", "2*P - w"]),
  f(2, "y = m*x + b", "x", "(y - b)/m", ["y/m - b", "(y + b)/m", "m*(y - b)", "y - b - m"]),
  f(2, "y = m*x + b", "m", "(y - b)/x", ["y/x - b", "(y + b)/x", "x*(y - b)", "y - b - x"]),
  f(2, "F = 9/5*C + 32", "C", "5/9*(F - 32)", ["5/9*F - 32", "9/5*(F - 32)", "5/9*(F + 32)", "(F - 32)/9"]),
  f(2, "C = 5/9*(F - 32)", "F", "9/5*C + 32", ["9/5*C - 32", "5/9*C + 32", "9/5*(C + 32)", "9/5*(C - 32)"]),
  f(2, "A = 1/2*h*(b1 + b2)", "h", "2*A/(b1 + b2)", [
    "A/(2*(b1 + b2))",
    "2*A - b1 - b2",
    "(b1 + b2)/(2*A)",
    "2*A/b1 + b2",
  ]),
  f(2, "A = 1/2*h*(b1 + b2)", "b1", "2*A/h - b2", ["2*A/h + b2", "A/(2*h) - b2", "(2*A - b2)/h", "2*A - h - b2"]),
  f(2, "V = pi*r^2*h", "h", "V/(pi*r^2)", ["V*pi*r^2", "pi*r^2/V", "V - pi*r^2", "V/(2*pi*r)"]),
  f(2, "D = m/V", "V", "m/D", ["D*m", "D/m", "m - D", "m + D"]),
  f(2, "A = P + P*r*t", "r", "(A - P)/(P*t)", ["(A + P)/(P*t)", "A/(P*t) - P", "(A - P)*P*t", "A - P - P*t"]),
  f(2, "V = 1/3*B*h", "h", "3*V/B", ["V/(3*B)", "V*B/3", "B/(3*V)", "3*V - B"]),
  f(2, "K = 1/2*m*v^2", "m", "2*K/v^2", ["K/(2*v^2)", "K*v^2/2", "v^2/(2*K)", "2*K - v^2"]),
  f(2, "M = (a + b)/2", "a", "2*M - b", ["M/2 - b", "2*M + b", "2*(M - b)", "M - b"]),
  // equations with letters (x is the variable; a, b, c are renamed each time)
  q(1, "x + a = b", "x", "b - a", ["b + a", "a - b", "b/a", "-b - a"]),
  q(1, "x - a = b", "x", "b + a", ["b - a", "a - b", "a*b", "b/a"]),
  q(1, "a*x = b", "x", "b/a", ["a*b", "a/b", "b - a", "b + a"]),
  q(1, "x/a = b", "x", "a*b", ["b/a", "a/b", "b + a", "b - a"]),
  q(1, "a + x = b", "x", "b - a", ["b + a", "a - b", "b/a", "-b - a"]),
  q(2, "a*x + b = c", "x", "(c - b)/a", ["c/a - b", "(c + b)/a", "a*(c - b)", "c - b - a"]),
  q(2, "a*x - b = c", "x", "(c + b)/a", ["c/a + b", "(c - b)/a", "a*(c + b)", "c + b - a"]),
  q(2, "a*(x + b) = c", "x", "c/a - b", ["(c - b)/a", "c/a + b", "a*c - b", "c - a*b"]),
  q(2, "(x + a)/b = c", "x", "b*c - a", ["c/b - a", "b*c + a", "b*(c - a)", "c - a"]),
  q(2, "x/a + b = c", "x", "a*(c - b)", ["a*c - b", "(c - b)/a", "a*(c + b)", "c - b"]),
  q(2, "a - x = b", "x", "a - b", ["b - a", "a + b", "-a - b", "b/a"]),
  q(2, "a/x = b", "x", "a/b", ["a*b", "b/a", "a - b", "a + b"]),
  q(2, "a*x + b*x = c", "x", "c/(a + b)", ["c/(a*b)", "(a + b)/c", "c - a - b", "c/a - b"]),
  q(2, "a*x = b*x + c", "x", "c/(a - b)", ["c/(a + b)", "(a - b)/c", "c/a - b", "(c - b)/a"]),
  q(2, "a*x + b*y = c", "y", "(c - a*x)/b", ["c/b - a*x", "(c + a*x)/b", "b*(c - a*x)", "(a*x - c)/b"], ["x", "y"]),
  q(2, "a*x - b*y = c", "y", "(a*x - c)/b", ["(c - a*x)/b", "(a*x + c)/b", "a*x - c/b", "b*(a*x - c)"], ["x", "y"]),
];

/** Fresh letters for an equation-with-letters entry. */
const TARGET_LETTERS = ["x", "x", "x", "y", "m", "n", "t", "w", "z"] as const;
const CONSTANT_LETTERS = ["a", "b", "c", "d", "f", "g", "h", "k", "p", "q", "r", "s"] as const;

function letterMap(entry: Entry, rng: Rng): Record<string, string> {
  if (entry.source === "formulas") return {};
  const fixed = new Set(entry.fixed ?? []);
  const map: Record<string, string> = {};
  const used = new Set<string>(fixed);
  if (!fixed.has(entry.target)) {
    const t = rng.pick(TARGET_LETTERS.filter((l) => !used.has(l)));
    map[entry.target] = t;
    used.add(t);
  }
  const all = new Set([...variables(parse(entry.lhs)), ...variables(parse(entry.rhs))]);
  const names = [...all].filter((n) => !fixed.has(n) && n !== entry.target).sort();
  const picked: string[] = [];
  for (const _ of names) {
    const l = rng.pick(CONSTANT_LETTERS.filter((x) => !used.has(x)));
    picked.push(l);
    used.add(l);
  }
  // assigned in alphabetical order, so ax + b = c may become dx + g = k but
  // never kx + d = a
  picked.sort();
  names.forEach((n, i) => (map[n] = picked[i]));
  return map;
}

// ------------------------------------------------------------------ construction

/** The structured construction. Exposed for property tests. */
export interface LiteralConstruction {
  lhs: Expr;
  rhs: Expr;
  target: string;
  answer: Expr;
  wrong: Expr[];
}

export function entriesFor(source: Source, steps: Steps): Entry[] {
  return CATALOGUE.filter(
    (e) =>
      (source === "mixed" || e.source === source) &&
      (steps === "any" || (steps === "one" ? e.steps === 1 : e.steps === 2)),
  );
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): LiteralConstruction {
  const p = resolveParams(schema, params);
  const source = p.source as Source;
  const steps = p.steps as Steps;
  // Mixed: pick the kind first, so the finite list of formulas and the
  // endlessly re-lettered equations each make up about half a Section.
  const kind = source === "mixed" ? rng.pick(["formulas", "equations"] as const) : source;
  const entry = rng.pick(entriesFor(kind, steps));
  const map = letterMap(entry, rng);
  const r = (s: string) => rename(parse(s), map);
  return {
    lhs: r(entry.lhs),
    rhs: r(entry.rhs),
    target: map[entry.target] ?? entry.target,
    answer: r(entry.answer),
    wrong: entry.wrong.map(r),
  };
}

export function promptLatex(k: LiteralConstruction): string {
  return `${toLatex(k.lhs)} = ${toLatex(k.rhs)}, \\text{ for } ${varLatex(k.target)}`;
}

const solved = (target: string, e: Expr) => `${varLatex(target)} = ${toLatex(e)}`;

export function distractors(k: LiteralConstruction): string[] {
  return distinctHints(
    solved(k.target, k.answer),
    k.wrong.map((w) => solved(k.target, w)),
  );
}

export const generator: Generator = {
  id: LITERAL_EQUATIONS_ID,
  title: "Solving literal equations",
  defaultDirections: "Solve each equation for the indicated variable.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: LITERAL_EQUATIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: solved(k.target, k.answer),
      distractorHints: distractors(k),
    };
  },
};
