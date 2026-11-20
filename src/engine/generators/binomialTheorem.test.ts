import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { proseSegments } from "../format";
import { construct, distractors, generator, MAX_COEFFICIENT, MAX_EXPAND_POWER } from "./binomialTheorem";
import { evalLatex } from "./latexEval.testkit";
import { expectKatex, expectTidy, proseOf, readCount } from "./matrices.testkit";
import { nCr } from "./counting.testUtil";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  task: fc.constantFrom("expand", "term", "coefficient", "mixed"),
  maxPower: fc.integer({ min: 3, max: 8 }),
  twoVariables: fc.boolean(),
});

/** The prompt's math runs, in order. */
const mathOf = (prompt: string): string[] =>
  proseSegments(prompt)
    .filter((s) => s.kind === "math")
    .map((s) => (s as { latex: string }).latex.trim())
    .filter(Boolean);

/** "(2x - 3y)^{5}" -> a, b, n, two variables */
function readBinomial(latex: string): { a: number; b: number; n: number; y: boolean } {
  const m = latex.match(/^\((\d*)x ([+-]) (\d*)(y?)\)\^\{(\d+)\}$/);
  if (!m) throw new Error(`not a binomial power: ${latex}`);
  const a = m[1] === "" ? 1 : Number(m[1]);
  const mag = m[3] === "" ? 1 : Number(m[3]);
  return { a, b: m[2] === "-" ? -mag : mag, n: Number(m[5]), y: m[4] === "y" };
}

/** "-1080x^{2}y^{3}" -> coefficient and powers */
function readMonomial(latex: string): { c: number; px: number; py: number } {
  const m = latex.match(/^(-?)(\d*)(x(?:\^\{(\d+)\})?)?(y(?:\^\{(\d+)\})?)?$/);
  if (!m) throw new Error(`not a monomial: ${latex}`);
  const mag = m[2] === "" ? 1 : Number(m[2]);
  return {
    c: (m[1] ? -1 : 1) * mag,
    px: m[3] ? Number(m[4] ?? 1) : 0,
    py: m[5] ? Number(m[6] ?? 1) : 0,
  };
}

const ORDINAL = /the (\d+)(st|nd|rd|th) term/;

describe("binomial-theorem: answers", () => {
  it("an expansion equals the power at sample points, and a term or coefficient is C(n, k) a^(n-k) b^k", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const [lead] = proseOf(p.prompt).split(" ");
        const math = mathOf(p.prompt);
        const power = math[math.length - 1];
        const { a, b, n, y } = readBinomial(power);
        expect(y).toBe(params.twoVariables);
        if (lead === "Expand") {
          for (const [x, yv] of [
            [2, 3],
            [-1, 0.5],
            [0.3, -1.7],
          ]) {
            const want = evalLatex(power, { x, y: yv });
            expect(Math.abs(evalLatex(p.answer, { x, y: yv }) - want)).toBeLessThan(1e-6 * Math.max(1, Math.abs(want)));
          }
          return;
        }
        let k: number;
        if (lead === "Find" && ORDINAL.test(proseOf(p.prompt))) {
          k = Number(proseOf(p.prompt).match(ORDINAL)![1]) - 1;
          const t = readMonomial(p.answer);
          expect(t.px).toBe(n - k);
          expect(t.py).toBe(y ? k : 0);
          expect(t.c).toBe(nCr(n, k) * a ** (n - k) * b ** k);
        } else {
          const target = readMonomial(math[0]);
          expect(target.c).toBe(1);
          k = n - target.px;
          if (y) expect(target.py).toBe(k);
          expect(readCount(p.answer)).toBe(nCr(n, k) * a ** (n - k) * b ** k);
        }
      }),
    );
  });

  it("prints tidy LaTeX that renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const s of [p.prompt, p.answer, ...p.distractorHints]) expectTidy(s);
        expectKatex(p.prompt);
        expectKatex(p.answer);
      }),
    );
  });
});

describe("binomial-theorem: Topic Options", () => {
  it("gives the task asked for, powers up to Highest power (expansions up to 6), and modest coefficients", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.task !== "mixed") expect(k.task).toBe(params.task);
        expect(k.n).toBeGreaterThanOrEqual(3);
        expect(k.n).toBeLessThanOrEqual(k.task === "expand" ? Math.min(params.maxPower, MAX_EXPAND_POWER) : params.maxPower);
        expect(k.k).toBeGreaterThanOrEqual(1);
        expect(k.k).toBeLessThanOrEqual(k.n - 1);
        for (let i = 0; i <= k.n; i++) expect(Math.abs(nCr(k.n, i) * k.a ** (k.n - i) * k.b ** i)).toBeLessThanOrEqual(MAX_COEFFICIENT);
        // never (x + y)^n or (x - 1)^n, where most slips vanish
        expect(Math.abs(k.a) + Math.abs(k.b)).toBeGreaterThanOrEqual(3);
      }),
    );
  });
});

describe("binomial-theorem: distractors", () => {
  it("are distinct, never the Answer, in the Answer's shape, and at least two", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(2);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        const k = construct(params, createRng(seed));
        for (const d of p.distractorHints) {
          if (k.task === "coefficient") readCount(d.replace(/^-/, ""));
          if (k.task === "term") readMonomial(d);
        }
      }),
    );
  });

  it("model the freshman's dream, a missing binomial coefficient and the term one place off", () => {
    const base = { a: 2, b: -3, n: 5, twoVariables: true, k: 3 };
    const expand = distractors({ ...base, task: "expand" });
    expect(expand[0]).toBe("32x^{5} - 243y^{5}");
    expect(expand[1]).toBe("32x^{5} - 48x^{4}y + 72x^{3}y^{2} - 108x^{2}y^{3} + 162xy^{4} - 243y^{5}");
    // the 4th term of (2x - 3y)^5 is -1080x^2y^3; the 5th is 810xy^4
    expect(distractors({ ...base, task: "term" })[0]).toBe("810xy^{4}");
  });
});

describe("binomial-theorem: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const task of ["expand", "term", "coefficient"]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ task }, s).prompt));
      expect(prompts.size, task).toBeGreaterThan(40);
    }
  });
});
