// Shared pieces for the Radicals Topics (simplifying, adding and subtracting,
// multiplying, dividing and rationalizing, radical equations): exact radical
// terms c * root_n(r) whose coefficient and radicand are monomials with whole
// number coefficients, their simplification, products, like-term combining
// and rationalizing, LaTeX that both KaTeX and mitex accept, and numeric
// values for telling Distractors apart from the Answer.
//
// Nothing here solves anything. Generators choose the Answer's pieces first
// (the factor that comes out of the root, the radicand left inside, the
// coefficients of like terms) and print the Problem from them; the arithmetic
// below is whole-number factoring and multiplication on those chosen pieces.
//
// Variables are assumed positive, as Algebra 1 and 2 worksheets state, so an
// even root of x^2 is x (no absolute value).

import { gcd } from "../../format";
import { choiceKey } from "../../mc";
import type { Rng } from "../../rng";
import type { ParamField } from "../../types";

export type RootIndex = 2 | 3;

/** Variable factors, sorted by letter, every exponent positive. */
export type Vars = readonly (readonly [string, number])[];

/** A monomial n * x^a * y^b ... with a whole-number coefficient. */
export interface Mono {
  n: number;
  vars: Vars;
}

/** A term coef * root_index(rad). A rational term has rad 1 (and index 2). */
export interface RadTerm {
  coef: Mono;
  index: RootIndex;
  rad: Mono;
}

/** A quotient (sum of terms) / den, the den free of radicals and positive. */
export interface RadFraction {
  num: RadTerm[];
  den: Mono;
}

// ------------------------------------------------------------------ monomials

function normVars(vars: Vars): Vars {
  const acc = new Map<string, number>();
  for (const [v, e] of vars) acc.set(v, (acc.get(v) ?? 0) + e);
  return [...acc]
    .filter(([, e]) => e !== 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export function mono(n: number, vars: Vars = []): Mono {
  // `+ 0` turns -0 into 0 so baked strings never read "-0".
  return { n: n + 0, vars: normVars(vars) };
}

export const ONE: Mono = mono(1);

export const monoMul = (a: Mono, b: Mono): Mono => mono(a.n * b.n, [...a.vars, ...b.vars]);

export function monoPow(a: Mono, k: number): Mono {
  let out = ONE;
  for (let i = 0; i < k; i++) out = monoMul(out, a);
  return out;
}

export const varsKey = (vars: Vars) => vars.map(([v, e]) => `${v}${e}`).join("");
export const isOne = (m: Mono) => m.n === 1 && m.vars.length === 0;
export const varDegree = (vars: Vars) => vars.reduce((s, [, e]) => s + e, 0);

/** x^{2}y */
export function varsLatex(vars: Vars): string {
  return vars.map(([v, e]) => (e === 1 ? v : `${v}^{${e}}`)).join("");
}

/** A monomial's magnitude: "12", "x^{2}", "3xy". */
export function monoBody(m: Mono): string {
  const mag = Math.abs(m.n);
  if (m.vars.length === 0) return String(mag);
  return (mag === 1 ? "" : String(mag)) + varsLatex(m.vars);
}

/** A monomial with its sign: "-3x". */
export const monoLatex = (m: Mono): string => (m.n < 0 ? "-" : "") + monoBody(m);

// ------------------------------------------------------------------ terms

export function term(coef: Mono | number, index: RootIndex = 2, rad: Mono | number = 1): RadTerm {
  const c = typeof coef === "number" ? mono(coef) : coef;
  const r = typeof rad === "number" ? mono(rad) : rad;
  return { coef: c, index: isOne(r) ? 2 : index, rad: r };
}

export const isRational = (t: RadTerm) => isOne(t.rad);

/** Whether n has no factor p^index with p > 1. */
export function isPowerFree(n: number, index: RootIndex): boolean {
  n = Math.abs(n);
  for (let f = 2; f ** index <= n; f++) if (n % f ** index === 0) return false;
  return true;
}

/** Pull every whole index-th power out of the radicand. */
export function simplifyTerm(t: RadTerm): RadTerm {
  if (t.coef.n === 0 || t.rad.n === 0) return term(0);
  let sign = 1;
  let inside = t.rad.n;
  if (inside < 0) {
    if (t.index === 2) throw new Error("radicalKit: square root of a negative");
    sign = -1;
    inside = -inside;
  }
  let outside = 1;
  for (let f = 2; f ** t.index <= inside; f++) {
    const p = f ** t.index;
    while (inside % p === 0) {
      inside /= p;
      outside *= f;
    }
  }
  const outVars: [string, number][] = [];
  const inVars: [string, number][] = [];
  for (const [v, e] of t.rad.vars) {
    const q = Math.floor(e / t.index);
    if (q > 0) outVars.push([v, q]);
    if (e % t.index > 0) inVars.push([v, e % t.index]);
  }
  return term(monoMul(t.coef, mono(sign * outside, outVars)), t.index, mono(inside, inVars));
}

/**
 * Wrong ways of simplifying a term, for Distractors (some may equal the
 * right value; distinctValued drops those):
 * - left the power outside: \sqrt{72} = \sqrt{36 \cdot 2} as 36\sqrt{2};
 * - divided the power by the index instead of taking its root: 18\sqrt{2};
 * - added what came out to the coefficient instead of multiplying;
 * - dropped what stays inside.
 */
export function simplifyMistakes(t: RadTerm): RadTerm[] {
  const right = simplifyTerm(t);
  if (isRational(t) || t.rad.n === 0) return [];
  const n = t.index;
  const out = Math.round(Math.abs(right.coef.n / t.coef.n));
  const outVars = (f: (e: number) => number): [string, number][] =>
    t.rad.vars.map(([v, e]) => [v, f(e)] as [string, number]);
  const inside = right.rad;
  const sign = Math.sign(right.coef.n / t.coef.n);
  const make = (coef: number, vars: [string, number][], rad: Mono) =>
    term(monoMul(mono(coef, vars), mono(1, t.coef.vars)), n, rad);
  const c = t.coef.n;
  const list: RadTerm[] = [make(c * sign * out ** n, outVars((e) => e - (e % n)), inside)];
  if ((out ** n) % n === 0) list.push(make((c * sign * out ** n) / n, outVars((e) => Math.floor(e / n)), inside));
  if (Math.abs(c) !== 1) list.push(make(sign * (c + out), outVars((e) => Math.floor(e / n)), inside));
  if (!isOne(inside)) list.push(make(c * sign * out, outVars((e) => Math.floor(e / n)), ONE));
  return list;
}

/** Whether a term is in simplest form (no index-th power left under its root). */
export function isSimplified(t: RadTerm): boolean {
  if (isRational(t)) return true;
  return t.rad.n > 0 && isPowerFree(t.rad.n, t.index) && t.rad.vars.every(([, e]) => e < t.index);
}

/** Like terms share their root, radicand and outside variables. */
export function likeKey(t: RadTerm): string {
  const root = isRational(t) ? "1" : `${t.index}:${t.rad.n}${varsKey(t.rad.vars)}`;
  return `${root}|${varsKey(t.coef.vars)}`;
}

/** The product of two terms, simplified. Roots must share an index unless one is rational. */
export function mulTerms(a: RadTerm, b: RadTerm): RadTerm {
  if (!isRational(a) && !isRational(b) && a.index !== b.index) throw new Error("radicalKit: mixed root indices");
  const index = isRational(a) ? b.index : a.index;
  return simplifyTerm(term(monoMul(a.coef, b.coef), index, monoMul(a.rad, b.rad)));
}

export const negTerm = (t: RadTerm): RadTerm => ({ ...t, coef: mono(-t.coef.n, t.coef.vars) });
export const scaleTerm = (t: RadTerm, k: number): RadTerm => ({ ...t, coef: mono(k * t.coef.n, t.coef.vars) });

/** Higher degree first ("x - \sqrt{x} - 6"), then a rational term before radicals ("4 + 2\sqrt{3}"), then radicands ascending. */
function termOrder(a: RadTerm, b: RadTerm): number {
  const degree = (t: RadTerm) => varDegree(t.coef.vars) + varDegree(t.rad.vars) / t.index;
  return (
    degree(b) - degree(a) ||
    Number(isRational(b)) - Number(isRational(a)) ||
    a.index - b.index ||
    a.rad.n - b.rad.n ||
    (varsKey(a.rad.vars) < varsKey(b.rad.vars) ? -1 : varsKey(a.rad.vars) > varsKey(b.rad.vars) ? 1 : 0)
  );
}

/** Simplify every term, combine like terms, drop zeros, and sort. */
export function combine(terms: readonly RadTerm[]): RadTerm[] {
  const groups = new Map<string, RadTerm>();
  for (const raw of terms) {
    const t = simplifyTerm(raw);
    if (t.coef.n === 0) continue;
    const key = likeKey(t);
    const prev = groups.get(key);
    groups.set(key, prev ? { ...prev, coef: mono(prev.coef.n + t.coef.n, prev.coef.vars) } : t);
  }
  return [...groups.values()].filter((t) => t.coef.n !== 0).sort(termOrder);
}

/** Every product of a term of `a` with a term of `b`, combined. */
export function mulSums(a: readonly RadTerm[], b: readonly RadTerm[]): RadTerm[] {
  return combine(a.flatMap((x) => b.map((y) => mulTerms(x, y))));
}

// ------------------------------------------------------------------ printing

/** root_index(body): "\sqrt{2x}", "\sqrt[3]{-54}". */
export function rootLatex(index: RootIndex, body: string): string {
  return index === 2 ? `\\sqrt{${body}}` : `\\sqrt[3]{${body}}`;
}

/** A radicand as printed: "50", "-54", "2x^{3}". */
export const radicandLatex = (m: Mono): string => (m.n < 0 ? "-" : "") + monoBody(m);

/** A term's magnitude: "5", "3x", "\sqrt{2}", "4y\sqrt[3]{2x}". */
export function termBody(t: RadTerm): string {
  if (isRational(t)) return monoBody(t.coef);
  const mag = Math.abs(t.coef.n);
  const coef = mag === 1 && t.coef.vars.length === 0 ? "" : monoBody(t.coef);
  return coef + rootLatex(t.index, radicandLatex(t.rad));
}

/** A term with its sign. */
export const termLatex = (t: RadTerm): string => (t.coef.n < 0 ? "-" : "") + termBody(t);

/** A sum of terms with proper signs, in the order given; "0" when empty. */
export function sumLatex(terms: readonly RadTerm[]): string {
  if (terms.length === 0) return "0";
  return terms
    .map((t, i) => {
      const negative = t.coef.n < 0;
      if (i === 0) return (negative ? "-" : "") + termBody(t);
      return ` ${negative ? "-" : "+"} ${termBody(t)}`;
    })
    .join("");
}

/** A sum in parentheses when it has several terms: "(\sqrt{6} + 2)". */
export const groupLatex = (terms: readonly RadTerm[]): string =>
  terms.length === 1 ? sumLatex(terms) : `(${sumLatex(terms)})`;

/** "\frac{3\sqrt{2}}{4}", "-\frac{6 + 2\sqrt{3}}{11}", or a plain sum over 1. */
export function fractionLatex(f: RadFraction): string {
  if (isOne(f.den)) return sumLatex(f.num);
  const allNegative = f.num.length > 0 && f.num.every((t) => t.coef.n < 0);
  const num = allNegative ? f.num.map(negTerm) : f.num;
  return `${allNegative ? "-" : ""}\\frac{${sumLatex(num)}}{${monoBody(f.den)}}`;
}

// ------------------------------------------------------------------ fractions

/** Divide out every common factor of the numerator's coefficients and the denominator. */
export function reduceFraction(f: RadFraction): RadFraction {
  let num = combine(f.num);
  let den = f.den;
  if (den.n < 0) {
    num = num.map(negTerm);
    den = mono(-den.n, den.vars);
  }
  if (num.length === 0) return { num, den: ONE };
  let g = den.n;
  for (const t of num) g = gcd(g, t.coef.n);
  const common = new Map<string, number>(den.vars.map(([v, e]) => [v, e]));
  for (const t of num) {
    for (const v of [...common.keys()]) {
      const e = t.coef.vars.find(([w]) => w === v)?.[1] ?? 0;
      common.set(v, Math.min(common.get(v)!, e));
    }
  }
  const divVars: [string, number][] = [...common].filter(([, e]) => e > 0).map(([v, e]) => [v, -e]);
  const divide = (m: Mono) => mono(m.n / (g || 1), [...m.vars, ...divVars]);
  return { num: num.map((t) => ({ ...t, coef: divide(t.coef) })), den: divide(den) };
}

/**
 * Rationalize num / den where den is one term: multiply top and bottom by
 * root_n(R^(n-1)), so the bottom becomes the whole number coef * R.
 */
export function rationalizeMonomial(num: readonly RadTerm[], den: RadTerm): RadFraction {
  const d = simplifyTerm(den);
  if (isRational(d)) return reduceFraction({ num: [...num], den: d.coef });
  const by = term(1, d.index, monoPow(d.rad, d.index - 1));
  return reduceFraction({ num: mulSums(num, [by]), den: monoMul(d.coef, d.rad) });
}

/** Rationalize num / (a + b\sqrt{r}) with the conjugate a - b\sqrt{r}; a, b whole numbers. */
export function rationalizeBinomial(num: readonly RadTerm[], a: number, b: number, r: number): RadFraction {
  const conj = [term(a), term(-b, 2, r)];
  return reduceFraction({ num: mulSums(num, conj), den: mono(a * a - b * b * r) });
}

// ------------------------------------------------------------------ values

/** Positive values for the variables, chosen so that unequal expressions differ. */
export const VALUE_ENV: Readonly<Record<string, number>> = { x: 1.37, y: 2.29, z: 0.71, a: 1.83, b: 2.57 };

export function monoValue(m: Mono, env: Readonly<Record<string, number>> = VALUE_ENV): number {
  return m.vars.reduce((v, [x, e]) => v * (env[x] ?? NaN) ** e, m.n);
}

export function termValue(t: RadTerm, env: Readonly<Record<string, number>> = VALUE_ENV): number {
  const r = monoValue(t.rad, env);
  const root = r < 0 ? -((-r) ** (1 / t.index)) : r ** (1 / t.index);
  return monoValue(t.coef, env) * root;
}

export const sumValue = (terms: readonly RadTerm[], env?: Readonly<Record<string, number>>) =>
  terms.reduce((s, t) => s + termValue(t, env), 0);

export const fractionValue = (f: RadFraction, env?: Readonly<Record<string, number>>) =>
  sumValue(f.num, env) / monoValue(f.den, env);

export const closeTo = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** A candidate Distractor: its LaTeX and its value (NaN when it has none). */
export interface Valued {
  tex: string;
  value: number;
}

/**
 * Keep the candidates whose value differs from the Answer's and from every
 * earlier kept candidate (an equal value would be a second correct choice,
 * however it is spelled), and whose spelling is new, in order.
 */
export function distinctValued(answer: Valued, candidates: readonly (Valued | null | undefined)[]): string[] {
  const values: number[] = [answer.value];
  const keys = new Set<string>([choiceKey(answer.tex)]);
  const out: string[] = [];
  for (const c of candidates) {
    if (!c || !Number.isFinite(c.value)) continue;
    if (values.some((v) => closeTo(v, c.value))) continue;
    const key = choiceKey(c.tex);
    if (keys.has(key)) continue;
    values.push(c.value);
    keys.add(key);
    out.push(c.tex);
  }
  return out;
}

/**
 * `distinctValued(answer, old)` capped at `cap`, followed by the distinct
 * values of `extra` that it does not already hold. New mistakes are appended
 * this way so a Topic's earlier Distractors keep their order and rank.
 */
export function appendDistinct(
  answer: Valued,
  old: readonly (Valued | null | undefined)[],
  extra: readonly (Valued | null | undefined)[],
  cap = 6,
): string[] {
  const base = distinctValued(answer, old);
  const all = distinctValued(answer, [...old, ...extra]);
  return [...base.slice(0, cap), ...all.slice(base.length)];
}

export const valuedSum = (terms: readonly RadTerm[]): Valued => ({ tex: sumLatex(terms), value: sumValue(terms) });
export const valuedFraction = (f: RadFraction): Valued => ({ tex: fractionLatex(f), value: fractionValue(f) });

// ------------------------------------------------------------------ choosing

/** Square-free and cube-free radicands, small first. */
export const SQUARE_FREE = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23, 26, 29, 30] as const;
export const CUBE_FREE = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22] as const;

/** A radicand left inside a simplified root, at most `max`. */
export function pickPowerFree(rng: Rng, index: RootIndex, max = 30): number {
  const list = (index === 2 ? SQUARE_FREE : CUBE_FREE).filter((n) => n <= max);
  return rng.pick(list.length > 0 ? list : [2]);
}

export const cubeRootsField = {
  type: "boolean",
  key: "cubeRoots",
  label: "Include cube roots",
  default: false,
} as const satisfies ParamField;

export const variablesField = {
  type: "boolean",
  key: "variables",
  label: "Include variables (assumed positive)",
  default: false,
} as const satisfies ParamField;

/** Square roots, or about half the time cube roots when they are on. */
export const pickIndex = (rng: Rng, cubeRoots: boolean): RootIndex => (cubeRoots && rng.bool(0.5) ? 3 : 2);

/** A nonzero whole number with |n| in [lo, hi], negative only when allowed. */
export function signedInt(rng: Rng, lo: number, hi: number, allowNegative = true): number {
  const m = rng.int(lo, hi);
  return allowNegative && rng.bool() ? -m : m;
}
