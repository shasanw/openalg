// "Multiplying radicals": one term by one term (3\sqrt{2} \cdot 4\sqrt{10} =
// 24\sqrt{5}), distributing (\sqrt{3}(\sqrt{6} + 2) = 3\sqrt{2} + 2\sqrt{3})
// and two binomials ((2 + \sqrt{3})(1 - \sqrt{3}) = -1 - \sqrt{3}, with
// conjugates and squares among them). Opt-in cube roots and variables
// (assumed positive).
//
// Built ANSWER-FROM-CONSTRUCTION: the factors are chosen so that their
// product has something to simplify (a shared factor under the roots, or a
// radical times itself), and the Answer is the product of the chosen pieces,
// multiplied term by term in whole numbers and simplified by pulling out
// powers. Nothing is ever solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import {
  appendDistinct,
  combine,
  cubeRootsField,
  distinctValued,
  groupLatex,
  isPowerFree,
  isRational,
  mono,
  mulSums,
  negTerm,
  mulTerms,
  pickIndex,
  simplifyMistakes,
  sumLatex,
  term,
  termLatex,
  valuedSum,
  variablesField,
  type RadTerm,
  type RootIndex,
} from "./radicalKit";

export const MULTIPLYING_RADICALS_ID = "multiplying-radicals";

export type FormMode = "mixed" | "monomial" | "distribute" | "binomial";
export type Form = "monomial" | "distribute" | "binomial" | "square";

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Products",
    default: "mixed",
    options: [
      { value: "mixed", label: "Mixed" },
      { value: "monomial", label: "One term by one term, like 3√2 · 4√10" },
      { value: "distribute", label: "Distributing, like √3(√6 + 2)" },
      { value: "binomial", label: "Two binomials, like (2 + √3)(1 − √3)" },
    ],
  },
  cubeRootsField,
  variablesField,
] as const satisfies ParamSchema;

export interface MultiplyConstruction {
  form: Form;
  index: RootIndex;
  /** the factors, each a sum of terms */
  factors: RadTerm[][];
}

/** Radicands for factors: small and already in simplest form. */
const SQUARE_RADICANDS = [2, 3, 5, 6, 7, 10, 11, 14, 15, 21] as const;
const CUBE_RADICANDS = [2, 3, 4, 5, 6, 9, 10, 12] as const;

function radicand(rng: Rng, index: RootIndex, variables: boolean) {
  const n = rng.pick(index === 2 ? SQUARE_RADICANDS : CUBE_RADICANDS);
  return mono(n, variables && rng.bool(0.7) ? [["x", rng.int(1, index === 2 ? 3 : 4)]] : []);
}

/** A radical term c\sqrt{r}, c most often 1. */
function radTerm(rng: Rng, index: RootIndex, variables: boolean, coefMax = 5): RadTerm {
  const c = rng.bool(0.45) ? 1 : rng.int(2, coefMax);
  return term(rng.bool(0.25) ? -c : c, index, radicand(rng, index, variables));
}

/** Whether multiplying the radicals gives something to pull out. */
const simplifies = (a: RadTerm, b: RadTerm) => {
  if (isRational(a) || isRational(b)) return false;
  const r = a.rad.n * b.rad.n;
  const varsOut = [...a.rad.vars, ...b.rad.vars].reduce((m, [, e]) => m + e, 0) >= a.index;
  return !isPowerFree(r, a.index) || varsOut;
};

function attempt(form: Form, index: RootIndex, variables: boolean, rng: Rng): MultiplyConstruction | null {
  if (form === "monomial") {
    const a = radTerm(rng, index, variables);
    const b = radTerm(rng, index, variables);
    if (!simplifies(a, b)) return null;
    return { form, index, factors: [[a], [b]] };
  }
  if (form === "distribute") {
    const t = radTerm(rng, index, variables);
    const u = radTerm(rng, index, variables, 4);
    const v = rng.bool(0.5) ? term(rng.int(1, 6) * (rng.bool() ? -1 : 1)) : radTerm(rng, index, variables, 4);
    if (!simplifies(t, u) && !simplifies(t, v)) return null;
    // "(\sqrt{6} + \sqrt{6})" or a first term with a minus reads oddly
    const inner = [u, v];
    if (inner[0].coef.n < 0 || combine(inner).length < 2) return null;
    return { form, index, factors: [[t], inner] };
  }
  // Binomials stay numeric: (a + b\sqrt{r})(c + d\sqrt{r'}).
  const r = radicand(rng, index, false);
  const bin = (rr = r) => {
    const a = rng.int(1, 6) * (rng.bool(0.3) ? -1 : 1);
    const b = rng.int(1, 4) * (rng.bool(0.4) ? -1 : 1);
    return [term(a), term(b, index, rr)];
  };
  const first = bin();
  if (form === "square") return { form, index, factors: [first, first] };
  const roll = rng.next();
  let second: RadTerm[];
  if (roll < 0.3 && index === 2) second = [first[0], term(-first[1].coef.n, index, r)]; // conjugate
  else if (roll < 0.75) second = bin();
  else second = bin(radicand(rng, index, false));
  if (sumLatex(second) === sumLatex(first)) return null;
  return { form, index, factors: [first, second] };
}

export function construct(params: ParamValues, rng: Rng): MultiplyConstruction {
  const p = resolveParams(schema, params);
  const mode = p.form as FormMode;
  for (;;) {
    const index = pickIndex(rng, p.cubeRoots as boolean);
    let form: Form =
      mode === "mixed" ? rng.pick(["monomial", "monomial", "distribute", "distribute", "binomial", "binomial"] as const) : mode;
    if (form === "binomial" && rng.bool(0.15)) form = "square";
    const k = attempt(form, index, p.variables as boolean, rng);
    if (k && answerTerms(k).length > 0) return k;
  }
}

/** A factor as printed in a product: a lone negative term gets brackets. */
function factorLatex(f: RadTerm[], i: number): string {
  if (f.length > 1) return groupLatex(f);
  return i > 0 && f[0].coef.n < 0 ? `(${termLatex(f[0])})` : termLatex(f[0]);
}

export function promptLatex(k: MultiplyConstruction): string {
  if (k.form === "square") return `${groupLatex(k.factors[0])}^{2}`;
  if (k.form === "monomial") return k.factors.map(factorLatex).join(" \\cdot ");
  return k.factors.map(factorLatex).join("");
}

export const answerTerms = (k: MultiplyConstruction): RadTerm[] => mulSums(k.factors[0], k.factors[1]);
export const answerLatex = (k: MultiplyConstruction) => sumLatex(answerTerms(k));

/** \sqrt{r} \cdot \sqrt{r} read as r^2 rather than r. */
function squaredWrong(a: RadTerm, b: RadTerm): RadTerm {
  if (!isRational(a) && a.index === 2 && b.index === 2 && a.rad.n === b.rad.n && a.rad.vars.length === 0)
    return term(a.coef.n * b.coef.n * a.rad.n ** 2);
  return mulTerms(a, b);
}

/**
 * Mistake-based Distractors, each a wrong value:
 * - one term by one term: multiplied the radicands but added the
 *   coefficients; multiplied the coefficients but added the radicands; and
 *   the ways of simplifying the product wrongly (the power left outside, the
 *   power halved, what came out added to the coefficient, the leftover
 *   dropped);
 * - distributing: multiplied only the first term; a sign slip on the second;
 *   a whole number multiplied under the root; a product simplified wrongly;
 * - binomials: only the first and last products (the classic (a + b)^2 =
 *   a^2 + b^2); \sqrt{r} \cdot \sqrt{r} read as r^2; a sign slip on the last
 *   product; one middle term dropped.
 */
export function distractors(k: MultiplyConstruction): string[] {
  const [A, B] = k.factors;
  const n = k.index;
  const c: RadTerm[][] = [];
  /** Later mistakes: appended after the ones above so their order is kept. */
  const more: RadTerm[][] = [];
  if (k.form === "monomial") {
    const [a] = A;
    const [b] = B;
    const product = term(a.coef.n * b.coef.n, n, mono(a.rad.n * b.rad.n, [...a.rad.vars, ...b.rad.vars]));
    c.push(combine([term(a.coef.n + b.coef.n, n, product.rad)]));
    if (a.rad.vars.length === 0 && b.rad.vars.length === 0)
      c.push(combine([term(product.coef.n, n, a.rad.n + b.rad.n)]));
    for (const m of simplifyMistakes(product)) c.push(combine([m]));
    // added the two terms instead of multiplying them: \sqrt{6} \cdot \sqrt{3} = \sqrt{6} + \sqrt{3}
    more.push(combine([a, b]));
    // multiplied the numbers in front and kept one radical: \sqrt{5} \cdot \sqrt{5} = \sqrt{5}
    if (!isRational(a) && a.rad.n === b.rad.n && a.rad.vars.length === 0 && b.rad.vars.length === 0)
      more.push(combine([term(a.coef.n * b.coef.n, n, a.rad)]));
    // multiplied the variables but added the numbers under the root: \sqrt{11x} \cdot \sqrt{11x} = \sqrt{22x^{2}}
    if (!isRational(a) && !isRational(b) && (a.rad.vars.length > 0 || b.rad.vars.length > 0))
      more.push(combine([term(product.coef.n, n, mono(a.rad.n + b.rad.n, [...a.rad.vars, ...b.rad.vars]))]));
    // multiplied the numbers under the root but left the variables as they were: \sqrt{3x} \cdot \sqrt{3x} = \sqrt{9x}
    if (a.rad.vars.length > 0 && b.rad.vars.length > 0)
      more.push(combine([term(product.coef.n, n, mono(a.rad.n * b.rad.n, a.rad.vars))]));
    // treated equal radicals as like terms to add: \sqrt{2} \cdot \sqrt{2} = 2\sqrt{2}
    if (!isRational(a) && a.rad.n === b.rad.n && a.rad.vars.length === 0 && b.rad.vars.length === 0)
      more.push(combine([term(2 * a.coef.n * b.coef.n, n, a.rad)]));
  } else if (k.form === "distribute") {
    const [t] = A;
    const [u, v] = B;
    c.push(combine([mulTerms(t, u), v]));
    c.push(combine([mulTerms(t, u), mulTerms(t, v)].map((x, i) => (i === 1 ? { ...x, coef: mono(-x.coef.n, x.coef.vars) } : x))));
    if (isRational(v)) c.push(combine([mulTerms(t, u), term(t.coef, n, mono(t.rad.n * v.coef.n ** 2, t.rad.vars))]));
    for (const [x, y] of [
      [u, v],
      [v, u],
    ] as const) {
      const raw = term(mono(t.coef.n * x.coef.n, [...t.coef.vars, ...x.coef.vars]), n, mono(t.rad.n * x.rad.n, [...t.rad.vars, ...x.rad.vars]));
      if (isRational(x)) continue;
      for (const m of simplifyMistakes(raw)) c.push(combine([m, mulTerms(t, y)]));
    }
    // forgot to distribute to the first term: \sqrt{7}(\sqrt{7} - 3) = \sqrt{7} - 3\sqrt{7}
    more.push(combine([u, mulTerms(t, v)]));
    // dropped the number in front of the second factor's radical: \sqrt{2} \cdot 2\sqrt{2} = 2
    if (!isRational(u) && Math.abs(u.coef.n) !== 1) more.push(combine([mulTerms(t, term(Math.sign(u.coef.n), n, u.rad)), mulTerms(t, v)]));
    // a sign slip on the first product only
    more.push(combine([negTerm(mulTerms(t, u)), mulTerms(t, v)]));
    // multiplied the radicands by adding them: \sqrt{7} \cdot \sqrt{7} = \sqrt{14}
    if (!isRational(u) && t.rad.vars.length === 0 && u.rad.vars.length === 0)
      more.push(combine([term(t.coef.n * u.coef.n, n, t.rad.n + u.rad.n), mulTerms(t, v)]));
  } else {
    const [a1, a2] = A;
    const [b1, b2] = B;
    c.push(combine([mulTerms(a1, b1), mulTerms(a2, b2)]));
    c.push(combine([mulTerms(a1, b1), mulTerms(a1, b2), mulTerms(a2, b1), squaredWrong(a2, b2)]));
    c.push(combine([mulTerms(a1, b1), mulTerms(a1, b2), mulTerms(a2, b1), mulTerms(a2, b2)].map((x, i) => (i === 3 ? { ...x, coef: mono(-x.coef.n, x.coef.vars) } : x))));
    c.push(combine([mulTerms(a1, b1), mulTerms(a1, b2), mulTerms(a2, b2)]));
    c.push(combine([mulTerms(a1, b1), mulTerms(a2, b1), mulTerms(a2, b2)]));
    if (!isRational(a2) && !isRational(b2) && a2.rad.vars.length === 0 && b2.rad.vars.length === 0) {
      const lead = [mulTerms(a1, b1), mulTerms(a1, b2), mulTerms(a2, b1)];
      const cf = a2.coef.n * b2.coef.n;
      // multiplied the radicands by adding them: \sqrt{r} \cdot \sqrt{r} = \sqrt{2r}
      more.push(combine([...lead, term(cf, n, a2.rad.n + b2.rad.n)]));
      if (a2.rad.n === b2.rad.n) {
        // kept one radical: \sqrt[3]{r} \cdot \sqrt[3]{r} = \sqrt[3]{r}
        more.push(combine([...lead, term(cf, n, a2.rad)]));
        // the square-root habit: \sqrt[3]{r} \cdot \sqrt[3]{r} = r
        if (n === 3) more.push(combine([...lead, term(cf * a2.rad.n)]));
      }
    }
  }
  const answer = answerTerms(k);
  c.push(answer.map((t, i) => (i === answer.length - 1 ? { ...t, coef: mono(-t.coef.n, t.coef.vars) } : t)));
  const correct = valuedSum(answer);
  const candidates = c.filter((terms) => terms.length > 0).map(valuedSum);
  const extra = more.filter((terms) => terms.length > 0).map(valuedSum);
  const hints = distinctValued(correct, candidates);
  // With equal small roots several mistakes coincide. Omitting one factor
  // is another distinct mistake for these short lists.
  if (hints.length < 3)
    return appendDistinct(correct, [...candidates, valuedSum(A), valuedSum(B)], extra, 3);
  return appendDistinct(correct, candidates, extra);
}

export const generator: Generator = {
  id: MULTIPLYING_RADICALS_ID,
  title: "Multiplying radicals",
  defaultDirections: "Simplify.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: MULTIPLYING_RADICALS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
