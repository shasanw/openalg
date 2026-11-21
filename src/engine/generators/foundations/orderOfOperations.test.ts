import { choiceKey } from "../../mc";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import {
  construct,
  correctValue,
  countOps,
  distractors,
  evaluateTokens,
  generator,
  hasGroup,
  tokens,
  wrongValue,
  type Node,
  type OrderConstruction,
} from "./orderOfOperations";
import { evalArithmetic, expectClose } from "./arithmeticEval.testkit";
import type { ParamValues } from "../../types";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  operations: fc.integer({ min: 2, max: 6 }),
  exponents: fc.boolean(),
  parentheses: fc.boolean(),
  allowNegatives: fc.boolean(),
  maxNumber: fc.integer({ min: 3, max: 20 }),
});

const num = (value: number): Node => ({ kind: "num", value });
const bin = (op: "+" | "-" | "*" | "/", left: Node, right: Node, value: number): Node => ({ kind: "bin", op, left, right, value });

/** Every node's value in the tree, for range checks. */
function values(n: Node): number[] {
  if (n.kind === "num") return [n.value];
  if (n.kind === "pow") return [n.value, ...values(n.base)];
  return [n.value, ...values(n.left), ...values(n.right)];
}

describe("order-of-operations: answers", () => {
  it("the Answer is the value of the printed expression (checked by JavaScript's own precedence)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectClose(Number(p.answer), evalArithmetic(p.prompt), `${p.prompt} = ${p.answer}`);
        expect(p.answer).toMatch(/^-?\d+$/);
      }),
    );
  });

  it("every node of the construction is an integer, and the tree's own value is the Answer", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        for (const v of values(k.tree)) expect(Number.isInteger(v)).toBe(true);
        const r = correctValue(k)!;
        expect(r.d).toBe(1);
        expect(r.n).toBe(k.answer);
      }),
    );
  });

  it("never prints a zero, a doubled sign or an unbracketed negative base", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.prompt).not.toMatch(/(^|[^\d.])0(?!\d)/);
        expect(p.prompt).not.toMatch(/[+-] [+-]|--|\+-|-\+/);
        expect(p.prompt).not.toMatch(/(^|[^(\d])-\d+\^/);
      }),
    );
  });
});

describe("order-of-operations: Topic Options", () => {
  it("uses exactly the requested number of operations", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(countOps(construct(params, createRng(seed)).tree)).toBe(params.operations);
      }),
    );
  });

  it("prints no exponents or groups when they are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, exponents: false }, seed);
        expect(p.prompt).not.toContain("^");
        const k = construct({ ...params, parentheses: false }, createRng(seed));
        expect(hasGroup(k.tree)).toBe(false);
        // the only parentheses left wrap a single negative number
        expect(generator.generate({ ...params, parentheses: false }, seed).prompt).not.toMatch(/\((?!-\d+\))/);
      }),
    );
  });

  it("usually includes the features that are on", () => {
    const sheet = (params: ParamValues) => Array.from({ length: 60 }, (_, s) => generator.generate(params, s).prompt);
    expect(sheet({}).filter((p) => p.includes("^")).length).toBeGreaterThan(20);
    expect(sheet({}).filter((p) => /\((?!-\d+\))/.test(p)).length).toBeGreaterThan(20);
  });

  it("keeps every number and every step non-negative when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, allowNegatives: false }, createRng(seed));
        for (const v of values(k.tree)) expect(v).toBeGreaterThanOrEqual(0);
        expect(generator.generate({ ...params, allowNegatives: false }, seed).prompt).not.toMatch(/(^|\()-/);
      }),
    );
  });

  it("keeps numbers within Largest number (a number being divided by up to ten times)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const m of p.prompt.matchAll(/\d+/g)) {
          if (p.prompt[m.index! + m[0].length - 1 + 1] === "}") continue; // an exponent
          expect(Number(m[0])).toBeLessThanOrEqual(params.maxNumber * 10);
        }
      }),
    );
  });
});

describe("order-of-operations: Distractors", () => {
  it("are whole numbers, distinct and never the Answer, and a classic slip is usually among them", () => {
    let leftToRightOffered = 0;
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        // an expression made only of 2s, like (2^2)^2 or 2 - 2 \\div 2, is the natural limit: the slips coincide
        const allTwos = /^[^0-9]*2([^0-9]+2)*[^0-9]*$/.test(p.prompt);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(allTwos ? 3 : 4);
        expect(new Set(p.distractorHints.map(choiceKey)).size).toBe(p.distractorHints.length);
        for (const d of p.distractorHints) {
          expect(d).toMatch(/^-?\d+$/);
          expect(d).not.toBe(p.answer);
        }
        // working left to right, or ignoring the parentheses: the classic slips
        const classic = [wrongValue(k, "leftToRight"), wrongValue(k, "ignoredParentheses")];
        if (classic.some((v) => v !== null && v !== k.answer)) leftToRightOffered++;
      }),
      { numRuns: 200 },
    );
    expect(leftToRightOffered).toBeGreaterThan(100);
  });

  it("model the real mistakes", () => {
    // 2 + 3 \times 4 = 14: left to right gives 20
    const k: OrderConstruction = { tree: bin("+", num(2), bin("*", num(3), num(4), 12), 14), answer: 14 };
    expect(distractors(k)).toContain("9"); // added 3 and 4, then added 2
    expect(distractors(k)[0]).toBe("20");
    // 12 - 2 + 3 = 13: "addition before subtraction" gives 7
    const pemdas: OrderConstruction = { tree: bin("+", bin("-", num(12), num(2), 10), num(3), 13), answer: 13 };
    expect(wrongValue(pemdas, "pemdasLiteral")).toBe(7);
    // 2 \times 3^2 = 18: the power as a product gives 12
    const pow: OrderConstruction = { tree: bin("*", num(2), { kind: "pow", base: num(3), exp: 2, value: 9 }, 18), answer: 18 };
    expect(wrongValue(pow, "powerAsProduct")).toBe(12);
    // ... or over the product before it gives 36
    expect(wrongValue(pow, "powerOverProduct")).toBe(36);
    // (-3)^2 = 9 squared as -9; 5 - (-3) = 8 worked as 2
    const negPow: OrderConstruction = { tree: { kind: "pow", base: num(-3), exp: 2, value: 9 }, answer: 9 };
    expect(wrongValue(negPow, "negativeBase")).toBe(-9);
    const subNeg: OrderConstruction = { tree: bin("-", num(5), num(-3), 8), answer: 8 };
    expect(wrongValue(subNeg, "subtractNegative")).toBe(2);
    // 12 \div 2 \times 3 = 18: right to left gives 2
    const rtl: OrderConstruction = { tree: bin("*", bin("/", num(12), num(2), 6), num(3), 18), answer: 18 };
    expect(wrongValue(rtl, "rightToLeft")).toBe(2);
    // 2 \times (3 + 4) = 14: ignoring the parentheses gives 10
    const grp: OrderConstruction = { tree: bin("*", num(2), bin("+", num(3), num(4), 7), 14), answer: 14 };
    expect(wrongValue(grp, "ignoredParentheses")).toBe(10);
    expect(evaluateTokens(tokens(grp.tree), { "+": 1, "-": 1, "*": 2, "/": 2 })!.n).toBe(14);
  });
});

describe("order-of-operations: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({}, s).prompt));
    expect(prompts.size).toBeGreaterThan(180);
  });
});
