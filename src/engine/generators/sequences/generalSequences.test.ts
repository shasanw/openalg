import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, MAX_PRINTED } from "./generalSequences";
import { rat } from "./sequenceKit";
import { close, evalLatex } from "../shared/latexEval.testkit";
import { askedIndex, expectKatex, expectTidy, parseList, printedNumbers, splitAsk } from "./sequences.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  rule: fc.constantFrom("explicit", "recursive", "mixed"),
  ask: fc.constantFrom("firstTerms", "term", "mixed"),
  allowNegatives: fc.boolean(),
});

/** The terms a printed rule gives, a_1 to a_last, read from the prompt alone. */
function termsFromRule(rule: string, last: number): number[] {
  if (!rule.includes("a_{n-1}")) {
    const expr = rule.replace(/^a_n = /, "");
    return Array.from({ length: last }, (_, i) => evalLatex(expr, { n: i + 1 }));
  }
  const parts = rule.split(",\\ ");
  const step = parts.pop()!.replace(/^a_n = /, "").replace(/a_\{n-1\}/g, "P").replace(/a_\{n-2\}/g, "Q");
  const terms = parts.map((p) => evalLatex(p.replace(/^a_\d = /, "")));
  while (terms.length < last) {
    const n = terms.length + 1;
    terms.push(evalLatex(step, { n, P: terms[n - 2], Q: terms[n - 3] ?? NaN }));
  }
  return terms;
}

/** The Answer the printed prompt asks for, worked out from the printed rule. */
function expectedAnswer(prompt: string): number[] {
  const [rule, ask] = splitAsk(prompt);
  const k = askedIndex(ask);
  if (k !== null) return [termsFromRule(rule, k)[k - 1]];
  const m = ask.match(/^\\text\{first (\d) terms\}$/)!;
  return termsFromRule(rule, Number(m[1]));
}

const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => close(x, b[i]));

describe("general-sequences: answers", () => {
  it("the Answer is what the printed rule gives", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(sameList(parseList(p.answer), expectedAnswer(p.prompt)), `${p.prompt} => ${p.answer}`).toBe(true);
      }),
    );
  });

  it("prints tidy rules, modest numbers, and renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const s of [p.prompt, p.answer, ...p.distractorHints]) expectTidy(s);
        for (const s of [p.prompt, p.answer]) {
          expectKatex(s);
          for (const n of printedNumbers(s)) expect(n).toBeLessThanOrEqual(MAX_PRINTED);
        }
      }),
    );
  });
});

describe("general-sequences: Topic Options", () => {
  it("uses the kind of rule asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const recursive = p.prompt.includes("a_{n-1}");
        if (params.rule === "explicit") expect(recursive).toBe(false);
        if (params.rule === "recursive") expect(recursive).toBe(true);
      }),
    );
    const kinds = new Set(Array.from({ length: 40 }, (_, s) => construct({}, createRng(s)).rule));
    expect(kinds).toEqual(new Set(["explicit", "recursive"]));
  });

  it("asks for what was chosen", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const term = askedIndex(splitAsk(p.prompt)[1]) !== null;
        if (params.ask === "term") expect(term).toBe(true);
        if (params.ask === "firstTerms") expect(term).toBe(false);
      }),
    );
  });

  it("prints no negative numbers or alternating signs when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        expect(p.answer).not.toContain("-");
        const bare = p.prompt.replace(/[_^]\{[^}]*\}/g, "");
        expect(bare, p.prompt).not.toMatch(/(^|=|\(|,)\s*-/);
      }),
    );
  });
});

describe("general-sequences: distractors", () => {
  it("are distinct, never the Answer, and at least two", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(2);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        const answer = parseList(p.answer);
        for (const d of p.distractorHints) expect(sameList(parseList(d), answer)).toBe(false);
      }),
    );
  });

  it("model the order-of-operations and index mistakes", () => {
    // a_n = 3 \cdot 2^{n-1}: (3 \cdot 2)^{n-1} first, then the exponent n
    const k = construct({ rule: "explicit", ask: "firstTerms" }, createRng(0));
    const exp = {
      ...k,
      rule: "explicit" as const,
      form: "exponential",
      ruleLatex: "a_n = 3 \\cdot 2^{n-1}",
      seq: (n: number) => rat(3 * 2 ** (n - 1)),
      mistakes: [(n: number) => rat(6 ** (n - 1)), (n: number) => rat(3 * 2 ** n)],
      ask: "firstTerms" as const,
      count: 4,
    };
    expect(distractors(exp).slice(0, 3)).toEqual(["1, 6, 36, 216", "6, 12, 24, 48", "\\frac{3}{2}, 3, 6, 12"]);
  });
});

describe("general-sequences: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const rule of ["explicit", "recursive"]) {
      for (const allowNegatives of [true, false]) {
        const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ rule, allowNegatives }, s).prompt));
        expect(prompts.size, `${rule} ${allowNegatives}`).toBeGreaterThan(100);
      }
    }
  });
});
