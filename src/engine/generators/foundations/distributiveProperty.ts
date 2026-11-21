// "The distributive property": multiply out a(bx + c), e.g. -4(2x - 3) as
// -8x + 12, with optional fraction or variable multipliers, three terms in
// the parentheses, and combining like terms afterwards (3(x + 4) - 5x).
//
// Built ANSWER-FIRST: the multiplier m is chosen, then the Answer's terms are
// drawn as multiples of m (so a fraction multiplier still leaves whole-number
// coefficients inside), and the terms in the parentheses are the Answer's
// terms divided by m. With like terms, the extra term or group is added to the
// Answer exactly. Nothing is expanded or simplified after the fact.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import {
  abs,
  add,
  distinctHints,
  isInt,
  linearLatex,
  mul,
  neg,
  nonzeroInt,
  numLatex,
  pickVariable,
  rat,
  ratEq,
  varyVariableField,
  type Rat,
} from "../shared/equationKit";

export const DISTRIBUTIVE_PROPERTY_ID = "distributive-property";

export type Multiplier = "integer" | "fraction" | "variable";

export const schema = [
  {
    type: "enum",
    key: "multiplier",
    label: "Outside the parentheses",
    default: "integer",
    options: [
      { value: "integer", label: "Integers" },
      { value: "fraction", label: "Fractions" },
      { value: "variable", label: "A term with the variable" },
    ],
  },
  {
    type: "int",
    key: "terms",
    label: "Terms inside the parentheses",
    min: 2,
    max: 3,
    default: 2,
  },
  {
    type: "boolean",
    key: "combineLikeTerms",
    label: "Then combine like terms",
    default: false,
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative numbers",
    default: true,
  },
  {
    type: "int",
    key: "maxCoefficient",
    label: "Largest number inside the parentheses",
    min: 2,
    max: 12,
    default: 9,
  },
  varyVariableField,
] as const satisfies ParamSchema;

/** coef \cdot v^deg */
export interface Term {
  coef: Rat;
  deg: number;
}

/** mult(inner[0] + inner[1] + ...) */
export interface Group {
  mult: Term;
  inner: Term[];
}

/** The structured construction. Exposed for property tests. */
export interface DistributiveConstruction {
  v: string;
  /** the main group, a(bx + c) */
  group: Group;
  /** with like terms: a term or a second group printed after (or a term before) the main group */
  extra: { part: Term | Group; before: boolean } | null;
  /** print the Answer in standard form (like terms were combined) rather than in the parentheses' order */
  combined: boolean;
  /** the Answer's terms, in printed order */
  answer: Term[];
}

const isGroup = (p: Term | Group): p is Group => "inner" in p;

/** Multiply out a group, term by term, in its own order. */
export function expand(g: Group): Term[] {
  return g.inner.map((t) => ({ coef: mul(g.mult.coef, t.coef), deg: g.mult.deg + t.deg }));
}

/** Add like terms and order by descending degree, dropping zeros. */
export function combine(terms: Term[]): Term[] {
  const byDeg = new Map<number, Rat>();
  for (const t of terms) byDeg.set(t.deg, add(byDeg.get(t.deg) ?? rat(0), t.coef));
  return [...byDeg.entries()]
    .filter(([, c]) => c.n !== 0)
    .sort((a, b) => b[0] - a[0])
    .map(([deg, coef]) => ({ coef, deg }));
}

/** Inner degrees: two terms are a variable term and a constant; three add a square. */
function innerDegrees(rng: Rng, count: number): number[] {
  const degs = count === 2 ? [1, 0] : [2, 1, 0];
  // usually in standard order; sometimes the constant comes first: 6(1 + 6n)
  if (rng.bool(0.25)) degs.reverse();
  return degs;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): DistributiveConstruction {
  const p = resolveParams(schema, params);
  const kind = p.multiplier as Multiplier;
  const negOk = p.allowNegatives as boolean;
  const C = p.maxCoefficient as number;
  const v = pickVariable(rng, p.varyVariable as boolean);
  const count = p.terms as number;

  /** the multiplier, and the step its multiples of the Answer's coefficients take */
  const drawMultiplier = (): Term => {
    switch (kind) {
      case "integer":
        // -(x - 4) now and then: a lone minus sign is a multiplier too
        if (negOk && rng.bool(0.12)) return { coef: rat(-1), deg: 0 };
        return { coef: rat(nonzeroInt(rng, 2, 9, negOk)), deg: 0 };
      case "fraction": {
        const d = rng.pick([2, 3, 4, 5]);
        let n = rng.int(1, d - 1);
        while (rat(n, d).d !== d) n = rng.int(1, d - 1);
        return { coef: rat(negOk && rng.bool(0.4) ? -n : n, d), deg: 0 };
      }
      case "variable":
        return { coef: rng.bool(0.3) ? rat(negOk && rng.bool() ? -1 : 1) : rat(nonzeroInt(rng, 2, 6, negOk)), deg: 1 };
    }
  };

  const drawGroup = (terms: number): Group => {
    const mult = drawMultiplier();
    const degs = innerDegrees(rng, terms);
    // Answer coefficient = mult \cdot k; a fraction multiplier needs k a multiple of its denominator
    const step = mult.coef.d;
    const inner = degs.map((deg, i) => {
      const lead = i === 0;
      // the leading inner term is positive unless negatives are on; a unit coefficient is fine on the variable
      let k = nonzeroInt(rng, 1, Math.max(1, Math.floor(C / step)), negOk && !lead) * step;
      if (lead && negOk && rng.bool(0.2)) k = -k;
      if (deg === 0 && Math.abs(k) === 1 && step === 1 && rng.bool(0.6)) k *= rng.int(2, Math.max(2, C));
      return { coef: rat(k), deg };
    });
    return { mult, inner };
  };

  for (let attempt = 0; ; attempt++) {
    const group = drawGroup(count);
    if (!p.combineLikeTerms) {
      return { v, group, extra: null, combined: false, answer: expand(group) };
    }
    // a like term to combine with: a term after, a number before ("5 - 2(x - 3)"), or a second group
    const shape = rng.pick(["termAfter", "termBefore", "group"] as const);
    let extra: DistributiveConstruction["extra"];
    if (shape === "group" && count === 2) {
      const second = drawGroup(2);
      if (!negOk && second.mult.coef.n < 0) continue;
      extra = { part: second, before: false };
    } else {
      // like one of the expanded terms, so something combines
      const product = expand(group);
      const deg = rng.pick(product.map((t) => t.deg));
      const coef = rat(nonzeroInt(rng, 1, Math.max(2, C), negOk || shape === "termAfter"));
      extra = { part: { coef: shape === "termAfter" && !negOk ? abs(coef) : coef, deg }, before: shape === "termBefore" };
    }
    const all = [...(extra.before ? partTerms(extra.part) : []), ...expand(group), ...(extra.before ? [] : partTerms(extra.part))];
    const answer = combine(all);
    // combining should leave every power of the variable that was there, and something to combine
    const degsBefore = new Set(all.map((t) => t.deg));
    if (answer.length !== degsBefore.size && attempt < 50) continue;
    if (answer.length === 0) continue;
    if (!negOk && answer.some((t) => t.coef.n < 0) && attempt < 50) continue;
    return { v, group, extra, combined: true, answer };
  }
}

function partTerms(part: Term | Group): Term[] {
  return isGroup(part) ? expand(part) : [part];
}

// ------------------------------------------------------------------ printing

const power = (v: string, deg: number) => (deg === 0 ? "" : deg === 1 ? v : `${v}^{${deg}}`);

/** A polynomial in the given order: "-8x + 12", "6x^{2} + 2x". */
export function termsLatex(terms: Term[], v: string): string {
  return linearLatex(
    terms.map((t) => ({ coef: t.coef, v: power(v, t.deg) })),
    "fraction",
  );
}

/** The multiplier in front of a group, without its sign: "4", "\frac{1}{2}", "3x", "x", or "" for 1. */
function multiplierBody(m: Term, v: string): string {
  const mag = abs(m.coef);
  const num = ratEq(mag, rat(1)) ? "" : numLatex(mag);
  return num + power(v, m.deg);
}

function groupLatex(g: Group, v: string, first: boolean): string {
  const body = `${multiplierBody(g.mult, v)}(${termsLatex(g.inner, v)})`;
  const negative = g.mult.coef.n < 0;
  if (first) return (negative ? "-" : "") + body;
  return ` ${negative ? "-" : "+"} ${body}`;
}

function termLatexAt(t: Term, v: string, first: boolean): string {
  const s = termsLatex([t], v);
  if (first) return s;
  return s.startsWith("-") ? ` - ${s.slice(1)}` : ` + ${s}`;
}

export function promptLatex(k: DistributiveConstruction): string {
  if (!k.extra) return groupLatex(k.group, k.v, true);
  const { part, before } = k.extra;
  const partAt = (first: boolean) => (isGroup(part) ? groupLatex(part, k.v, first) : termLatexAt(part, k.v, first));
  return before ? partAt(true) + groupLatex(k.group, k.v, false) : groupLatex(k.group, k.v, true) + partAt(false);
}

export function answerLatex(k: DistributiveConstruction, terms: Term[] = k.answer): string {
  // a mistake that leaves like terms (2x + 3x) is written combined, as a student would
  const repeats = new Set(terms.map((t) => t.deg)).size < terms.length;
  return termsLatex(k.combined || repeats ? combine(terms) : terms, k.v);
}

// ------------------------------------------------------------------ mistakes

/** The whole printed expression, worked with one group expanded the wrong way. */
function withGroupMistake(k: DistributiveConstruction, wrong: (g: Group) => Term[]): Term[] {
  const main = wrong(k.group);
  if (!k.extra) return main;
  const { part, before } = k.extra;
  const other = isGroup(part) ? wrong(part) : [part];
  return before ? [...other, ...main] : [...main, ...other];
}

/** Multiplied only the first term: 3(x + 4) as 3x + 4. */
const firstOnly = (g: Group): Term[] => [
  { coef: mul(g.mult.coef, g.inner[0].coef), deg: g.mult.deg + g.inner[0].deg },
  ...g.inner.slice(1),
];

/** Multiplied only the last term: 3(x + 4) as x + 12. */
const lastOnly = (g: Group): Term[] => [
  ...g.inner.slice(0, -1),
  { coef: mul(g.mult.coef, g.inner[g.inner.length - 1].coef), deg: g.mult.deg + g.inner[g.inner.length - 1].deg },
];

/** The minus reached only the first term: -4(2x - 3) as -8x - 12. */
const signOnFirstOnly = (g: Group): Term[] =>
  g.inner.map((t, i) => ({
    coef: mul(i === 0 ? g.mult.coef : abs(g.mult.coef), t.coef),
    deg: g.mult.deg + t.deg,
  }));

/** Dropped the minus altogether: -4(2x - 3) as 8x - 12. */
const droppedSign = (g: Group): Term[] => expand({ mult: { ...g.mult, coef: abs(g.mult.coef) }, inner: g.inner });

/** Added the multiplier to the constant instead of multiplying: 3(x + 4) as 3x + 7. */
const addedToConstant = (g: Group): Term[] =>
  g.inner.map((t) =>
    t.deg === 0 && g.mult.deg === 0 && isInt(g.mult.coef)
      ? { coef: add(t.coef, g.mult.coef), deg: 0 }
      : { coef: mul(g.mult.coef, t.coef), deg: g.mult.deg + t.deg },
  );

/** Multiplied by the flipped fraction: \frac{1}{2}(4x - 6) as 8x - 12. */
const flippedFraction = (g: Group): Term[] =>
  expand({ mult: { ...g.mult, coef: rat(g.mult.coef.d * Math.sign(g.mult.coef.n), Math.abs(g.mult.coef.n)) }, inner: g.inner });

/** x \cdot 2x taken as 2x (the powers not added): x(2x + 3) as 2x + 3x. */
const powersNotAdded = (g: Group): Term[] =>
  g.inner.map((t) => ({ coef: mul(g.mult.coef, t.coef), deg: Math.max(g.mult.deg, t.deg) }));

/** The variable multiplied into the variable terms only: 3x(2x + 5) as 6x^2 + 15. */
const variableNotOnConstant = (g: Group): Term[] =>
  g.inner.map((t) => ({ coef: mul(g.mult.coef, t.coef), deg: t.deg === 0 ? 0 : g.mult.deg + t.deg }));

/**
 * Mistake-based Distractors, most common first: only the first term
 * multiplied (or only the last), a negative multiplier's sign reaching only the first term (or
 * dropped), the multiplier added to the constant, a fraction multiplier
 * flipped, powers of the variable not added, and the variable left off the
 * constant.
 */
export function distractors(k: DistributiveConstruction): string[] {
  const wrongs: ((g: Group) => Term[])[] = [firstOnly];
  const negativeGroup = k.group.mult.coef.n < 0 || (k.extra && isGroup(k.extra.part) && k.extra.part.mult.coef.n < 0);
  if (negativeGroup) wrongs.unshift(signOnFirstOnly);
  if (negativeGroup) wrongs.push(droppedSign);
  if (k.group.mult.deg === 1) wrongs.push(powersNotAdded, variableNotOnConstant);
  if (!isInt(k.group.mult.coef)) wrongs.push(flippedFraction);
  wrongs.push(addedToConstant, lastOnly);
  const candidates = wrongs.map((w) => withGroupMistake(k, w)).filter((ts) => ts.some((t) => t.coef.n !== 0));
  // the opposite of every term (a sign slip throughout), when signs are in play
  if (promptLatex(k).includes("-")) candidates.push(k.answer.map((t) => ({ ...t, coef: neg(t.coef) })));
  return distinctHints(
    answerLatex(k),
    candidates.map((ts) => answerLatex(k, ts)),
  );
}

export const generator: Generator = {
  id: DISTRIBUTIVE_PROPERTY_ID,
  title: "The distributive property",
  defaultDirections: "Simplify each expression.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: DISTRIBUTIVE_PROPERTY_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
