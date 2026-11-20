// "Dividing radicals": quotients and rationalizing the denominator.
// One-term denominators: \frac{6}{\sqrt{8}} = \frac{3\sqrt{2}}{2},
// \frac{\sqrt{15}}{\sqrt{6}} = \frac{\sqrt{10}}{2}, \sqrt{\frac{3}{5}} =
// \frac{\sqrt{15}}{5}. Binomial denominators use the conjugate:
// \frac{4}{3 - \sqrt{5}} = 3 + \sqrt{5}. Opt-in cube roots
// (\frac{5}{\sqrt[3]{2}} = \frac{5\sqrt[3]{4}}{2}) and variables (assumed
// positive) for one-term denominators.
//
// Built ANSWER-FROM-CONSTRUCTION: the numerator and the denominator's pieces
// are chosen, and the Answer is the chosen numerator times the rationalizing
// factor (root(R^(n-1)), or the conjugate a - b\sqrt{r}) over the whole number
// it makes of the denominator, reduced by common factors. Denominators that
// would come out zero or unwieldy are redrawn. Nothing is ever solved.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import {
  cubeRootsField,
  distinctValued,
  fractionLatex,
  isRational,
  mono,
  monoMul,
  monoPow,
  mulSums,
  negTerm,
  pickIndex,
  rationalizeBinomial,
  rationalizeMonomial,
  reduceFraction,
  simplifyTerm,
  sumLatex,
  term,
  termLatex,
  valuedFraction,
  variablesField,
  type RadFraction,
  type RadTerm,
  type RootIndex,
} from "./radicalKit";

export const DIVIDING_RADICALS_ID = "dividing-radicals";

export type FormMode = "mixed" | "monomial" | "binomial";
export type Kind = "number" | "quotient" | "rootOfFraction" | "conjugate";

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Denominators",
    default: "mixed",
    options: [
      { value: "mixed", label: "Mixed" },
      { value: "monomial", label: "One term, like 6/√8" },
      { value: "binomial", label: "Two terms (conjugates), like 4/(3 − √5)" },
    ],
  },
  { ...cubeRootsField, label: "Include cube roots (one-term denominators)" },
  { ...variablesField, label: "Include variables (one-term denominators, assumed positive)" },
] as const satisfies ParamSchema;

export interface DivideConstruction {
  kind: Kind;
  index: RootIndex;
  num: RadTerm[];
  /** a one-term denominator */
  den: RadTerm | null;
  /** a binomial denominator a + b\sqrt{r}, printed with the radical first when `radicalFirst` */
  bin: { a: number; b: number; r: number; radicalFirst: boolean } | null;
}

const SQUARE = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15] as const;
const SQUARE_UNSIMPLIFIED = [8, 12, 18, 20, 27, 32, 50] as const;
const CUBE = [2, 3, 4, 5, 6, 9, 10] as const;

function denRadicand(rng: Rng, index: RootIndex, variables: boolean) {
  const n = index === 2 ? (rng.bool(0.3) ? rng.pick(SQUARE_UNSIMPLIFIED) : rng.pick(SQUARE)) : rng.pick(CUBE);
  return mono(n, variables && rng.bool(0.7) ? [["x", rng.int(1, index === 2 ? 3 : 2)]] : []);
}

function monomial(rng: Rng, index: RootIndex, variables: boolean): DivideConstruction | null {
  const roll = rng.next();
  const R = denRadicand(rng, index, variables);
  if (roll < 0.45 || (index === 3 && roll < 0.7)) {
    const c = rng.bool(0.6) ? 1 : rng.int(2, 4);
    const k = rng.int(1, 12) * (rng.bool(0.25) ? -1 : 1);
    return { kind: "number", index, num: [term(k)], den: term(c, index, R), bin: null };
  }
  const P = mono(index === 2 ? rng.pick([...SQUARE, ...SQUARE_UNSIMPLIFIED]) : rng.pick(CUBE), variables && rng.bool(0.6) ? [["x", rng.int(1, 4)]] : []);
  if (P.n === R.n) return null;
  const a = rng.bool(0.65) ? 1 : rng.int(2, 5);
  if (index === 2 && R.vars.length === 0 && P.vars.length === 0 && a === 1 && rng.bool(0.35)) {
    if (P.n % R.n === 0 || R.n % P.n === 0) return null; // \sqrt{\frac{8}{2}} is no fraction
    return { kind: "rootOfFraction", index, num: [term(1, 2, P)], den: term(1, 2, R), bin: null };
  }
  return { kind: "quotient", index, num: [term(a, index, P)], den: term(1, index, R), bin: null };
}

function binomial(rng: Rng): DivideConstruction | null {
  // a > 0: a denominator like -3 - \sqrt{10} would be written -(3 + \sqrt{10})
  const a = rng.int(1, 7);
  const b = rng.bool(0.6) ? (rng.bool(0.5) ? 1 : -1) : rng.int(2, 3) * (rng.bool(0.5) ? 1 : -1);
  const r = rng.pick(SQUARE.slice(0, 8));
  const d = a * a - b * b * r;
  if (d === 0 || Math.abs(d) > 40) return null;
  const num = rng.bool(0.65)
    ? [term(rng.int(1, 12) * (rng.bool(0.2) ? -1 : 1))]
    : [term(rng.bool(0.6) ? 1 : rng.int(2, 3), 2, rng.pick(SQUARE.slice(0, 6)))];
  const radicalFirst = b > 0 && rng.bool(0.35);
  return { kind: "conjugate", index: 2, num, den: null, bin: { a, b, r, radicalFirst } };
}

export function construct(params: ParamValues, rng: Rng): DivideConstruction {
  const p = resolveParams(schema, params);
  const mode = p.form as FormMode;
  for (;;) {
    const form = mode === "mixed" ? (rng.bool(0.5) ? "monomial" : "binomial") : mode;
    const k = form === "monomial" ? monomial(rng, pickIndex(rng, p.cubeRoots as boolean), p.variables as boolean) : binomial(rng);
    if (!k) continue;
    const answer = answerFraction(k);
    // the Answer must be a real step away from the Problem: no 1-term
    // denominator that is already a whole number
    if (k.den && isRational(simplifyTerm(k.den))) continue;
    if (answer.num.length === 0) continue;
    return k;
  }
}

export function answerFraction(k: DivideConstruction): RadFraction {
  if (k.bin) return rationalizeBinomial(k.num, k.bin.a, k.bin.b, k.bin.r);
  return rationalizeMonomial(k.num, k.den!);
}

function binLatex(bin: NonNullable<DivideConstruction["bin"]>): string {
  const terms = [term(bin.a), term(bin.b, 2, bin.r)];
  return sumLatex(bin.radicalFirst ? terms.reverse() : terms);
}

export function promptLatex(k: DivideConstruction): string {
  if (k.kind === "rootOfFraction") return `\\sqrt{\\frac{${k.num[0].rad.n}}{${k.den!.rad.n}}}`;
  const top = sumLatex(k.num);
  const bottom = k.bin ? binLatex(k.bin) : termLatex(k.den!);
  if (top.startsWith("-")) return `-\\frac{${top.slice(1)}}{${bottom}}`;
  return `\\frac{${top}}{${bottom}}`;
}

export const answerLatex = (k: DivideConstruction) => fractionLatex(answerFraction(k));

const frac = (num: RadTerm[], den: number | ReturnType<typeof mono>): RadFraction =>
  reduceFraction({ num, den: typeof den === "number" ? mono(den) : den });

/**
 * Mistake-based Distractors, each a wrong value:
 * - one-term denominators: rationalized the bottom but not the top
 *   (\frac{6}{\sqrt{2}} as \frac{6}{2}); \sqrt{R} \cdot \sqrt{R} read as R^2;
 *   dropped the new denominator (6\sqrt{2}); for a cube root, multiplied by
 *   \sqrt[3]{R} once and called the bottom R; for \sqrt{\frac{p}{q}}, took the
 *   root of the top only;
 * - conjugates: a^2 + b^2 r for the bottom (sign slip); b not squared, or a
 *   not squared; multiplied the top by the denominator itself rather than its
 *   conjugate; the top left alone.
 */
export function distractors(k: DivideConstruction): string[] {
  const answer = answerFraction(k);
  const c: (RadFraction | null)[] = [];
  if (k.bin) {
    const { a, b, r } = k.bin;
    const conj = mulSums(k.num, [term(a), term(-b, 2, r)]);
    const same = mulSums(k.num, [term(a), term(b, 2, r)]);
    c.push(frac(conj, a * a + b * b * r));
    if (Math.abs(b) !== 1) c.push(frac(conj, a * a - Math.abs(b) * r));
    if (Math.abs(a) !== 1) c.push(frac(conj, Math.abs(a) - b * b * r));
    if (a * a - b * b * r !== 0) {
      c.push(frac(same, a * a - b * b * r));
      c.push(frac([...k.num], a * a - b * b * r));
    }
  } else {
    const d = simplifyTerm(k.den!);
    const n = k.index;
    const R = d.rad;
    const by = term(1, n, monoPow(R, n - 1));
    const top = mulSums(k.num, [by]);
    const bottom = monoMul(d.coef, R);
    c.push(frac([...k.num], bottom));
    c.push(frac(top, monoMul(bottom, R)));
    c.push(frac(top, d.coef));
    if (n === 3) c.push(frac(mulSums(k.num, [term(1, 3, R)]), bottom));
    if (k.kind === "rootOfFraction") c.push(frac([term(1, 2, k.num[0].rad)], k.den!.rad));
  }
  c.push({ num: answer.num.map(negTerm), den: answer.den });
  return distinctValued(
    valuedFraction(answer),
    c.filter((f): f is RadFraction => !!f && f.num.length > 0).map(valuedFraction),
  ).slice(0, 6);
}

export const generator: Generator = {
  id: DIVIDING_RADICALS_ID,
  title: "Dividing radicals and rationalizing",
  defaultDirections: "Simplify. Leave no radical in a denominator.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: DIVIDING_RADICALS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
