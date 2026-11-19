// "Finding terms of sequences": list the first terms of a sequence, or find
// one given term, from an explicit rule (a_n = 4n - 1, a_n = 3 \cdot 2^{n-1},
// a_n = \frac{n}{n + 2}, ...) or a recursive one (a_1 = 3, a_n = 2a_{n-1} - 1).
//
// Built ANSWER-FROM-CONSTRUCTION: the rule is chosen first and the Answer is
// read off by evaluating it forwards; nothing is solved. Each rule also
// carries the sequences students produce by its common mistakes, which become
// the Distractors.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { nonzeroInt } from "./equationKit";
import {
  add,
  distinctHints,
  geometricLatex,
  linearLatex,
  listLatex,
  mul,
  neg,
  numLatex,
  pow,
  powerLatex,
  rat,
  size,
  termName,
  type Rat,
} from "./sequenceKit";

export const GENERAL_SEQUENCES_ID = "general-sequences";

export type RuleKind = "explicit" | "recursive";
export type Ask = "firstTerms" | "term";

export const schema = [
  {
    type: "enum",
    key: "rule",
    label: "Rules",
    default: "mixed",
    options: [
      { value: "explicit", label: "Explicit (a_n = 4n - 1)" },
      { value: "recursive", label: "Recursive (a_n = 2a_(n-1) + 1)" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "enum",
    key: "ask",
    label: "Find",
    default: "firstTerms",
    options: [
      { value: "firstTerms", label: "The first few terms" },
      { value: "term", label: "One given term" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative numbers and alternating signs",
    default: true,
  },
] as const satisfies ParamSchema;

/** A sequence by index; null where it is undefined (a zero denominator). */
export type Seq = (n: number) => Rat | null;

/** The structured construction. Exposed for property tests. */
export interface SequenceConstruction {
  rule: RuleKind;
  /** which family of rule, e.g. "linear", "affine" */
  form: string;
  /** the printed rule, e.g. "a_n = 4n - 1" or "a_1 = 3,\ a_n = 2a_{n-1} - 1" */
  ruleLatex: string;
  seq: Seq;
  /** sequences a common mistake produces, most common first */
  mistakes: Seq[];
  ask: Ask;
  /** how many terms are asked for (firstTerms) */
  count: number;
  /** which term is asked for (term) */
  k: number;
}

/** Largest printed number (numerator or denominator) in a prompt or Answer. */
export const MAX_PRINTED = 999;

// ------------------------------------------------------------------ rules

interface Rule {
  form: string;
  ruleLatex: string;
  seq: Seq;
  mistakes: Seq[];
}

/** A recursive sequence from its starting terms and a step, memoised. */
function recursive(start: Rat[], step: (prev: Rat[], n: number) => Rat): Seq {
  const terms = [...start];
  return (n) => {
    if (n < 1) return null;
    while (terms.length < n) terms.push(step(terms, terms.length + 1));
    return terms[n - 1];
  };
}

const r = (n: number) => rat(n);

function explicitRule(rng: Rng, negOk: boolean): Rule {
  const forms = ["linear", "quadratic", "exponential", "powerPlus", "rational"];
  if (negOk) forms.push("alternating");
  const form = rng.pick(forms);
  switch (form) {
    case "linear": {
      const p = nonzeroInt(rng, 2, 6, negOk);
      const q = nonzeroInt(rng, 1, 9, true);
      return {
        form,
        ruleLatex: `a_n = ${linearLatex([{ coef: r(p), v: "n" }, { coef: r(q), v: "" }])}`,
        seq: (n) => r(p * n + q),
        // the coefficient and constant swapped; the constant multiplied in
        mistakes: [(n) => r(q * n + p), (n) => r(p * (n + q))],
      };
    }
    case "quadratic": {
      const p = nonzeroInt(rng, 1, 3, negOk);
      const q = nonzeroInt(rng, 1, 9, true);
      const mistakes: Seq[] = [(n) => r(2 * p * n + q)]; // doubled instead of squared
      if (Math.abs(p) !== 1) mistakes.push((n) => r(p * p * n * n + q)); // squared the coefficient too
      return {
        form,
        ruleLatex: `a_n = ${linearLatex([{ coef: r(p), v: "n^2" }, { coef: r(q), v: "" }])}`,
        seq: (n) => r(p * n * n + q),
        mistakes,
      };
    }
    case "exponential": {
      const c = rng.int(2, 5);
      const base = negOk && rng.bool(0.3) ? -2 : rng.pick([2, 3]);
      return {
        form,
        ruleLatex: `a_n = ${geometricLatex(r(c), r(base), "n-1")}`,
        seq: (n) => mul(r(c), pow(r(base), n - 1)),
        mistakes: [
          (n) => pow(r(c * base), n - 1), // multiplied before the power
          (n) => mul(r(c), pow(r(base), n)), // exponent n, not n - 1
        ],
      };
    }
    case "powerPlus": {
      const base = rng.pick([2, 3]);
      const q = nonzeroInt(rng, 1, 9, true);
      return {
        form,
        ruleLatex: `a_n = ${powerLatex(r(base), "n")} ${q < 0 ? "-" : "+"} ${Math.abs(q)}`,
        seq: (n) => r(base ** n + q),
        mistakes: [
          (n) => r(base * n + q), // multiplied instead of a power
          (n) => r(base ** (n - 1) + q), // exponent n - 1
        ],
      };
    }
    case "rational": {
      // (n + q)/(n + s) or (n + q)/(pn)
      const q = rng.int(0, 4);
      const overN = q > 0 && rng.bool(0.4);
      const p = rng.int(2, 4);
      let s = rng.int(1, 5);
      if (s === q) s = q === 5 ? 4 : s + 1;
      const den = (n: number) => (overN ? p * n : n + s);
      const numLat = linearLatex([{ coef: r(1), v: "n" }, { coef: r(q), v: "" }]);
      const denLat = overN ? `${p}n` : linearLatex([{ coef: r(1), v: "n" }, { coef: r(s), v: "" }]);
      return {
        form,
        ruleLatex: `a_n = \\frac{${numLat}}{${denLat}}`,
        seq: (n) => (den(n) === 0 ? null : rat(n + q, den(n))),
        mistakes: [
          (n) => (n + q === 0 ? null : rat(den(n), n + q)), // numerator and denominator swapped
          (n) => (den(n + 1) === 0 ? null : rat(n + q, den(n + 1))), // denominator one step ahead
        ],
      };
    }
    default: {
      // alternating: (-1)^{n}(pn + q) or (-1)^{n+1} n^2
      const plusOne = rng.bool();
      const sign = (n: number) => ((plusOne ? n + 1 : n) % 2 === 0 ? 1 : -1);
      const squared = rng.bool(0.3);
      const p = rng.int(1, 4);
      const q = nonzeroInt(rng, 1, 5, true);
      const body = (n: number) => (squared ? n * n : p * n + q);
      const bodyLat = squared ? " n^2" : `(${linearLatex([{ coef: r(p), v: "n" }, { coef: r(q), v: "" }])})`;
      return {
        form: "alternating",
        ruleLatex: `a_n = (-1)^{${plusOne ? "n+1" : "n"}}${bodyLat}`,
        seq: (n) => r(sign(n) * body(n)),
        mistakes: [
          (n) => r(-sign(n) * body(n)), // the sign pattern the wrong way round
          (n) => r(body(n)), // the sign factor ignored
        ],
      };
    }
  }
}

function recursiveRule(rng: Rng, negOk: boolean): Rule {
  const forms = ["affine", "affine", "addN", "timesN", "twoTerm"];
  const form = rng.pick(forms);
  const prev = "a_{n-1}";
  switch (form) {
    case "affine": {
      const c = nonzeroInt(rng, 1, 9, negOk);
      const p = rng.pick(negOk ? [1, 2, 2, 3, -2, -1] : [1, 2, 2, 3]);
      const q = nonzeroInt(rng, 1, 9, true);
      const mistakes: Seq[] = [
        recursive([r(c)], (_t, n) => r(p * n + q)), // n used in place of a_{n-1}
        recursive([r(c)], () => r(p * c + q)), // a_1 used every time
      ];
      if (p !== 1) mistakes.unshift(recursive([r(c)], (t) => mul(r(p), add(t[t.length - 1], r(q))))); // added first
      return {
        form,
        ruleLatex: `a_1 = ${c},\\ a_n = ${linearLatex([{ coef: r(p), v: prev }, { coef: r(q), v: "" }])}`,
        seq: recursive([r(c)], (t) => r(p * t[t.length - 1].n + q)),
        mistakes,
      };
    }
    case "addN": {
      const c = nonzeroInt(rng, 1, 9, negOk);
      const p = nonzeroInt(rng, 1, 3, negOk);
      return {
        form,
        ruleLatex: `a_1 = ${c},\\ a_n = ${linearLatex([{ coef: r(1), v: prev }, { coef: r(p), v: "n" }])}`,
        seq: recursive([r(c)], (t, n) => r(t[t.length - 1].n + p * n)),
        mistakes: [
          recursive([r(c)], (t, n) => r(t[t.length - 1].n + p * (n - 1))), // n - 1 for n
          recursive([r(c)], (t) => r(t[t.length - 1].n + p)), // n left out
        ],
      };
    }
    case "timesN": {
      const c = nonzeroInt(rng, 1, 3, negOk);
      return {
        form,
        ruleLatex: `a_1 = ${c},\\ a_n = n \\cdot ${prev}`,
        seq: recursive([r(c)], (t, n) => r(n * t[t.length - 1].n)),
        mistakes: [
          recursive([r(c)], (t, n) => r((n - 1) * t[t.length - 1].n)), // n - 1 for n
          recursive([r(c)], (t, n) => r(n + t[t.length - 1].n)), // added instead of multiplied
        ],
      };
    }
    default: {
      // a_n = u a_{n-1} + w a_{n-2}
      const [u, w] = rng.pick(negOk ? [[1, 1], [1, 2], [2, 1], [1, -1], [-1, 1], [1, 1]] : [[1, 1], [1, 2], [2, 1], [1, 1]]);
      const c1 = nonzeroInt(rng, 1, 5, negOk);
      const c2 = nonzeroInt(rng, 1, 5, negOk);
      const step = (uu: number, ww: number) => (t: Rat[]) => r(uu * t[t.length - 1].n + ww * t[t.length - 2].n);
      const mistakes: Seq[] = [];
      if (u !== w) mistakes.push(recursive([r(c1), r(c2)], step(w, u))); // the two terms swapped
      mistakes.push(recursive([r(c1), r(c2)], (t) => r((u + w) * t[t.length - 1].n))); // a_{n-1} used twice
      return {
        form: "twoTerm",
        ruleLatex: `a_1 = ${c1},\\ a_2 = ${c2},\\ a_n = ${linearLatex([
          { coef: r(u), v: prev },
          { coef: r(w), v: "a_{n-2}" },
        ])}`,
        seq: recursive([r(c1), r(c2)], step(u, w)),
        mistakes,
      };
    }
  }
}

// ------------------------------------------------------------------ construct

const printable = (x: Rat | null): x is Rat => x !== null && size(x) <= MAX_PRINTED;

function indices(k: SequenceConstruction): number[] {
  return k.ask === "term" ? [k.k] : Array.from({ length: k.count }, (_, i) => i + 1);
}

/** Whether every printed number is modest (and positive when negatives are off). */
function acceptable(k: SequenceConstruction, negOk: boolean): boolean {
  const shown = k.ask === "term" ? [k.k] : indices(k);
  for (const i of shown) {
    const v = k.seq(i);
    if (!printable(v)) return false;
    if (!negOk && v.n <= 0) return false;
  }
  return true;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): SequenceConstruction {
  const p = resolveParams(schema, params);
  const negOk = p.allowNegatives as boolean;
  const ruleKinds: RuleKind[] = p.rule === "mixed" ? ["explicit", "recursive"] : [p.rule as RuleKind];
  const asks: Ask[] = p.ask === "mixed" ? ["firstTerms", "term"] : [p.ask as Ask];

  for (let attempt = 0; ; attempt++) {
    const rule = rng.pick(ruleKinds);
    const ask = rng.pick(asks);
    const made = attempt < 60 ? (rule === "explicit" ? explicitRule(rng, negOk) : recursiveRule(rng, negOk)) : null;
    // A safe fallback after many rejections: a small linear or affine rule.
    const chosen: Rule =
      made ??
      (rule === "explicit"
        ? { form: "linear", ruleLatex: "a_n = 3n + 2", seq: (n) => r(3 * n + 2), mistakes: [(n) => r(2 * n + 3), (n) => r(3 * (n + 2))] }
        : {
            form: "affine",
            ruleLatex: "a_1 = 2,\\ a_n = 2a_{n-1} + 1",
            seq: recursive([r(2)], (t) => r(2 * t[t.length - 1].n + 1)),
            mistakes: [recursive([r(2)], (t) => mul(r(2), add(t[t.length - 1], r(1)))), recursive([r(2)], (_t, n) => r(2 * n + 1))],
          });
    const count = chosen.form === "twoTerm" ? 5 : 4;
    const k = rule === "recursive" ? rng.int(chosen.form === "twoTerm" ? 6 : 5, chosen.form === "twoTerm" ? 7 : 6) : rng.int(5, 12);
    const out: SequenceConstruction = { rule, ...chosen, ask, count, k };
    if (!made) return out;
    // a term too far along to stay modest: ask for an earlier one instead
    while (out.ask === "term" && out.k > 4 && !acceptable(out, negOk)) out.k--;
    if (acceptable(out, negOk)) return out;
  }
}

// ------------------------------------------------------------------ render

export function promptLatex(k: SequenceConstruction): string {
  const ask = k.ask === "term" ? `\\text{find } ${termName(k.k)}` : `\\text{first ${k.count} terms}`;
  return `${k.ruleLatex};\\quad ${ask}`;
}

export function answerLatex(k: SequenceConstruction): string {
  return k.ask === "term" ? numLatex(k.seq(k.k)!) : listLatex(indices(k).map((i) => k.seq(i)!));
}

/** The values a sequence gives at these indices, or null if any is unprintable. */
function valuesAt(s: Seq, at: number[]): Rat[] | null {
  const out: Rat[] = [];
  for (const i of at) {
    const v = s(i);
    if (v === null || size(v) > 9999) return null;
    out.push(v);
  }
  return out;
}

/**
 * Mistake-based Distractors, most common first: the rule's own mistakes (a
 * coefficient and constant swapped, doubled instead of squared, multiplied
 * before the power, n used for a_{n-1}, ...), then the right rule at the wrong
 * index: the list started at a_0 (explicit) or a_2, or the term before or
 * after the one asked for.
 */
export function distractors(k: SequenceConstruction): string[] {
  const at = indices(k);
  const shift = (d: number) => at.map((i) => i + d);
  const candidates: (Rat[] | null)[] = k.mistakes.map((m) => valuesAt(m, at));
  if (k.ask === "term") candidates.push(valuesAt(k.seq, shift(-1)), valuesAt(k.seq, shift(1)));
  else {
    if (k.rule === "explicit") candidates.push(valuesAt(k.seq, shift(-1)));
    candidates.push(valuesAt(k.seq, shift(1)));
  }
  // a sign slip on the whole answer, last, where signs are in play
  if (at.some((i) => k.seq(i)!.n < 0)) candidates.push(valuesAt((n) => {
    const v = k.seq(n);
    return v && neg(v);
  }, at));
  return distinctHints(
    answerLatex(k),
    candidates.map((c) => (c ? (k.ask === "term" ? numLatex(c[0]) : listLatex(c)) : null)),
  );
}

export const generator: Generator = {
  id: GENERAL_SEQUENCES_ID,
  title: "Finding terms of sequences",
  defaultDirections: "Find the indicated terms of each sequence.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: GENERAL_SEQUENCES_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
