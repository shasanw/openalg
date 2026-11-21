// "Order of operations": evaluate an integer expression with +, -, \times,
// \div, powers and parentheses, e.g. 18 - 2 \times (7 - 4)^{2}.
//
// Built ANSWER-FIRST: the Answer T is chosen, then split backwards into an
// expression tree. A node worth T becomes a + b (b = T - a), a - b
// (a = T + b), a \times b (b a divisor of T), a \div b (a = T b) or base^e
// (T a perfect square or cube), and each child is split again until the
// requested number of operations is used up. Every node is an integer by
// construction, so the printed expression equals T exactly and nothing is
// evaluated to find it. Distractors evaluate the printed expression with a
// student's wrong precedence rules (strictly left to right, adding before
// multiplying, M before D and A before S, a power as a product).

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { add, distinctHints, div, isInt, mul, neg, rat, sub, type Rat } from "../shared/equationKit";

export const ORDER_OF_OPERATIONS_ID = "order-of-operations";

export const schema = [
  {
    type: "int",
    key: "operations",
    label: "Operations in each expression",
    min: 2,
    max: 6,
    default: 3,
  },
  {
    type: "boolean",
    key: "exponents",
    label: "Include exponents",
    default: true,
  },
  {
    type: "boolean",
    key: "parentheses",
    label: "Include parentheses",
    default: true,
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative numbers",
    default: false,
  },
  {
    type: "int",
    key: "maxNumber",
    label: "Largest number (a number being divided may be larger)",
    min: 3,
    max: 20,
    default: 10,
  },
] as const satisfies ParamSchema;

export type BinOp = "+" | "-" | "*" | "/";

/** An expression tree whose every node is an integer by construction. */
export type Node =
  | { kind: "num"; value: number }
  | { kind: "bin"; op: BinOp; left: Node; right: Node; value: number }
  | { kind: "pow"; base: Node; exp: 2 | 3; value: number };

/** The structured construction. Exposed for property tests. */
export interface OrderConstruction {
  tree: Node;
  /** the Answer */
  answer: number;
}

interface Limits {
  maxNumber: number;
  negOk: boolean;
  exponents: boolean;
  parentheses: boolean;
}

/** Where a child sits, to decide whether it needs parentheses. */
type Slot = { parent: BinOp | "pow"; side: "left" | "right" } | null;

const PREC: Record<BinOp, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

/** Does a child with this operation need parentheses in this slot? */
export function needsParens(child: BinOp | "pow" | "num", slot: Slot): boolean {
  if (!slot || child === "num") return false;
  if (slot.parent === "pow") return true; // (4 - 1)^2, (2 \times 3)^2
  if (child === "pow") return false;
  const p = PREC[slot.parent];
  const c = PREC[child];
  if (c < p) return true;
  // a - (b + c), a \div (b \times c): the right side of - and \div groups
  return c === p && slot.side === "right" && (slot.parent === "-" || slot.parent === "/");
}

function divisors(t: number, max: number): number[] {
  const out: number[] = [];
  for (let d = 2; d <= Math.min(max, Math.abs(t) / 2); d++) if (t % d === 0) out.push(d);
  return out;
}

/** A base b with b^e = t (|b| from 2 to 6 for squares, 2 to 4 for cubes), or null. */
function rootOf(t: number, negOk: boolean): { base: number; exp: 2 | 3 } | null {
  for (let b = 2; b <= 6; b++) if (b * b === t) return { base: b, exp: 2 };
  for (let b = 2; b <= 4; b++) {
    if (b ** 3 === t) return { base: b, exp: 3 };
    if (negOk && -(b ** 3) === t) return { base: -b, exp: 3 };
  }
  return null;
}

class Builder {
  powers = 0;
  constructor(
    private rng: Rng,
    private lim: Limits,
  ) {}

  /** A leaf worth t, or null when t is not a number the sheet should print. */
  leaf(t: number, dividend: boolean): Node | null {
    const max = dividend ? this.lim.maxNumber * 10 : this.lim.maxNumber;
    if (t === 0 || Math.abs(t) > max) return null;
    if (!this.lim.negOk && t < 0) return null;
    return { kind: "num", value: t };
  }

  /** A small nonzero operand (seldom 1, which makes a dull sum). */
  small(): number {
    const m = this.rng.int(this.rng.bool(0.9) ? 2 : 1, this.lim.maxNumber);
    return this.lim.negOk && this.rng.bool(0.3) ? -m : m;
  }

  /** A node worth t using exactly n operations, or null. */
  build(t: number, n: number, slot: Slot, dividend = false): Node | null {
    if (!Number.isInteger(t) || Math.abs(t) > this.lim.maxNumber * this.lim.maxNumber * 2) return null;
    if (!this.lim.negOk && t < 0) return null;
    if (n === 0) return this.leaf(t, dividend);
    const ops: (BinOp | "pow")[] = ["+", "-", "*", "/", "pow"];
    // shuffle, trying the operations in a random order
    for (let i = ops.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [ops[i], ops[j]] = [ops[j], ops[i]];
    }
    for (const op of ops) {
      if (!this.lim.parentheses && needsParens(op, slot)) continue;
      const node = op === "pow" ? this.buildPow(t, n) : this.buildBin(op, t, n);
      if (node) return node;
    }
    return null;
  }

  private buildPow(t: number, n: number): Node | null {
    if (!this.lim.exponents || this.powers >= 2) return null;
    const root = rootOf(t, this.lim.negOk);
    if (!root) return null;
    // with negatives, an even power of a negative base is fair game: (-3)^2
    let base = root.base;
    if (root.exp === 2 && this.lim.negOk && this.rng.bool(0.3)) base = -base;
    // the base is a number, or (with parentheses) a small group
    if (n - 1 > 1 || (n - 1 === 1 && !this.lim.parentheses)) return null;
    this.powers++;
    const b = this.build(base, n - 1, { parent: "pow", side: "left" });
    if (!b) {
      this.powers--;
      return null;
    }
    return { kind: "pow", base: b, exp: root.exp, value: t };
  }

  private buildBin(op: BinOp, t: number, n: number): Node | null {
    let l: number;
    let r: number;
    switch (op) {
      case "+":
        l = this.small();
        r = t - l;
        break;
      case "-":
        r = this.small();
        l = t + r;
        break;
      case "*": {
        const ds = divisors(t, Math.min(this.lim.maxNumber, 12));
        if (ds.length === 0) return null;
        r = this.rng.pick(ds) * (this.lim.negOk && this.rng.bool(0.25) ? -1 : 1);
        l = t / r;
        if (this.rng.bool()) [l, r] = [r, l];
        break;
      }
      case "/":
        r = this.rng.int(2, Math.min(this.lim.maxNumber, 12)) * (this.lim.negOk && this.rng.bool(0.25) ? -1 : 1);
        l = t * r;
        break;
    }
    const nl = this.rng.int(0, n - 1);
    // a number divided straight away is a times-table fact: 72 \div 8, not 76 \div 2
    if (op === "/" && nl === 0 && Math.abs(t) > this.lim.maxNumber) return null;
    const left = this.build(l, nl, { parent: op, side: "left" }, op === "/");
    if (!left) return null;
    const right = this.build(r, n - 1 - nl, { parent: op, side: "right" });
    if (!right) return null;
    return { kind: "bin", op, left, right, value: t };
  }
}

/** How many operations a tree holds. */
export function countOps(n: Node): number {
  if (n.kind === "num") return 0;
  if (n.kind === "pow") return 1 + countOps(n.base);
  return 1 + countOps(n.left) + countOps(n.right);
}

/** Does the printed expression have parentheses (around a group, not just a negative number)? */
export function hasGroup(n: Node, slot: Slot = null): boolean {
  if (n.kind === "num") return false;
  if (needsParens(n.kind === "pow" ? "pow" : n.op, slot)) return true;
  if (n.kind === "pow") return hasGroup(n.base, { parent: "pow", side: "left" });
  return hasGroup(n.left, { parent: n.op, side: "left" }) || hasGroup(n.right, { parent: n.op, side: "right" });
}

function hasPow(n: Node): boolean {
  if (n.kind === "num") return false;
  if (n.kind === "pow") return true;
  return hasPow(n.left) || hasPow(n.right);
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): OrderConstruction {
  const p = resolveParams(schema, params);
  const lim: Limits = {
    maxNumber: p.maxNumber as number,
    negOk: p.allowNegatives as boolean,
    exponents: p.exponents as boolean,
    parentheses: p.parentheses as boolean,
  };
  const n = p.operations as number;
  let fallback: OrderConstruction | null = null;
  for (let attempt = 0; attempt < 600; attempt++) {
    const M = lim.maxNumber;
    const t = rng.int(1, 3 * M) * (lim.negOk && rng.bool(0.4) ? -1 : 1);
    const b = new Builder(rng, lim);
    const tree = b.build(t, n, null);
    if (!tree) continue;
    const k = { tree, answer: t };
    fallback ??= k;
    // the expression should test the order of operations: the usual wrong
    // orders must give different whole numbers (a fraction would tell the
    // student something went wrong), and an asked-for feature should usually
    // show up
    if (coreDistractors(k).length < (attempt < 200 ? 2 : 1) && attempt < 500) continue;
    // fewer than four distinct mistake-based Distractors (expressions of 2s
    // with a stray 3 or 4): draw another one while there is time
    if (distractors(k).length < 4 && attempt < 100) continue;
    if (lim.parentheses && !hasGroup(tree) && rng.bool(0.7) && attempt < 400) continue;
    if (lim.exponents && !hasPow(tree) && rng.bool(0.8) && attempt < 400) continue;
    return k;
  }
  if (fallback) return fallback;
  // Practically unreachable: a + b \times c, built forwards (still exact).
  const a = rng.int(1, lim.maxNumber);
  const bb = rng.int(2, lim.maxNumber);
  const c = rng.int(2, lim.maxNumber);
  const num = (value: number): Node => ({ kind: "num", value });
  const prod: Node = { kind: "bin", op: "*", left: num(bb), right: num(c), value: bb * c };
  return { tree: { kind: "bin", op: "+", left: num(a), right: prod, value: a + bb * c }, answer: a + bb * c };
}

// ------------------------------------------------------------------ printing

const OP_LATEX: Record<BinOp, string> = { "+": "+", "-": "-", "*": "\\times", "/": "\\div" };

/** A token of the printed expression, in reading order. */
export type Token =
  | { t: "num"; value: number }
  | { t: "op"; op: BinOp }
  | { t: "(" }
  | { t: ")" }
  | { t: "pow"; exp: 2 | 3 };

export function tokens(n: Node, slot: Slot = null): Token[] {
  const inner = (): Token[] => {
    if (n.kind === "num") return [{ t: "num", value: n.value }];
    if (n.kind === "pow") return [...tokens(n.base, { parent: "pow", side: "left" }), { t: "pow", exp: n.exp }];
    return [
      ...tokens(n.left, { parent: n.op, side: "left" }),
      { t: "op", op: n.op },
      ...tokens(n.right, { parent: n.op, side: "right" }),
    ];
  };
  const body = inner();
  const kind = n.kind === "num" ? "num" : n.kind === "pow" ? "pow" : n.op;
  return needsParens(kind, slot) ? [{ t: "(" }, ...body, { t: ")" }] : body;
}

export function promptLatex(k: OrderConstruction): string {
  const toks = tokens(k.tree);
  let out = "";
  toks.forEach((tok, i) => {
    const prev = toks[i - 1];
    const next = toks[i + 1];
    switch (tok.t) {
      case "num": {
        // a negative number is wrapped unless it starts the expression or a
        // group; the base of a power always is: (-3)^{2}, never -3^{2}
        const wrap = tok.value < 0 && ((prev && prev.t !== "(") || next?.t === "pow");
        out += wrap ? `(${tok.value})` : String(tok.value);
        break;
      }
      case "op":
        out += ` ${OP_LATEX[tok.op]} `;
        break;
      case "(":
      case ")":
        out += tok.t;
        break;
      case "pow":
        out += `^{${tok.exp}}`;
        break;
    }
  });
  return out;
}

// ------------------------------------------------------------------ mistakes

export type Mistake =
  | "leftToRight"
  | "addFirst"
  | "pemdasLiteral"
  | "rightToLeft"
  | "powerAsProduct"
  | "negativeBase"
  | "subtractNegative"
  | "powerOverProduct"
  | "ignoredParentheses";

/** Mistakes that change how tokens are read rather than which operation binds first. */
type ReadingMistake = "powerAsProduct" | "negativeBase" | "subtractNegative" | "powerOverProduct" | "ignoredParentheses";

/** Binding strength of each operation under a (possibly wrong) set of rules. */
const RULES: Record<Exclude<Mistake, ReadingMistake | "rightToLeft"> | "correct", Record<BinOp, number>> = {
  correct: { "+": 1, "-": 1, "*": 2, "/": 2 },
  // strictly left to right, ignoring multiplication-before-addition
  leftToRight: { "+": 1, "-": 1, "*": 1, "/": 1 },
  // added and subtracted first
  addFirst: { "+": 2, "-": 2, "*": 1, "/": 1 },
  // read "PEMDAS" literally: multiplication before division, addition before subtraction
  pemdasLiteral: { "+": 2, "-": 1, "*": 4, "/": 3 },
};

interface Reading {
  /** 3^2 as 3 \cdot 2 */
  powerAsProduct?: boolean;
  /** (-3)^2 as -(3^2) */
  negativeBase?: boolean;
  /** within one level, the right-hand operation first: 12 - 2 + 3 as 12 - (2 + 3) */
  rightToLeft?: boolean;
}

/** Evaluate the printed tokens under a precedence table (exact; null on division by zero). */
export function evaluateTokens(toks: Token[], prec: Record<BinOp, number>, reading: Reading = {}): Rat | null {
  const { powerAsProduct = false, negativeBase = false, rightToLeft = false } = reading;
  let i = 0;
  const atom = (): Rat | null => {
    const tok = toks[i++];
    let v: Rat | null;
    if (tok.t === "(") {
      v = expr(0);
      i++; // ")"
    } else if (tok.t === "num") v = rat(tok.value);
    else throw new Error("unexpected token");
    while (v && toks[i]?.t === "pow") {
      const e = (toks[i++] as { exp: 2 | 3 }).exp;
      const base: Rat = negativeBase && v.n < 0 ? neg(v) : v;
      let p = powerAsProduct ? mul(base, rat(e)) : e === 2 ? mul(base, base) : mul(mul(base, base), base);
      if (negativeBase && v.n < 0) p = neg(p);
      v = p;
    }
    return v;
  };
  const expr = (minPrec: number): Rat | null => {
    let left = atom();
    for (;;) {
      const tok = toks[i];
      if (!tok || tok.t !== "op" || prec[tok.op] < minPrec) return left;
      i++;
      const right = expr(rightToLeft ? prec[tok.op] : prec[tok.op] + 1);
      if (!left || !right) return null;
      left = apply(tok.op, left, right);
    }
  };
  return expr(0);
}

function apply(op: BinOp, a: Rat, b: Rat): Rat | null {
  switch (op) {
    case "+":
      return add(a, b);
    case "-":
      return sub(a, b);
    case "*":
      return mul(a, b);
    case "/":
      return div(a, b);
  }
}

/** The value a student gets with one wrong rule, or null when it is not a whole number. */
export function wrongValue(k: OrderConstruction, m: Mistake): number | null {
  const toks = tokens(k.tree);
  let r: Rat | null;
  switch (m) {
    case "powerAsProduct":
    case "negativeBase":
    case "rightToLeft":
      r = evaluateTokens(toks, RULES.correct, { [m]: true });
      break;
    case "ignoredParentheses":
      r = evaluateTokens(
        toks.filter((x) => x.t !== "(" && x.t !== ")"),
        RULES.correct,
      );
      break;
    case "powerOverProduct": {
      // 2 \times 3^2 worked as (2 \times 3)^2: the power taken over the product before it
      const regroup = (n: Node): Node => {
        if (n.kind === "num") return n;
        if (n.kind === "pow") return { ...n, base: regroup(n.base) };
        const left = regroup(n.left);
        const right = regroup(n.right);
        if (n.op === "*" && right.kind === "pow" && right.base.kind === "num" && left.kind === "num") {
          return { kind: "pow", base: { kind: "bin", op: "*", left, right: right.base, value: 0 }, exp: right.exp, value: 0 };
        }
        return { ...n, left, right };
      };
      const changed = regroup(k.tree);
      r = JSON.stringify(changed) === JSON.stringify(k.tree) ? null : evaluateTokens(tokens(changed), RULES.correct);
      break;
    }
    case "subtractNegative": {
      // 5 - (-3) worked as 5 - 3: the negative after a minus loses its sign
      const changed = toks.map((x, j) => {
        const prev = toks[j - 1];
        return x.t === "num" && x.value < 0 && prev?.t === "op" && prev.op === "-" ? { ...x, value: -x.value } : x;
      });
      r = changed.some((x, j) => x !== toks[j]) ? evaluateTokens(changed, RULES.correct) : null;
      break;
    }
    default:
      r = evaluateTokens(toks, RULES[m]);
  }
  return r && isInt(r) ? r.n : null;
}

/** The true value of the printed expression, by the correct rules (for tests). */
export function correctValue(k: OrderConstruction): Rat | null {
  return evaluateTokens(tokens(k.tree), RULES.correct);
}

/**
 * Mistake-based Distractors: worked strictly left to right, ignored the
 * parentheses, added and subtracted before multiplying and dividing, took a
 * power as a product (3^2 as 6) or over the product before it (2 \times 3^2
 * as 36), squared a negative base to a negative
 * ((-3)^2 as -9), subtracted a negative as a positive (5 - (-3) as 2), read
 * PEMDAS literally (M before D, A before S), worked right to left within a
 * level (12 - 2 + 3 as 7), and the opposite of the Answer (a sign slip),
 * keeping only whole numbers.
 */
function coreDistractors(k: OrderConstruction): string[] {
  const mistakes: Mistake[] = [
    "leftToRight",
    "ignoredParentheses",
    "addFirst",
    "powerAsProduct",
    "powerOverProduct",
    "negativeBase",
    "subtractNegative",
    "pemdasLiteral",
    "rightToLeft",
  ];
  const values = mistakes.map((m) =>
    wrongValue(k, m),
  );
  values.push(neg(rat(k.answer)).n);
  return distinctHints(
    String(k.answer),
    values.map((v) => (v === null || (v < 0 && !hasNegative(k)) ? null : String(v))),
  );
}

/** Carry one local arithmetic slip through the remaining, correctly worked steps. */
function stepMistakes(node: Node): number[] {
  if (node.kind === "num") return [];
  if (node.kind === "pow") {
    const b = node.base.value;
    // Dropped the exponent, or added it to the base instead of raising to it.
    return [b, b + node.exp, ...stepMistakes(node.base).map((v) => v ** node.exp)];
  }
  const a = node.left.value;
  const b = node.right.value;
  // Stopped after one operand, or used the inverse operation at this step.
  const values = [a, b];
  const work = (x: number, y: number) => {
    switch (node.op) {
      case "+": return x + y;
      case "-": return x - y;
      case "*": return x * y;
      case "/": return x / y;
    }
  };
  switch (node.op) {
    case "+":
    case "-":
      values.push(node.op === "+" ? a - b : a + b, b - a, a * b);
      break;
    case "*":
      // Added the factors, or divided them instead.
      values.push(a + b, a / b);
      break;
    case "/":
      // Multiplied, reversed the quotient, or stopped after one subtraction.
      values.push(a * b, b / a, a - b, a + b);
      break;
  }
  return [...values, ...stepMistakes(node.left).map((v) => work(v, b)),
    ...stepMistakes(node.right).map((v) => work(a, v))];
}

export function distractors(k: OrderConstruction): string[] {
  const core = coreDistractors(k);
  const signs = hasNegative(k);
  const extra = stepMistakes(k.tree).filter((v) => Number.isSafeInteger(v) && (v >= 0 || signs));
  return distinctHints(String(k.answer), [...core, ...extra.map(String)]);
}

/** Does anything negative appear in the working (so a negative choice is plausible)? */
function hasNegative(k: OrderConstruction): boolean {
  const walk = (n: Node): boolean =>
    n.value < 0 || (n.kind === "bin" ? walk(n.left) || walk(n.right) : n.kind === "pow" ? walk(n.base) : false);
  return walk(k.tree);
}

export const generator: Generator = {
  id: ORDER_OF_OPERATIONS_ID,
  title: "Order of operations",
  defaultDirections: "Evaluate each expression.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: ORDER_OF_OPERATIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: String(k.answer),
      distractorHints: distractors(k),
    };
  },
};
