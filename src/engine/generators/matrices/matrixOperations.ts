// "Matrix operations": add and subtract matrices, multiply by a scalar,
// combine the two (2A - 3B), and multiply matrices. Optionally some Problems
// are undefined (shapes that do not match).
//
// Built ANSWER-FROM-CONSTRUCTION: the shapes (and so whether the Answer is
// defined) are chosen first, then the entries; the Answer is evaluated
// forwards from them. Nothing is solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { distinctHints, rat } from "../shared/equationKit";
import {
  cols,
  hadamard,
  madd,
  mapEntries,
  matrixLatex,
  mmul,
  msub,
  mscale,
  randomMatrix,
  rows,
  sameShape,
  scalarLatex,
  transpose,
  type Matrix,
} from "./matrixKit";

export const MATRIX_OPERATIONS_ID = "matrix-operations";

export type Operation = "addSubtract" | "scalar" | "combination" | "multiply";

export const UNDEFINED = "\\text{undefined}";

export const schema = [
  {
    type: "enum",
    key: "operation",
    label: "Operation",
    default: "mixed",
    options: [
      { value: "addSubtract", label: "Add and subtract" },
      { value: "scalar", label: "Multiply by a scalar" },
      { value: "combination", label: "Combinations like 2A - 3B" },
      { value: "multiply", label: "Multiply matrices" },
      { value: "mixed", label: "A mix" },
    ],
  },
  {
    type: "int",
    key: "maxDimension",
    label: "Largest number of rows or columns",
    min: 2,
    max: 3,
    default: 3,
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative entries",
    default: true,
  },
  {
    type: "boolean",
    key: "includeUndefined",
    label: "Include undefined sums and products",
    default: false,
  },
] as const satisfies ParamSchema;

/** The structured construction: s1 A op s2 B, or a scalar times A, or AB. */
export interface MatrixOpConstruction {
  operation: Operation;
  a: Matrix;
  /** absent for a scalar multiple */
  b?: Matrix;
  /** the scalars in s1 A + s2 B (add/subtract: 1 and +-1; scalar: s1 alone) */
  s1: number;
  s2: number;
}

/** The Answer, or null when it is undefined. */
export function resultOf(k: MatrixOpConstruction): Matrix | null {
  if (k.operation === "multiply") return mmul(k.a, k.b!);
  const scaledA = mscale(rat(k.s1), k.a);
  if (!k.b) return scaledA;
  if (!sameShape(k.a, k.b)) return null;
  return madd(scaledA, mscale(rat(k.s2), k.b));
}

/** A shape: rows by columns, each from 1 to max, never 1 by 1. */
function shape(rng: Rng, max: number): [number, number] {
  for (;;) {
    const r = rng.int(1, max);
    const c = rng.int(1, max);
    if (r * c > 1) return [r, c];
  }
}

const signed = (rng: Rng, lo: number, hi: number) => (rng.bool() ? 1 : -1) * rng.int(lo, hi);

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): MatrixOpConstruction {
  const p = resolveParams(schema, params);
  const ops: Operation[] =
    p.operation === "mixed" ? ["addSubtract", "scalar", "combination", "multiply"] : [p.operation as Operation];
  const operation = rng.pick(ops);
  const max = p.maxDimension as number;
  const neg = p.allowNegatives as boolean;
  const undefinedOne = (p.includeUndefined as boolean) && operation !== "scalar" && rng.bool(0.25);

  if (operation === "multiply") {
    for (;;) {
      const m = rng.int(1, max);
      const n = rng.int(1, max);
      // an undefined product AB is one whose reverse BA is defined (B has m columns)
      const q = undefinedOne ? m : rng.int(1, max);
      const bRows = undefinedOne ? rng.int(1, max) : n;
      if (undefinedOne && bRows === n) continue;
      // neither factor is 1 by 1, and the printed pair fits a column (at most five columns side by side)
      if (m * n === 1 || bRows * q === 1 || n + q > 5) continue;
      const a = randomMatrix(rng, m, n, 5, neg);
      const b = randomMatrix(rng, bRows, q, 5, neg);
      return { operation, a, b, s1: 1, s2: 1 };
    }
  }
  const [r, c] = shape(rng, max);
  const a = randomMatrix(rng, r, c, 9, neg);
  if (operation === "scalar") return { operation, a, s1: signed(rng, 2, 6), s2: 0 };
  // an undefined sum pairs A with a matrix of the transposed shape
  const [br, bc] = undefinedOne && r !== c ? [c, r] : [r, c];
  const b = randomMatrix(rng, br, bc, 9, neg);
  if (operation === "addSubtract") return { operation, a, b, s1: 1, s2: rng.bool() ? 1 : -1 };
  return { operation, a, b, s1: rng.int(2, 4), s2: signed(rng, 1, 4) };
}

export function promptLatex(k: MatrixOpConstruction): string {
  const A = matrixLatex(k.a);
  if (!k.b) return `${scalarLatex(k.s1)}${A}`;
  const B = matrixLatex(k.b);
  if (k.operation === "multiply") return `${A}${B}`;
  const op = k.s2 < 0 ? "-" : "+";
  return `${scalarLatex(k.s1)}${A} ${op} ${scalarLatex(Math.abs(k.s2))}${B}`;
}

export function answerLatex(k: MatrixOpConstruction): string {
  const m = resultOf(k);
  return m ? matrixLatex(m) : UNDEFINED;
}

/** s1 A + s2 B, with B swapped for a slip's version of it; null when the shapes differ. */
function combine(k: MatrixOpConstruction, s1: number, s2: number, b: Matrix = k.b!): Matrix | null {
  if (!sameShape(k.a, b)) return null;
  return madd(mscale(rat(s1), k.a), mscale(rat(s2), b));
}

/**
 * Mistake-based Distractors, most common first.
 * - Sums: the other operation (adding for subtracting), the order reversed
 *   (B - A), and subtracting a negative entry as if it were positive.
 * - Scalar multiples: adding the scalar to each entry, the scalar's sign
 *   dropped, and only the first row multiplied.
 * - Combinations: one scalar left off (2A - B, A - 3B), and the second
 *   term's sign flipped.
 * - Products: BA, the entry-by-entry product, the transposed product, and
 *   rows times rows (AB^T) or columns times columns (A^TB).
 * - Undefined: lining the shapes up anyway (A^T + B, A + B^T; for a product,
 *   BA or AB^T when those exist).
 */
export function distractors(k: MatrixOpConstruction): string[] {
  const out: (Matrix | null)[] = [];
  const { a, b } = k;
  if (k.operation === "scalar") {
    out.push(
      mapAdd(a, k.s1),
      mscale(rat(-k.s1), a),
      a.map((r, i) => (i === 0 ? r.map((x) => rat(x.n * k.s1)) : r)),
      mapAdd(a, -k.s1),
      // only the first entry multiplied, the scalar divided into each entry, and the sign
      // rule broken (every product given a minus sign)
      mapEntries(a, (x, i, j) => (i === 0 && j === 0 ? rat(x.n * k.s1) : x)),
      mapEntries(a, (x) => rat(x.n, x.d * k.s1)),
      mapEntries(a, (x) => rat(-Math.abs(x.n * k.s1), x.d)),
    );
  } else if (k.operation === "multiply") {
    const ab = mmul(a, b!);
    out.push(
      mmul(b!, a),
      sameShape(a, b!) ? hadamard(a, b!) : null,
      ab && rows(ab) === cols(ab) ? transpose(ab) : null,
      mmul(a, transpose(b!)),
      mmul(transpose(a), b!),
      mmul(transpose(b!), transpose(a)),
      // Transpose a factor or reverse the order to make the dimensions fit.
      mmul(transpose(a), transpose(b!)),
      mmul(transpose(b!), a),
      mmul(b!, transpose(a)),
      // Confuse matrix multiplication with addition, subtraction or entrywise multiplication.
      sharedEntries(a, b!, (x, y) => x + y),
      sharedEntries(a, b!, (x, y) => x - y),
      sharedEntries(a, b!, (x, y) => x * y),
    );
    // Pair up the available row and column entries, even for incompatible shapes.
    const paired = Math.min(cols(a), rows(b!));
    const dotSlip = (compute: (x: number, y: number, index: number) => number) =>
      a.map((row) => b![0].map((_, j) => rat(row.slice(0, paired).reduce(
        (sum, x, i) => sum + compute(x.n, b![i][j].n, i), 0,
      ))));
    out.push(
      dotSlip((x, y, i) => i === 0 ? x * y : 0), // stop at the first product
      dotSlip((x, y, i) => i === paired - 1 ? x * y : 0), // overwrite the running total
      dotSlip((x, y, i) => (i % 2 === 0 ? 1 : -1) * x * y), // alternate signs as in a determinant
      dotSlip((x, y) => x + y), // add entries in place of multiplying
      dotSlip((x, y) => x * y), // ignore any unpaired entries
    );
    // a row times a column: the products written out as a row without adding them up
    if (rows(a) === 1 && cols(b!) === 1 && paired > 1) out.push([a[0].slice(0, paired).map((x, i) => rat(x.n * b![i][0].n))]);
  } else if (!sameShape(a, b!)) {
    out.push(combine(k, k.s1, k.s2, transpose(b!)), transpose(combine(k, k.s1, k.s2, transpose(b!))!));
    out.push(hadamard(transpose(a), b!));
    // Add only the rows and columns that line up.
    out.push(sharedEntries(a, b!, (x, y) => k.s1 * x + k.s2 * y));
  } else if (k.operation === "addSubtract") {
    out.push(
      combine(k, k.s1, -k.s2),
      msub(b!, a),
      // a negative entry of B taken as positive: A - (-3) read as A - 3 (or A + (-3) as A + 3)
      madd(a, mscale(rat(k.s2), b!.map((r) => r.map((x) => rat(Math.abs(x.n), x.d))))),
      madd(b!, mscale(rat(k.s2), a)),
      // the entries multiplied instead of added, the minus sign left on only the first entry of B,
      // and the result written with its rows and columns swapped
      hadamard(a, b!),
      k.s2 < 0 ? madd(a, mapEntries(b!, (x, i, j) => (i === 0 && j === 0 ? rat(-x.n, x.d) : x))) : null,
      transpose(resultOf(k)!),
      flipFirstNonzero(resultOf(k)!),
    );
  } else {
    out.push(
      combine(k, k.s1, Math.sign(k.s2)),
      combine(k, 1, k.s2),
      combine(k, k.s1, -k.s2),
      madd(mscale(rat(k.s1), a), mscale(rat(k.s2), b!.map((r) => r.map((x) => rat(Math.abs(x.n), x.d))))),
      // the two scalars swapped, the entries multiplied (A times B, times both scalars), the
      // minus sign left on only the first entry of B, and the result written with rows and columns swapped
      combine(k, k.s2, k.s1),
      mscale(rat(k.s1 * k.s2), hadamard(a, b!)),
      k.s2 < 0
        ? madd(mscale(rat(k.s1), a), mscale(rat(-k.s2), b!).map((r, i) => r.map((x, j) => (i === 0 && j === 0 ? rat(-x.n, x.d) : x))))
        : null,
      transpose(resultOf(k)!),
      flipFirstNonzero(resultOf(k)!),
    );
  }
  if (k.b && k.operation !== "multiply") {
    // Drop an entire operand; apply only the scalar to the other matrix.
    out.push(mscale(rat(k.s1), a), mscale(rat(k.s2), k.b));
  }
  return distinctHints(
    answerLatex(k),
    out.map((m) => (m ? matrixLatex(m) : null)),
  );
}

/** Combine corresponding entries and discard any rows or columns without a partner. */
function sharedEntries(a: Matrix, b: Matrix, combine: (x: number, y: number) => number): Matrix {
  return a.slice(0, rows(b)).map((row, i) =>
    row.slice(0, cols(b)).map((x, j) => rat(combine(x.n, b[i][j].n))),
  );
}

/** The same matrix with its first nonzero entry's sign flipped (a sign slip in one entry). */
function flipFirstNonzero(m: Matrix): Matrix {
  let done = false;
  return mapEntries(m, (x) => {
    if (done || x.n === 0) return x;
    done = true;
    return rat(-x.n, x.d);
  });
}

const mapAdd = (m: Matrix, s: number): Matrix => m.map((r) => r.map((x) => rat(x.n + s * x.d, x.d)));

export const generator: Generator = {
  id: MATRIX_OPERATIONS_ID,
  title: "Matrix operations",
  defaultDirections: "Simplify each expression.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: MATRIX_OPERATIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
