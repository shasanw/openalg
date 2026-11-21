// "Finding terms of sequences": list the first terms of a sequence, or find
// one given term, from an explicit rule (a_n = 4n - 1, a_n = 3 \cdot 2^{n-1},
// a_n = \frac{n}{n + 2}, ...) or a recursive one (a_1 = 3, a_n = 2a_{n-1} - 1).
//
// Built ANSWER-FROM-CONSTRUCTION: the rule is chosen first and the Answer is
// read off by evaluating it forwards; nothing is solved. Each rule also
// carries the sequences students produce by its common mistakes, which become
// the Distractors.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { nonzeroInt } from "../shared/equationKit";
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
  sub,
  rat,
  ratEq,
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
  /** further mistakes, offered after every other Distractor so earlier choices never change */
  moreMistakes: Seq[];
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
  moreMistakes: Seq[];
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
        moreMistakes: [
          (n) => r((p + q) * n), // like terms combined: the constant added to the coefficient
          (n) => r(p * n - q), // the constant's sign flipped
          (n) => r(p * n * q), // the constant multiplied in, not added
        ],
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
        moreMistakes: [
          (n) => r(p * (n * n + q)), // the coefficient distributed over the constant too
          (n) => r(p * n * n - q), // the constant's sign flipped
          (n) => r(p * n + q), // n^2 read as n
          (n) => r((p * n + q) * (p * n + q)), // the whole expression squared
        ],
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
        moreMistakes: [
          (n) => r(c * base * (n - 1)), // multiplied by n - 1 instead of raised to it
          (n) => mul(r(base), pow(r(c), n - 1)), // coefficient and base swapped
          (n) => n < 2 ? null : mul(r(c), pow(r(base), n - 2)), // exponent n - 2
          (n) => pow(r(base), n - 1), // initial multiplier omitted
          (n) => sub(mul(r(c), pow(r(base), n)), r(1)), // subtract 1 after exponentiating
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
        moreMistakes: [
          (n) => r(n ** base + q), // base and exponent swapped
          (n) => r(base ** n - q), // the constant's sign flipped
          (n) => r(base ** (n + 1) + q), // exponent n + 1
          (n) => r((base + q) ** n), // the constant added to the base
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
        moreMistakes: [
          (n) => (den(n) === 0 ? null : add(r(n), rat(q, den(n)))), // only the constant divided
          () => (overN ? rat(1 + q, p) : rat(q, s)), // the n's cancelled across a sum
          (n) => (den(n - 1) === 0 ? null : rat(n - 1 + q, den(n - 1))), // started at n = 0
          (n) => (den(n) === 0 ? null : rat(n, den(n))), // the constant in the numerator dropped
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
        moreMistakes: squared
          ? [
              (n) => r(-body(n)), // (-1)^n read as -1
              (n) => r(sign(n) * n), // n^2 read as n
              (n) => r(sign(n) * body(n + 1)), // body evaluated one index ahead
              (n) => r(sign(n) * 2 * n), // n^2 read as 2n
            ]
          : [
              (n) => r(sign(n) * p * n + q), // the sign applied to the first term only
              (n) => r(p * n + sign(n) * q), // the sign applied to the last term only
              (n) => r(-body(n)), // (-1)^n read as -1
              (n) => r(sign(n) * body(n + 1)), // body evaluated one index ahead
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
      const p = rng.pick(negOk ? [1, 2, 2, 3, -2] : [1, 2, 2, 3]);
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
        moreMistakes: [
          recursive([r(c)], (t) => r(p * t[t.length - 1].n - q)), // the constant's sign flipped
          recursive([r(c)], (t) => r(p * q * t[t.length - 1].n)), // multiplied by the constant, not added
          recursive([r(c)], (t) => r((p + q) * t[t.length - 1].n)), // the constant added to the multiplier
          recursive([r(c)], (t, n) => r(p * t[t.length - 1].n + q * n)), // the constant grows with n
        ],
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
        moreMistakes: [
          recursive([r(c)], (_t, n) => r(c + p * n)), // every term built from a_1, not the one before
          recursive([r(c)], (t, n) => r(t[t.length - 1].n + p * (n + 1))), // n + 1 for n
          recursive([r(c)], (t, n) => r(t[t.length - 1].n - p * n)), // the added term's sign flipped
          recursive([r(c)], (t, n) => r(p * n * t[t.length - 1].n)), // multiplied instead of added
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
        moreMistakes: [
          recursive([r(c)], (_t, n) => r(c * n)), // every term built from a_1, not the one before
          recursive([r(c)], (t, n) => r((n + 1) * t[t.length - 1].n)), // n + 1 for n
          recursive([r(c)], (_t, n) => r(n * (n - 1))), // n used in place of a_{n-1}
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
      const moreMistakes: Seq[] = [
        recursive([r(c1), r(c2)], (t) => r(u * t[t.length - 1].n - w * t[t.length - 2].n)), // the second term subtracted
        recursive([r(c1), r(c2)], (t) => r(t[t.length - 1].n * t[t.length - 2].n)), // the two terms multiplied
        recursive([r(c1), r(c2)], (t) => r((u + w) * t[t.length - 2].n)), // a_{n-2} used twice
        recursive([r(c1), r(c2)], (t) => r(t[t.length - 1].n + t[t.length - 2].n)), // the coefficients ignored
        recursive([r(c1), r(c2)], (_t, n) => r(u * (n - 1) + w * (n - 2))), // use the indices as terms
        recursive([r(c1), r(c2)], (t, n) => r(u * t[t.length - 1].n + w * (n - 2))), // read a_{n-2} as n - 2
      ];
      return {
        form: "twoTerm",
        ruleLatex: `a_1 = ${c1},\\ a_2 = ${c2},\\ a_n = ${linearLatex([
          { coef: r(u), v: prev },
          { coef: r(w), v: "a_{n-2}" },
        ])}`,
        seq: recursive([r(c1), r(c2)], step(u, w)),
        mistakes,
        moreMistakes,
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
  // not a constant sequence (a recursive rule started at its fixed point)
  const opening = [1, 2, 3, 4, 5].map((i) => k.seq(i));
  return opening.some((v) => v && opening[0] && !ratEq(v, opening[0]));
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
        ? { form: "linear", ruleLatex: "a_n = 3n + 2", seq: (n) => r(3 * n + 2), mistakes: [(n) => r(2 * n + 3), (n) => r(3 * (n + 2))],
          moreMistakes: [(n) => r(5 * n), (n) => r(3 * n - 2), (n) => r(6 * n)],
        }
        : {
            form: "affine",
            ruleLatex: "a_1 = 2,\\ a_n = 2a_{n-1} + 1",
            seq: recursive([r(2)], (t) => r(2 * t[t.length - 1].n + 1)),
            mistakes: [recursive([r(2)], (t) => mul(r(2), add(t[t.length - 1], r(1)))), recursive([r(2)], (_t, n) => r(2 * n + 1))],
            moreMistakes: [recursive([r(2)], (t) => r(2 * t[t.length - 1].n - 1)), recursive([r(2)], (t) => r(2 * t[t.length - 1].n)), recursive([r(2)], (t) => r(3 * t[t.length - 1].n))],
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
  for (const m of k.moreMistakes) candidates.push(valuesAt(m, at));
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
