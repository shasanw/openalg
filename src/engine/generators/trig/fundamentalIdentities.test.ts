import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { choiceKey } from "../../mc";
import { anySeed, expectRenders } from "./trig.testkit";
import { construct, generator, PYTHAGOREAN, type Level, type ProblemType } from "./fundamentalIdentities";

const anyParams = fc.record({
  problemType: fc.constantFrom<ProblemType>("simplify", "values", "mixed"),
  level: fc.constantFrom<Level>("reciprocal", "pythagorean", "sums"),
  evenOdd: fc.boolean(),
  radicals: fc.boolean(),
});

describe("fundamental-identities: answers", () => {
  it("an Answer is a single function, or ±1, never the expression itself", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, problemType: "simplify" }, seed);
        expect(p.answer).toMatch(/^-?(1|\\(sin|cos|tan|csc|sec|cot) x)$/);
        expect(choiceKey(p.prompt)).not.toBe(choiceKey(p.answer));
        // at least two functions to combine: never already the simplest form
        expect((p.prompt.match(/\\(sin|cos|tan|csc|sec|cot)/g) ?? []).length).toBeGreaterThanOrEqual(2);
      }),
    );
  });

  it("renders and is deterministic", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectRenders(p.prompt);
        expectRenders(p.answer);
        p.distractorHints.forEach(expectRenders);
        expect(generator.generate(params, seed)).toEqual(p);
      }),
    );
  });
});

describe("fundamental-identities: Topic Options", () => {
  it("gives the kind of Problem asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.problemType !== "mixed") expect(k.type).toBe(params.problemType);
      }),
    );
    const types = Array.from({ length: 40 }, (_, s) => construct({ problemType: "mixed" }, createRng(s)).type);
    expect(new Set(types).size).toBe(2);
  });

  it("uses only the identities of the chosen level", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, problemType: "simplify" }, createRng(seed));
        if (k.type !== "simplify") throw new Error("expected simplify");
        const tex = generator.generate({ ...params, problemType: "simplify" }, seed).prompt;
        const binomial = PYTHAGOREAN.some((b) => tex.includes(b.tex));
        if (k.level === "reciprocal") {
          expect(k.expr.kind).toBe("product");
          expect(tex).not.toContain("^{2}");
        }
        if (k.level === "pythagorean") {
          expect(k.expr.kind).toBe("product");
          expect(binomial).toBe(true);
        }
        if (k.level === "sums") expect(k.expr.kind).not.toBe("product");
      }),
    );
  });

  it("uses even-odd and cofunction forms only when asked, and then in every product or sum", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, problemType: "simplify" }, seed);
        const disguised = /\\left\(-x\\right\)|\\frac\{\\pi\}\{2\} - x/.test(p.prompt);
        const conjugate = p.prompt.includes("1 - \\sin x}") || /\{1 [+-] \\(sin|cos) x\}/.test(p.prompt);
        if (!params.evenOdd) expect(disguised).toBe(false);
        else if (!conjugate) expect(disguised).toBe(true);
      }),
    );
  });

  it("gives radicals in the values only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, problemType: "values", radicals: false }, seed);
        expect(p.answer).not.toContain("\\sqrt");
        const q = generator.generate({ ...params, problemType: "values", radicals: true }, seed);
        expect(q.prompt).not.toContain("\\sqrt");
      }),
    );
    const some = Array.from({ length: 20 }, (_, s) => generator.generate({ problemType: "values", radicals: true }, s));
    expect(some.some((p) => p.answer.includes("\\sqrt"))).toBe(true);
  });
});
