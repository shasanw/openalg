// "Matrix inverses": find the inverse of a 2 by 2 matrix (or a 3 by 3 one),
// or say that it has none.
//
// Built ANSWER-FIRST.
// - 2 by 2: the determinant D is chosen first (1 or -1 for whole-number
//   inverses, a small D for fractions), then entries with ad - bc = D, so the
//   inverse is (1/D)[d -b; -c a] with the denominators chosen.
// - 3 by 3: the matrix is built as a product of elementary row operations
//   (add a multiple of one row to another, swap two rows, negate a row), and
//   its inverse as the product of the undoing operations in reverse order,
//   so both are whole-number matrices by construction.
// - No inverse: the second row is a multiple of the first.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { distinctHints, rat } from "./equationKit";
import {
  fromInts,
  identity,
  matrixLatex,
  maxEntrySize,
  minors,
  mmul,
  mscale,
  transpose,
  det,
  type Matrix,
} from "./matrixKit";

export const MATRIX_INVERSES_ID = "matrix-inverses";

export const NO_INVERSE = "\\text{no inverse}";

export const schema = [
  {
    type: "enum",
    key: "size",
    label: "Matrix size",
    default: "2",
    options: [
      { value: "2", label: "2 by 2" },
      { value: "3", label: "3 by 3" },
      { value: "mixed", label: "A mix" },
    ],
  },
  {
    type: "enum",
    key: "entries",
    label: "Inverse entries (2 by 2)",
    default: "mixed",
    options: [
      { value: "integer", label: "Whole numbers" },
      { value: "fractions", label: "Fractions" },
      { value: "mixed", label: "A mix" },
    ],
  },
  {
    type: "boolean",
    key: "includeSingular",
    label: "Include matrices with no inverse",
    default: false,
  },
] as const satisfies ParamSchema;

/** Entries of the printed matrix and its inverse stay within this. */
export const MAX_ENTRY = 9;

export interface InverseConstruction {
  m: Matrix;
  /** null when the matrix has no inverse */
  inv: Matrix | null;
}

const signed = (rng: Rng, lo: number, hi: number) => (rng.bool() ? 1 : -1) * rng.int(lo, hi);

/** Divisors d of n (n != 0) with |d| and |n/d| at most `max`. */
function divisorPairs(n: number, max: number): [number, number][] {
  const out: [number, number][] = [];
  for (let d = -max; d <= max; d++) {
    if (d === 0 || n % d !== 0) continue;
    const e = n / d;
    if (Math.abs(e) <= max) out.push([d, e]);
  }
  return out;
}

function twoByTwo(rng: Rng, integer: boolean): InverseConstruction {
  for (;;) {
    const D = integer ? rng.pick([1, -1]) : signed(rng, 2, 6);
    const b = signed(rng, 1, 7);
    const c = signed(rng, 1, 7);
    // a d = D + b c, with a and d both nonzero and small
    const pairs = divisorPairs(D + b * c, 8);
    if (pairs.length === 0) continue;
    const [a, d] = rng.pick(pairs);
    const m = fromInts([
      [a, b],
      [c, d],
    ]);
    const inv = mscale(rat(1, D), fromInts([
      [d, -b],
      [-c, a],
    ]));
    // fractions mode: at least one entry is a fraction
    if (!integer && inv.flat().every((x) => x.d === 1)) continue;
    return { m, inv };
  }
}

/** An elementary row operation on n rows and the one that undoes it. */
function elementary(rng: Rng, n: number): [Matrix, Matrix] {
  const i = rng.int(0, n - 1);
  let j = rng.int(0, n - 2);
  if (j >= i) j++;
  const kind = rng.pick(["add", "add", "add", "add", "swap", "negate"] as const);
  const e = identity(n);
  const u = identity(n);
  if (kind === "add") {
    const k = signed(rng, 1, 3);
    e[i][j] = rat(k);
    u[i][j] = rat(-k);
  } else if (kind === "swap") {
    for (const m of [e, u]) {
      m[i][i] = rat(0);
      m[j][j] = rat(0);
      m[i][j] = rat(1);
      m[j][i] = rat(1);
    }
  } else {
    e[i][i] = rat(-1);
    u[i][i] = rat(-1);
  }
  return [e, u];
}

function threeByThree(rng: Rng): InverseConstruction {
  for (;;) {
    let m = identity(3);
    let inv = identity(3);
    const steps = rng.int(4, 6);
    for (let s = 0; s < steps; s++) {
      const [e, u] = elementary(rng, 3);
      m = mmul(e, m)!;
      inv = mmul(inv, u)!;
    }
    const zeros = m.flat().filter((x) => x.n === 0).length;
    if (zeros > 3 || maxEntrySize(m) > MAX_ENTRY || maxEntrySize(inv) > MAX_ENTRY) continue;
    // not just a shuffle of signs and ones: some entry of each is 2 or more
    if (maxEntrySize(m) < 2 || maxEntrySize(inv) < 2) continue;
    return { m, inv };
  }
}

function singular(rng: Rng, size: number): InverseConstruction {
  for (;;) {
    const first = Array.from({ length: size }, () => signed(rng, 1, 6));
    const k = rng.pick([2, 3, -1, -2]);
    const rows = [first, first.map((x) => x * k)];
    if (size === 3) rows.push(Array.from({ length: 3 }, () => signed(rng, 1, 6)));
    if (rows.flat().some((x) => Math.abs(x) > MAX_ENTRY)) continue;
    // the multiple is not always the second row
    if (size === 3 && rng.bool()) [rows[1], rows[2]] = [rows[2], rows[1]];
    return { m: fromInts(rows), inv: null };
  }
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): InverseConstruction {
  const p = resolveParams(schema, params);
  const size = p.size === "mixed" ? rng.pick([2, 3]) : Number(p.size);
  if ((p.includeSingular as boolean) && rng.bool(0.2)) return singular(rng, size);
  if (size === 3) return threeByThree(rng);
  const integer = p.entries === "integer" || (p.entries === "mixed" && rng.bool(0.4));
  return twoByTwo(rng, integer);
}

export const promptLatex = (k: InverseConstruction): string => matrixLatex(k.m);
export const answerLatex = (k: InverseConstruction): string => (k.inv ? matrixLatex(k.inv) : NO_INVERSE);

/**
 * Mistake-based Distractors, most common first.
 * - 2 by 2 [a b; c d] with D = ad - bc: not dividing by D, swapping b and c
 *   instead of a and d, the signs changed on the diagonal instead of off it
 *   (dividing by -D), the transpose, and no signs changed at all.
 * - 3 by 3: the cofactor matrix not transposed (the inverse's transpose),
 *   the checkerboard of signs left off, and the sign of the determinant
 *   dropped.
 * - No inverse: the 2 by 2 swap-and-negate done anyway, and the matrix's
 *   own transpose.
 */
export function distractors(k: InverseConstruction): string[] {
  const out: Matrix[] = [];
  const m = k.m;
  if (m.length === 2) {
    const [[a, b], [c, d]] = m.map((r) => r.map((x) => x.n));
    const D = a * d - b * c;
    const over = (rows: number[][]) => (D === 0 ? fromInts(rows) : mscale(rat(1, D), fromInts(rows)));
    out.push(
      fromInts([
        [d, -b],
        [-c, a],
      ]),
      over([
        [a, -b],
        [-c, d],
      ]),
      over([
        [-d, b],
        [c, -a],
      ]),
      over([
        [d, -c],
        [-b, a],
      ]),
      over([
        [d, b],
        [c, a],
      ]),
    );
    if (D === 0) out.push(transpose(m));
  } else {
    const D = det(m);
    if (k.inv) out.push(transpose(k.inv), mscale(rat(D.d, D.n), transpose(minors(m))), mscale(rat(-1), k.inv));
    else out.push(transpose(minors(m)), transpose(m));
  }
  return distinctHints(answerLatex(k), out.map((x) => matrixLatex(x)));
}

export const generator: Generator = {
  id: MATRIX_INVERSES_ID,
  title: "Matrix inverses",
  defaultDirections: "Find the inverse of each matrix, if it exists.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: MATRIX_INVERSES_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
