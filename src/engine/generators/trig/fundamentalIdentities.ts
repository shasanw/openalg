// "Fundamental identities": simplify an expression to a single trig function
// (or a number) with the reciprocal, quotient, Pythagorean, even-odd and
// cofunction identities (\sin x \cot x is \cos x, \sec x - \tan x \sin x is
// \cos x), or find other trig values from one value and the quadrant
// (\sin\theta = -\frac{3}{5} in Quadrant III, so \cos\theta = -\frac{4}{5}).
//
// Built ANSWER-FIRST. Simplify: every expression here is a product of powers
// of sin and cos, so its value is a vector (a, b) meaning sin^a x cos^b x.
// The Answer (a function, maybe squared, or 1) is chosen first, then one of
// the catalogued expressions with that vector is picked: products and
// quotients of functions, Pythagorean binomials (1 - \cos^{2} x is
// \sin^{2} x), sums that factor (\cos x + \cos x \tan^{2} x) and the
// conjugate fractions (\frac{\cos x}{1 - \sin x} - \tan x). Even-odd and
// cofunction forms only re-write a factor (\cos x as \sin(\frac{\pi}{2} - x),
// \sin x as -\sin(-x)), tracking the sign. Values: the point (x, y) at
// distance r is chosen first (a Pythagorean triple, or a triangle with one
// radical side); every value is a ratio of its coordinates.

import { createRng, type Rng } from "../../rng";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { distinctHints } from "../shared/equationKit";
import {
  cofunction,
  locationLatex,
  PYTHAGOREAN_TRIPLES,
  reciprocalFn,
  surd,
  surdDiv,
  surdLatex,
  surdNeg,
  TRIG_FNS,
  trigOf,
  type Quadrant,
  type Surd,
  type TrigFn,
} from "./trigKit";

export const FUNDAMENTAL_IDENTITIES_ID = "fundamental-identities";

export type ProblemType = "simplify" | "values" | "mixed";
export type Level = "reciprocal" | "pythagorean" | "sums";

export const schema = [
  {
    type: "enum",
    key: "problemType",
    label: "Problems",
    default: "simplify",
    options: [
      { value: "simplify", label: "Simplify expressions" },
      { value: "values", label: "Find trig values from one value" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "enum",
    key: "level",
    label: "Expressions to simplify",
    default: "pythagorean",
    options: [
      { value: "reciprocal", label: "Reciprocal and quotient identities" },
      { value: "pythagorean", label: "Pythagorean identities" },
      { value: "sums", label: "Sums and factoring (harder)" },
    ],
  },
  {
    type: "boolean",
    key: "evenOdd",
    label: "Include even-odd and cofunction identities, like cos(-x) and sin(π/2 - x)",
    default: false,
  },
  {
    type: "boolean",
    key: "radicals",
    label: "Values that give radicals (not only Pythagorean triples)",
    default: false,
  },
] as const satisfies ParamSchema;

// ------------------------------------------------------------------ expression model

/** sin^a x cos^b x. */
type Vec = readonly [number, number];

const FN_VEC: Record<TrigFn, Vec> = {
  sin: [1, 0],
  cos: [0, 1],
  tan: [1, -1],
  cot: [-1, 1],
  sec: [0, -1],
  csc: [-1, 0],
};

const vAdd = (p: Vec, q: Vec): Vec => [p[0] + q[0], p[1] + q[1]];
const vScale = (p: Vec, k: number): Vec => [p[0] * k, p[1] * k];
const vEq = (p: Vec, q: Vec) => p[0] === q[0] && p[1] === q[1];

/** A function written with argument x, -x (even-odd) or π/2 - x (cofunction). */
export type Arg = "x" | "neg" | "co";

export type Factor =
  | { kind: "fn"; fn: TrigFn; power: 1 | 2; arg: Arg }
  | { kind: "pyth"; id: number };

/** Pythagorean binomials: printed form, value as sign·(fn)^2. */
export const PYTHAGOREAN: readonly { tex: string; fn: TrigFn; sign: 1 | -1 }[] = [
  { tex: "1 - \\sin^{2} x", fn: "cos", sign: 1 },
  { tex: "1 - \\cos^{2} x", fn: "sin", sign: 1 },
  { tex: "\\sec^{2} x - 1", fn: "tan", sign: 1 },
  { tex: "1 + \\tan^{2} x", fn: "sec", sign: 1 },
  { tex: "\\csc^{2} x - 1", fn: "cot", sign: 1 },
  { tex: "1 + \\cot^{2} x", fn: "csc", sign: 1 },
  { tex: "\\sin^{2} x - 1", fn: "cos", sign: -1 },
  { tex: "\\cos^{2} x - 1", fn: "sin", sign: -1 },
  { tex: "1 - \\sec^{2} x", fn: "tan", sign: -1 },
  { tex: "1 - \\csc^{2} x", fn: "cot", sign: -1 },
];

const ODD = new Set<TrigFn>(["sin", "tan", "cot", "csc"]);

function factorValue(f: Factor): { v: Vec; sign: number } {
  if (f.kind === "pyth") {
    const p = PYTHAGOREAN[f.id];
    return { v: vScale(FN_VEC[p.fn], 2), sign: p.sign };
  }
  const fn = f.arg === "co" ? cofunction(f.fn) : f.fn;
  const sign = f.arg === "neg" && ODD.has(f.fn) && f.power === 1 ? -1 : 1;
  return { v: vScale(FN_VEC[fn], f.power), sign };
}

function factorLatex(f: Factor, alone: boolean): string {
  if (f.kind === "pyth") return alone ? PYTHAGOREAN[f.id].tex : `\\left(${PYTHAGOREAN[f.id].tex}\\right)`;
  const arg = f.arg === "x" ? "x" : f.arg === "neg" ? "-x" : "\\frac{\\pi}{2} - x";
  return trigOf(f.fn, arg, f.power);
}

/** num / den, a product of factors. */
export interface Product {
  num: Factor[];
  den: Factor[];
}

const productTex = (fs: Factor[]) => fs.map((f) => factorLatex(f, fs.length === 1)).join(" ");

export function productLatex(p: Product): string {
  const top = p.num.length === 0 ? "1" : productTex(p.num);
  return p.den.length === 0 ? top : `\\frac{${top}}{${productTex(p.den)}}`;
}

function productValue(p: Product): { v: Vec; sign: number } {
  let v: Vec = [0, 0];
  let sign = 1;
  for (const f of p.num) {
    const x = factorValue(f);
    v = vAdd(v, x.v);
    sign *= x.sign;
  }
  for (const f of p.den) {
    const x = factorValue(f);
    v = vAdd(v, vScale(x.v, -1));
    sign *= x.sign;
  }
  return { v, sign };
}

/** An expression to simplify: a product, or a sum of terms (each ± a product, or ± 1). */
export type Expr =
  | { kind: "product"; p: Product }
  | { kind: "sum"; terms: { sign: 1 | -1; p: Product | null }[] }
  | { kind: "conjugate"; id: number };

/** \frac{\cos x}{1 - \sin x} - \tan x = \sec x and its relatives. */
export const CONJUGATE: readonly { tex: string; fn: TrigFn }[] = [
  { tex: "\\frac{\\cos x}{1 - \\sin x} - \\tan x", fn: "sec" },
  { tex: "\\frac{\\cos x}{1 + \\sin x} + \\tan x", fn: "sec" },
  { tex: "\\frac{\\sin x}{1 - \\cos x} - \\cot x", fn: "csc" },
  { tex: "\\frac{\\sin x}{1 + \\cos x} + \\cot x", fn: "csc" },
];

export function exprLatex(e: Expr): string {
  if (e.kind === "product") return productLatex(e.p);
  if (e.kind === "conjugate") return CONJUGATE[e.id].tex;
  return e.terms
    .map((t, i) => {
      const body = t.p === null ? "1" : productLatex(t.p);
      return i === 0 ? (t.sign < 0 ? "-" : "") + body : ` ${t.sign < 0 ? "-" : "+"} ${body}`;
    })
    .join("");
}

// ------------------------------------------------------------------ answers

/** The Answer: sign·fn^power, or sign·1 when fn is null. */
export interface Simplest {
  fn: TrigFn | null;
  power: 1 | 2;
  sign: 1 | -1;
}

/** The single function (power 1 or 2) a vector is, or 1 for (0, 0); null when it is neither. */
function vecToSimplest(v: Vec, sign: number): Simplest | null {
  const s = (sign < 0 ? -1 : 1) as 1 | -1;
  if (vEq(v, [0, 0])) return { fn: null, power: 1, sign: s };
  for (const fn of TRIG_FNS) if (vEq(v, FN_VEC[fn])) return { fn, power: 1, sign: s };
  return null;
}

export function simplestLatex(s: Simplest): string {
  const body = s.fn === null ? "1" : trigOf(s.fn, "x", s.power);
  return (s.sign < 0 ? "-" : "") + body;
}

const sameSimplest = (a: Simplest, b: Simplest) => a.fn === b.fn && a.power === b.power && a.sign === b.sign;

// ------------------------------------------------------------------ catalogues

const plain = (fn: TrigFn, power: 1 | 2 = 1): Factor => ({ kind: "fn", fn, power, arg: "x" });

export interface Entry {
  expr: Expr;
  answer: Simplest;
  /** the expression's shape, chosen before the expression so no shape crowds out the rest */
  shape: string;
}

function productEntry(p: Product): Entry | null {
  const { v, sign } = productValue(p);
  const answer = vecToSimplest(v, sign);
  return answer ? { expr: { kind: "product", p }, answer, shape: `${p.num.length}/${p.den.length}` } : null;
}

/** Products and quotients of two or three different functions (reciprocal and quotient identities). */
function reciprocalCatalogue(): Entry[] {
  const out: Entry[] = [];
  const fns = TRIG_FNS;
  const push = (p: Product) => {
    const e = productEntry(p);
    if (!e) return;
    // no factor already the Answer's function (\cos x \tan x \cot x is too easy)
    const all = [...p.num, ...p.den];
    if (all.some((f) => f.kind === "fn" && f.fn === e.answer.fn)) return;
    out.push(e);
  };
  for (let i = 0; i < fns.length; i++)
    for (let j = 0; j < fns.length; j++) {
      if (i === j) continue;
      if (i < j) push({ num: [plain(fns[i]), plain(fns[j])], den: [] });
      push({ num: [plain(fns[i])], den: [plain(fns[j])] });
      for (let k = 0; k < fns.length; k++) {
        if (k === i || k === j) continue;
        if (i < j && j < k) push({ num: [plain(fns[i]), plain(fns[j]), plain(fns[k])], den: [] });
        if (i < j) push({ num: [plain(fns[i]), plain(fns[j])], den: [plain(fns[k])] });
      }
    }
  return out;
}

/** A Pythagorean binomial times or over one function, or over a function times another. */
function pythagoreanCatalogue(): Entry[] {
  const out: Entry[] = [];
  const push = (p: Product) => {
    const e = productEntry(p);
    if (e) out.push(e);
  };
  PYTHAGOREAN.forEach((_, id) => {
    const b: Factor = { kind: "pyth", id };
    for (const g of TRIG_FNS) {
      push({ num: [b, plain(g)], den: [] });
      push({ num: [b], den: [plain(g)] });
      push({ num: [plain(g)], den: [b] });
      for (const h of TRIG_FNS) if (h !== g) push({ num: [b, plain(g)], den: [plain(h)] });
    }
  });
  return out;
}

/** Two different functions whose product or quotient has vector v (for disguising a square). */
function pairsFor(v: Vec): Product[] {
  const out: Product[] = [];
  for (const g of TRIG_FNS)
    for (const h of TRIG_FNS) {
      if (g === h) continue;
      if (vEq(vAdd(FN_VEC[g], FN_VEC[h]), v) && g < h) out.push({ num: [plain(g), plain(h)], den: [] });
      if (vEq(vAdd(FN_VEC[g], vScale(FN_VEC[h], -1)), v)) out.push({ num: [plain(g)], den: [plain(h)] });
    }
  return out;
}

/** The 1-term and f²-term of each Pythagorean binomial: 1 - \sin^{2} x is (+1, -sin²). */
const BINOMIAL_TERMS: readonly { one: 1 | -1; fn: TrigFn; sq: 1 | -1 }[] = [
  { one: 1, fn: "sin", sq: -1 },
  { one: 1, fn: "cos", sq: -1 },
  { one: -1, fn: "sec", sq: 1 },
  { one: 1, fn: "tan", sq: 1 },
  { one: -1, fn: "csc", sq: 1 },
  { one: 1, fn: "cot", sq: 1 },
];

/** The Pythagorean value of (one + sq·fn²) as sign·fn'^2. */
function binomialValue(b: { one: 1 | -1; fn: TrigFn; sq: 1 | -1 }): { v: Vec; sign: number } {
  const id = PYTHAGOREAN.findIndex((p) => {
    const t = p.tex;
    const sqTex = `\\${b.fn}^{2} x`;
    const want = b.one === 1 ? `1 ${b.sq < 0 ? "-" : "+"} ${sqTex}` : `${sqTex} - 1`;
    return t === want;
  });
  return factorValue({ kind: "pyth", id });
}

/**
 * Sums: a common factor times a binomial, written out (\cos x + \cos x \tan^{2} x
 * is \sec x; \sec x - \tan x \sin x is \cos x), two squares from one
 * Pythagorean identity written as quotients (\frac{\sin x}{\csc x} +
 * \frac{\cos x}{\sec x} is 1, \frac{\sec x}{\cos x} - 1 is \tan^{2} x), and
 * the conjugate fractions.
 */
function sumsCatalogue(): Entry[] {
  const out: Entry[] = [];
  // g·(one + sq·f²) written out: g·one, then g·f² as "g f^2" or a disguised pair
  for (const b of BINOMIAL_TERMS) {
    const { v: bv, sign } = binomialValue(b);
    for (const g of TRIG_FNS) {
      const answer = vecToSimplest(vAdd(FN_VEC[g], bv), sign);
      if (!answer || answer.fn === g) continue;
      const second = vAdd(FN_VEC[g], vScale(FN_VEC[b.fn], 2));
      const forms: Product[] = [{ num: [plain(g), plain(b.fn, 2)], den: [] }, ...pairsFor(second)];
      for (const p2 of forms) {
        const first = { num: [plain(g)], den: [] };
        // one = -1 is written "g f² - g": the positive term first
        const terms: { sign: 1 | -1; p: Product }[] =
          b.one === 1
            ? [
                { sign: 1, p: first },
                { sign: b.sq, p: p2 },
              ]
            : [
                { sign: 1, p: p2 },
                { sign: -1, p: first },
              ];
        out.push({ expr: { kind: "sum", terms }, answer, shape: "factor" });
      }
    }
  }
  // squares written as quotients: sin² = sin/csc, ...; identities A² ± B² = C² (or ± 1)
  const squareForms = (fn: TrigFn): Product[] => pairsFor(vScale(FN_VEC[fn], 2));
  const ids: { a: TrigFn | null; b: TrigFn | null; sb: 1 | -1; ans: Simplest }[] = [
    { a: "sin", b: "cos", sb: 1, ans: { fn: null, power: 1, sign: 1 } },
    { a: "sec", b: "tan", sb: -1, ans: { fn: null, power: 1, sign: 1 } },
    { a: "csc", b: "cot", sb: -1, ans: { fn: null, power: 1, sign: 1 } },
  ];
  for (const id of ids) {
    const as = id.a ? squareForms(id.a) : [null];
    const bs = id.b ? squareForms(id.b) : [null];
    for (const pa of as)
      for (const pb of bs) out.push({
          expr: { kind: "sum", terms: [{ sign: 1, p: pa }, { sign: id.sb, p: pb }] },
          answer: id.ans,
          shape: pa && pb ? "squares" : "square",
        });
  }
  CONJUGATE.forEach((c, id) => out.push({ expr: { kind: "conjugate", id }, answer: { fn: c.fn, power: 1, sign: 1 }, shape: "conjugate" }),
  );
  return out;
}

const CATALOGUE: Record<Level, Entry[]> = {
  reciprocal: reciprocalCatalogue(),
  pythagorean: pythagoreanCatalogue(),
  sums: sumsCatalogue(),
};

/** The catalogue's Answers for a level (each distinct up to sign). */
export const catalogue = (level: Level): readonly Entry[] => CATALOGUE[level];

// ------------------------------------------------------------------ even-odd and cofunction

/** Re-write one plain function factor as fn(-x) or as its cofunction of π/2 - x. Returns the sign change. */
function disguise(rng: Rng, p: Product, evenOnly: boolean): number {
  const slots: { list: Factor[]; i: number }[] = [];
  for (const list of [p.num, p.den]) list.forEach((f, i) => f.kind === "fn" && f.arg === "x" && slots.push({ list, i }));
  if (slots.length === 0) return 1;
  const { list, i } = rng.pick(slots);
  const f = list[i] as Extract<Factor, { kind: "fn" }>;
  const odd = ODD.has(f.fn) && f.power === 1;
  const arg: Arg = evenOnly && odd ? "co" : rng.pick(["neg", "co"] as const);
  if (arg === "co") list[i] = { kind: "fn", fn: cofunction(f.fn), power: f.power, arg: "co" };
  else list[i] = { ...f, arg: "neg" };
  return arg === "neg" && odd ? -1 : 1;
}

const cloneProduct = (p: Product): Product => ({ num: p.num.map((f) => ({ ...f })), den: p.den.map((f) => ({ ...f })) });

// ------------------------------------------------------------------ simplify problems

export interface SimplifyConstruction {
  type: "simplify";
  level: Level;
  expr: Expr;
  answer: Simplest;
}

/** Answers to choose from, the Answer picked first: each function and 1. */
function chooseAnswer(rng: Rng, entries: readonly Entry[]): Simplest {
  const unsigned = [...new Map(entries.map((e) => [`${e.answer.fn}${e.answer.power}`, e.answer])).values()];
  const pick = rng.pick(unsigned);
  const signs = new Set(entries.filter((e) => e.answer.fn === pick.fn && e.answer.power === pick.power).map((e) => e.answer.sign));
  const sign = signs.size === 2 ? (rng.bool(0.7) ? 1 : -1) : [...signs][0];
  return { ...pick, sign };
}

function constructSimplify(rng: Rng, level: Level, evenOdd: boolean): SimplifyConstruction {
  const entries = CATALOGUE[level];
  const target = chooseAnswer(rng, entries);
  const pool = entries.filter((e) => sameSimplest(e.answer, target));
  const shape = rng.pick([...new Set(pool.map((e) => e.shape))]);
  const entry = rng.pick(pool.filter((e) => e.shape === shape));
  let expr: Expr = entry.expr;
  let answer = entry.answer;
  if (evenOdd && expr.kind !== "conjugate") {
    if (expr.kind === "product") {
      const p = cloneProduct(expr.p);
      const s = disguise(rng, p, false);
      expr = { kind: "product", p };
      answer = { ...answer, sign: (answer.sign * s) as 1 | -1 };
    } else {
      // a sum keeps its value: only sign-free re-writes, in one term
      const terms = expr.terms.map((t) => ({ sign: t.sign, p: t.p ? cloneProduct(t.p) : null }));
      const withFn = terms.filter((t) => t.p !== null);
      disguise(rng, rng.pick(withFn).p!, true);
      expr = { kind: "sum", terms };
    }
  }
  return { type: "simplify", level, expr, answer };
}

// ------------------------------------------------------------------ values problems

/** The terminal point (x, y) at distance r: x, y, r exact, r > 0. */
export interface Point {
  x: Surd;
  y: Surd;
  r: Surd;
}

export function pointValue(fn: TrigFn, p: Point): Surd | null {
  switch (fn) {
    case "sin":
      return surdDiv(p.y, p.r);
    case "cos":
      return surdDiv(p.x, p.r);
    case "tan":
      return surdDiv(p.y, p.x);
    case "cot":
      return surdDiv(p.x, p.y);
    case "sec":
      return surdDiv(p.r, p.x);
    case "csc":
      return surdDiv(p.r, p.y);
  }
}

/** Right triangles with one radical side: legs u, v and hypotenuse h. */
const RADICAL_TRIANGLES: readonly [Surd, Surd, Surd][] = [
  [surd(1), surd(2), surd(1, 5)],
  [surd(1), surd(3), surd(1, 10)],
  [surd(2), surd(3), surd(1, 13)],
  [surd(2), surd(1, 5), surd(3)],
  [surd(1), surd(1, 8), surd(3)],
  [surd(3), surd(1, 7), surd(4)],
  [surd(2), surd(1, 21), surd(5)],
  [surd(1), surd(1, 15), surd(4)],
];

export interface ValuesConstruction {
  type: "values";
  point: Point;
  quadrant: Quadrant;
  given: TrigFn;
  asked: [TrigFn, TrigFn];
}

const QUADRANT_SIGNS: Record<Quadrant, [number, number]> = { 1: [1, 1], 2: [-1, 1], 3: [-1, -1], 4: [1, -1] };

const signed = (s: Surd, k: number): Surd => (k < 0 ? surdNeg(s) : s);

export function pointIn(u: Surd, v: Surd, h: Surd, q: Quadrant): Point {
  const [sx, sy] = QUADRANT_SIGNS[q];
  return { x: signed(u, sx), y: signed(v, sy), r: h };
}

function constructValues(rng: Rng, radicals: boolean): ValuesConstruction {
  let u: Surd, v: Surd, h: Surd;
  if (radicals) [u, v, h] = rng.pick(RADICAL_TRIANGLES);
  else {
    const [a, b, c] = rng.pick(PYTHAGOREAN_TRIPLES);
    [u, v, h] = [surd(a), surd(b), surd(c)];
  }
  if (rng.bool()) [u, v] = [v, u];
  const quadrant = rng.int(1, 4) as Quadrant;
  const point = pointIn(u, v, h, quadrant);
  const rational = TRIG_FNS.filter((f) => pointValue(f, point)!.r === 1);
  const given = rng.pick(rational);
  const others = TRIG_FNS.filter((f) => f !== given);
  // ask for two others, in the usual order (sin, cos, tan, csc, sec, cot)
  const first = rng.pick(others);
  const second = rng.pick(others.filter((f) => f !== first));
  const asked = [first, second].sort((a, b) => TRIG_FNS.indexOf(a) - TRIG_FNS.indexOf(b)) as [TrigFn, TrigFn];
  return { type: "values", point, quadrant, given, asked };
}

const valueEq = (fn: TrigFn, v: Surd) => `${trigOf(fn, "\\theta")} = ${surdLatex(v)}`;

function valuesAnswer(asked: readonly TrigFn[], p: Point): string {
  return asked.map((f) => valueEq(f, pointValue(f, p)!)).join(ANSWER_PART_SEPARATOR);
}

// ------------------------------------------------------------------ construction

export type Construction = SimplifyConstruction | ValuesConstruction;

export function construct(params: ParamValues, rng: Rng): Construction {
  const p = resolveParams(schema, params);
  const type = p.problemType as ProblemType;
  const values = type === "mixed" ? rng.bool(0.4) : type === "values";
  return values ? constructValues(rng, p.radicals as boolean) : constructSimplify(rng, p.level as Level, p.evenOdd as boolean);
}

export function promptLatex(k: Construction): string {
  if (k.type === "simplify") return exprLatex(k.expr);
  const given = `${valueEq(k.given, pointValue(k.given, k.point)!)}, \\ \\theta \\text{ in } ${locationLatex(k.quadrant)}`;
  return `${given}${ANSWER_PART_SEPARATOR}\\text{find } ${k.asked.map((f) => trigOf(f, "\\theta")).join(", ")}`;
}

export function answerLatex(k: Construction): string {
  return k.type === "simplify" ? simplestLatex(k.answer) : valuesAnswer(k.asked, k.point);
}

// ------------------------------------------------------------------ distractors

/** sin² <-> cos², tan <-> sec, cot <-> csc: the Pythagorean partner, mixed up (1 + tan² = sec²). */
const PARTNER: Record<TrigFn, TrigFn> = { sin: "cos", cos: "sin", tan: "sec", sec: "tan", cot: "csc", csc: "cot" };

/**
 * Simplify, most common first: the reciprocal function (\sec x for \cos x),
 * the wrong sign (a Pythagorean sign slip, 1 - \sec^{2} x read as \tan^{2} x,
 * or an odd function's sign dropped), the Pythagorean partner (\sec^{2} x for
 * \tan^{2} x), the cofunction (sin for cos), and the square kept or lost.
 * For an Answer of ±1: the sign, 0 and 2 (sin² + cos² read as 0 or added).
 * Values: the quadrant's signs ignored, the other quadrant where the given
 * value has the same sign, x and y swapped (sin and cos mixed up), the
 * reciprocal of each value, the missing side found with the squares added
 * instead of subtracted (or the reverse), and one value's sign wrong.
 */
export function distractors(k: Construction): string[] {
  const answer = answerLatex(k);
  if (k.type === "simplify") {
    const a = k.answer;
    const tex = (s: Simplest) => simplestLatex(s);
    const out: string[] = [];
    if (a.fn === null) out.push(tex({ ...a, sign: (-a.sign) as 1 | -1 }), "0", "2", "-2");
    else {
      out.push(tex({ ...a, fn: reciprocalFn(a.fn) }));
      out.push(tex({ ...a, sign: (-a.sign) as 1 | -1 }));
      out.push(tex({ ...a, fn: PARTNER[a.fn] }));
      out.push(tex({ ...a, fn: cofunction(a.fn) }));
      out.push(tex({ ...a, power: a.power === 1 ? 2 : 1 }));
    }
    return distinctHints(answer, out);
  }
  const { point: p, asked, quadrant: q } = k;
  const abs = (s: Surd) => (s.n < 0 ? surdNeg(s) : s);
  const u = abs(p.x);
  const v = abs(p.y);
  const givenValue = pointValue(k.given, p)!;
  const sameSign = ([1, 2, 3, 4] as Quadrant[]).find(
    (q2) => q2 !== q && Math.sign(pointValue(k.given, pointIn(u, v, p.r, q2))!.n) === Math.sign(givenValue.n),
  )!;
  // the side found by the Pythagorean theorem, with the squares added instead of subtracted (or the reverse)
  const sq = (s: Surd) => (s.n * s.n * s.r) / (s.d * s.d);
  const root = (n: number) => (Number.isInteger(n) && n > 0 ? surd(1, n) : null);
  let wrongSide: Point | null = null;
  if (k.given === "sin" || k.given === "csc") {
    const x = root(sq(p.r) + sq(p.y));
    if (x) wrongSide = pointIn(x, v, p.r, q);
  } else if (k.given === "cos" || k.given === "sec") {
    const y = root(sq(p.r) + sq(p.x));
    if (y) wrongSide = pointIn(u, y, p.r, q);
  } else {
    const r = root(Math.abs(sq(p.x) - sq(p.y)));
    if (r) wrongSide = pointIn(u, v, r, q);
  }
  const values = asked.map((f) => pointValue(f, p)!);
  const flipOne = (i: number) =>
    asked.map((f, j) => valueEq(f, j === i ? surdNeg(values[j]) : values[j])).join(ANSWER_PART_SEPARATOR);
  return distinctHints(answer, [
    valuesAnswer(asked, pointIn(u, v, p.r, 1)),
    valuesAnswer(asked, pointIn(u, v, p.r, sameSign)),
    valuesAnswer(asked, pointIn(v, u, p.r, q)),
    asked.map((f) => valueEq(f, pointValue(reciprocalFn(f), p)!)).join(ANSWER_PART_SEPARATOR),
    wrongSide ? valuesAnswer(asked, wrongSide) : null,
    flipOne(0),
    flipOne(1),
  ]);
}

export const generator: Generator = {
  id: FUNDAMENTAL_IDENTITIES_ID,
  title: "Fundamental identities",
  defaultDirections:
    "Use the fundamental identities to simplify each expression to a single trig function or a number, or to find the values asked for.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: FUNDAMENTAL_IDENTITIES_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
