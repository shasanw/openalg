// "Classifying real numbers": name every set of numbers a number belongs to
// (natural, whole, integer, rational, irrational), e.g. -\sqrt{16} is an
// integer and rational. Every number on the sheet is real, so "real" is not
// listed (a five-set choice would also not fit a multiple-choice column).
//
// Built ANSWER-FIRST: the narrowest set is chosen (natural, zero, negative
// integer, non-integer rational or irrational), then a number of that kind is
// written in one of several forms, some of them in disguise: \frac{12}{3} and
// \sqrt{49} are natural numbers, 0.\overline{36} is rational, \sqrt{20} is
// not. The Answer is the chain of sets above the chosen kind.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { distinctHints, numLatex, rat } from "./equationKit";
import { mixedLatex } from "./rationalKit";

export const CLASSIFYING_NUMBERS_ID = "classifying-numbers";

export const schema = [
  {
    type: "boolean",
    key: "includeNatural",
    label: "Use natural numbers (otherwise start at whole numbers)",
    default: true,
  },
  {
    type: "boolean",
    key: "includeRoots",
    label: "Include square roots",
    default: true,
  },
  {
    type: "boolean",
    key: "disguised",
    label: "Include integers written as fractions or roots",
    default: true,
  },
] as const satisfies ParamSchema;

export type NumberSet = "natural" | "whole" | "integer" | "rational" | "irrational";

/** The narrowest set a number belongs to. */
export type Kind = "natural" | "zero" | "negative" | "rational" | "irrational";

/** Every set a number of each kind belongs to (before the options drop natural). */
const SETS: Record<Kind, NumberSet[]> = {
  natural: ["natural", "whole", "integer", "rational"],
  zero: ["whole", "integer", "rational"],
  negative: ["integer", "rational"],
  rational: ["rational"],
  irrational: ["irrational"],
};

/** How the number is written, which decides the likely mistakes. */
export type Form = "plain" | "fraction" | "root" | "mixed" | "decimal" | "repeating" | "pi" | "pattern";

/** The structured construction. Exposed for property tests. */
export interface ClassifyConstruction {
  kind: Kind;
  form: Form;
  /** the printed number */
  latex: string;
  /** the exact value when rational (n / d), for tests */
  value: { n: number; d: number } | null;
  includeNatural: boolean;
}

const KIND_WEIGHTS: [Kind, number][] = [
  ["natural", 22],
  ["zero", 5],
  ["negative", 18],
  ["rational", 32],
  ["irrational", 23],
];

function pickKind(rng: Rng): Kind {
  let r = rng.int(1, KIND_WEIGHTS.reduce((s, [, w]) => s + w, 0));
  for (const [k, w] of KIND_WEIGHTS) {
    r -= w;
    if (r <= 0) return k;
  }
  return "rational";
}

const NON_SQUARES = Array.from({ length: 98 }, (_, i) => i + 2).filter((n) => !Number.isInteger(Math.sqrt(n)));

/** A repeating block that never reads as a terminating decimal (no all-9 or all-0 blocks). */
function repeatingLatex(rng: Rng, negative: boolean): { latex: string; value: { n: number; d: number } } {
  const whole = rng.int(0, 9);
  const len = rng.pick([1, 2]);
  let block: number;
  do block = rng.int(1, len === 1 ? 8 : 98);
  while (len === 2 && block % 11 === 0);
  const digits = String(block).padStart(len, "0");
  const r = rat(whole * (10 ** len - 1) + block, 10 ** len - 1);
  return {
    latex: `${negative ? "-" : ""}${whole}.\\overline{${digits}}`,
    value: { n: negative ? -r.n : r.n, d: r.d },
  };
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): ClassifyConstruction {
  const p = resolveParams(schema, params);
  const roots = p.includeRoots as boolean;
  const disguised = p.disguised as boolean;
  const base = { includeNatural: p.includeNatural as boolean };
  const kind = pickKind(rng);
  const sign = kind === "negative" ? -1 : 1;
  const ints = (form: Form, m: number) => {
    const n = sign * m;
    switch (form) {
      case "fraction": {
        const d = rng.int(2, 6);
        const lead = n < 0 ? "-" : "";
        return { latex: `${lead}\\frac{${Math.abs(n) * d}}{${d}}`, value: { n, d: 1 } };
      }
      case "root":
        return { latex: `${n < 0 ? "-" : ""}\\sqrt{${m * m}}`, value: { n, d: 1 } };
      default:
        return { latex: String(n), value: { n, d: 1 } };
    }
  };

  switch (kind) {
    case "natural":
    case "negative": {
      const forms: Form[] = ["plain", "plain"];
      if (disguised) forms.push("fraction");
      if (disguised && roots) forms.push("root");
      const form = rng.pick(forms);
      const m = form === "root" ? rng.int(2, 12) : rng.int(1, 30);
      return { ...base, kind, form, ...ints(form, m) };
    }
    case "zero": {
      const form: Form = disguised && rng.bool(0.4) ? "fraction" : "plain";
      return {
        ...base,
        kind,
        form,
        latex: form === "fraction" ? `\\frac{0}{${rng.int(2, 9)}}` : "0",
        value: { n: 0, d: 1 },
      };
    }
    case "rational": {
      const negative = rng.bool(0.4);
      const form = rng.pick(["fraction", "fraction", "mixed", "decimal", "repeating", ...(roots ? ["root" as const] : [])] as Form[]);
      const s = negative ? -1 : 1;
      switch (form) {
        case "fraction": {
          const d = rng.int(2, 12);
          let n = rng.int(1, 3 * d);
          while (n % d === 0) n++;
          const r = rat(s * n, d);
          return { ...base, kind, form, latex: numLatex(r), value: r };
        }
        case "mixed": {
          const d = rng.int(2, 8);
          const n = rng.int(1, d - 1);
          const r = rat(s * (rng.int(1, 9) * d + n), d);
          if (r.d === 1) break;
          return { ...base, kind, form, latex: mixedLatex(r), value: r };
        }
        case "decimal": {
          const scale = rng.pick([10, 100]);
          let k = rng.int(1, 20 * scale);
          if (k % scale === 0) k++;
          const r = rat(s * k, scale);
          return { ...base, kind, form, latex: numLatex(r, "decimal"), value: r };
        }
        case "repeating": {
          const rep = repeatingLatex(rng, negative);
          return { ...base, kind, form, ...rep };
        }
        case "root": {
          // the root of a perfect-square fraction: \sqrt{\frac{4}{9}} = \frac{2}{3}
          const d = rng.int(2, 9);
          let n = rng.int(1, 9);
          while (rat(n, d).d === 1 || rat(n, d).n !== n) n = rng.int(1, 9);
          return {
            ...base,
            kind,
            form,
            latex: `${negative ? "-" : ""}\\sqrt{\\frac{${n * n}}{${d * d}}}`,
            value: { n: s * n, d },
          };
        }
      }
      // a mixed number that came out whole: fall back to a plain fraction
      const r = rat(s * 7, 4);
      return { ...base, kind, form: "fraction", latex: numLatex(r), value: r };
    }
    case "irrational": {
      const negative = rng.bool(0.3);
      const lead = negative ? "-" : "";
      const form = rng.pick(["pi", "pattern", ...(roots ? (["root", "root"] as const) : [])] as Form[]);
      let latex: string;
      if (form === "root") {
        const n = rng.pick(NON_SQUARES);
        const c = rng.bool(0.25) ? rng.int(2, 5) : 1;
        latex = `${lead}${c === 1 ? "" : c}\\sqrt{${n}}`;
      } else if (form === "pi") {
        latex = rng.pick([`${lead}\\pi`, `${lead}${rng.int(2, 9)}\\pi`, `${lead}\\frac{\\pi}{${rng.int(2, 6)}}`]);
      } else {
        // a decimal that never repeats: 0.1010010001..., 2.123456789101112...
        const whole = rng.int(0, 9);
        const d = rng.int(1, 8);
        if (rng.bool()) latex = `${lead}${whole}.${d}0${d}00${d}000${d}\\ldots`;
        else {
          // consecutive whole numbers (or every other one) written one after another
          const start = rng.int(1, 9);
          const step = rng.pick([1, 1, 2]);
          let digits = "";
          for (let n = start; digits.length < 12; n += step) digits += String(n);
          latex = `${lead}${whole}.${digits.slice(0, 12)}\\ldots`;
        }
      }
      return { ...base, kind, form, latex, value: null };
    }
  }
}

/** The sets the number belongs to, in the order they are listed, under the options. */
export function setsFor(k: Pick<ClassifyConstruction, "includeNatural">, sets: NumberSet[]): NumberSet[] {
  return sets.filter((s) => k.includeNatural || s !== "natural");
}

export function setsLatex(sets: NumberSet[]): string {
  return `\\text{${sets.join(", ")}}`;
}

export function answerSets(k: ClassifyConstruction): NumberSet[] {
  return setsFor(k, SETS[k.kind]);
}

/**
 * Mistake-based Distractors, by the kind of number and how it is written:
 * only the narrowest set named, zero counted as natural (or not whole), a
 * negative integer counted as whole, a disguised integer (\frac{12}{3},
 * \sqrt{49}) left as just rational or called irrational, a repeating decimal
 * or a root of a perfect-square fraction called irrational, \pi or a root
 * called rational, then other plausible chains to fill.
 */
export function distractors(k: ClassifyConstruction): string[] {
  const N: NumberSet[] = ["natural", "whole", "integer", "rational"];
  const candidates: NumberSet[][] = [];
  switch (k.kind) {
    case "natural":
      if (k.form === "root") candidates.push(["irrational"]);
      if (k.form === "fraction") candidates.push(["rational"]);
      candidates.push(["natural"], ["natural", "integer", "rational"], ["whole", "integer", "rational"], ["integer", "rational"]);
      break;
    case "zero":
      candidates.push(N, ["integer", "rational"], ["whole"], ["rational"], ["natural", "whole"]);
      break;
    case "negative":
      if (k.form === "root") candidates.push(["irrational"]);
      if (k.form === "fraction") candidates.push(["rational"]);
      candidates.push(["whole", "integer", "rational"], ["integer"], N, ["rational"], ["irrational"]);
      break;
    case "rational":
      if (k.form === "repeating" || k.form === "root") candidates.push(["irrational"]);
      candidates.push(["integer", "rational"], ["irrational"], ["whole", "integer", "rational"], ["rational", "irrational"], N);
      break;
    case "irrational":
      candidates.push(["rational"], ["integer", "rational"], ["rational", "irrational"], ["whole", "integer", "rational"], N);
      break;
  }
  // other chains a student might write, so there are always enough choices
  candidates.push(["rational"], ["integer", "rational"], ["whole", "integer", "rational"], N, ["irrational"]);
  candidates.push(["whole", "integer"], ["integer"], ["whole"], ["rational", "irrational"]);
  return distinctHints(
    setsLatex(answerSets(k)),
    candidates.map((c) => setsFor(k, c)).filter((c) => c.length > 0).map(setsLatex),
  );
}

export const generator: Generator = {
  id: CLASSIFYING_NUMBERS_ID,
  title: "Classifying real numbers",
  defaultDirections: "Name every set of numbers each number belongs to.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: CLASSIFYING_NUMBERS_ID,
      params: resolved,
      seed,
      prompt: k.latex,
      answer: setsLatex(answerSets(k)),
      distractorHints: distractors(k),
    };
  },
};
