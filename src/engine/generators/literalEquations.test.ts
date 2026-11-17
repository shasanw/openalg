import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import {
  CATALOGUE,
  construct,
  entriesFor,
  evaluate,
  generator,
  parse,
  toLatex,
  variables,
  type Entry,
  type Source,
  type Steps,
} from "./literalEquations";
import { close, evalLatex, splitEquation } from "./latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const SOURCES: Source[] = ["mixed", "formulas", "equations"];
const STEPS: Steps[] = ["any", "one", "multi"];
const anyParams = fc.record({ source: fc.constantFrom(...SOURCES), steps: fc.constantFrom(...STEPS) });

/** Deterministic positive sample values for every name (no zero divisors). */
function envs(names: Iterable<string>, count = 5): Record<string, number>[] {
  const rng = createRng(12345);
  return Array.from({ length: count }, () => {
    const env: Record<string, number> = {};
    for (const n of names) env[n] = 1.5 + rng.next() * 8;
    return env;
  });
}

/** The variable names in printed LaTeX, as the evaluator spells them (b_1). */
function latexNames(latex: string): Set<string> {
  const bare = latex.replace(/\\text\{[^}]*\}/g, "").replace(/\\[a-zA-Z]+/g, "");
  return new Set([...bare.matchAll(/([a-zA-Z])(?:_\{?(\d+)\}?)?/g)].map((m) => (m[2] ? `${m[1]}_${m[2]}` : m[1])));
}

const forPart = /, \\text\{ for \} (.+)$/;

describe("literal-equations: catalogue", () => {
  const label = (e: Entry) => `${e.lhs} = ${e.rhs} for ${e.target}`;

  it("every Answer satisfies its equation", () => {
    for (const e of CATALOGUE) {
      const [lhs, rhs, answer] = [parse(e.lhs), parse(e.rhs), parse(e.answer)];
      const others = new Set([...variables(lhs), ...variables(rhs)]);
      expect(others.has(e.target), label(e)).toBe(true);
      others.delete(e.target);
      expect([...variables(answer)].every((n) => others.has(n)), label(e)).toBe(true);
      for (const env of envs(others)) {
        const full = { ...env, [e.target]: evaluate(answer, env) };
        expect(close(evaluate(lhs, full), evaluate(rhs, full)), label(e)).toBe(true);
      }
    }
  });

  it("every wrong form is really wrong, and no two wrong forms are the same", () => {
    for (const e of CATALOGUE) {
      const answer = parse(e.answer);
      const names = new Set([...variables(parse(e.lhs)), ...variables(parse(e.rhs))]);
      names.delete(e.target);
      const samples = envs(names);
      const values = (x: string) => samples.map((env) => evaluate(parse(x), env));
      const sameAs = (a: number[], b: number[]) => a.every((v, i) => close(v, b[i]));
      const seen = [values(e.answer)];
      expect(e.wrong.length, label(e)).toBeGreaterThanOrEqual(4);
      for (const w of e.wrong) {
        expect([...variables(parse(w))].every((n) => names.has(n)), `${label(e)}: ${w}`).toBe(true);
        const v = values(w);
        for (const s of seen) expect(sameAs(v, s), `${label(e)}: ${w}`).toBe(false);
        seen.push(v);
      }
      expect(toLatex(answer)).not.toBe("");
    }
  });

  it("has enough entries for every combination of Topic Options", () => {
    for (const source of SOURCES)
      for (const steps of STEPS) expect(entriesFor(source, steps).length, `${source}/${steps}`).toBeGreaterThanOrEqual(5);
  });
});

describe("literal-equations: generated Problems", () => {
  it("the printed Answer satisfies the printed equation, for any seed and options", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const m = p.prompt.match(forPart)!;
        expect(m).not.toBeNull();
        const target = m[1].replace(/_\{(\d+)\}/, "_$1");
        const [lhs, rhs] = splitEquation(p.prompt.replace(forPart, ""));
        const [answerVar, answerRhs] = splitEquation(p.answer);
        expect(answerVar.replace(/_\{(\d+)\}/, "_$1")).toBe(target);
        const names = latexNames(p.prompt.replace(forPart, ""));
        expect(names.has(target)).toBe(true);
        names.delete(target);
        // the Answer is written in the other letters only
        for (const n of latexNames(answerRhs)) expect(names.has(n)).toBe(true);
        for (const env of envs(names, 3)) {
          const full = { ...env, [target]: evalLatex(answerRhs, env) };
          expect(close(evalLatex(lhs, full), evalLatex(rhs, full))).toBe(true);
        }
      }),
    );
  });

  it("honours the source and number of steps", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const pool = entriesFor(params.source, params.steps);
        // the drawn entry is in the pool (compare by structure, up to letters)
        const shape = (lhs: string) => lhs.replace(/[a-z]/g, "?");
        const printed = shape(toLatex(k.lhs) + "=" + toLatex(k.rhs));
        expect(pool.some((e) => shape(toLatex(parse(e.lhs)) + "=" + toLatex(parse(e.rhs))) === printed)).toBe(true);
      }),
    );
  });

  it("offers at least four distinct Distractors, none the Answer", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        expect(p.distractorHints).not.toContain(p.answer);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
      }),
    );
  });

  it("renders the textbook way", () => {
    const find = (target: string, lhs: string) =>
      CATALOGUE.find((e) => e.target === target && e.lhs === lhs && e.source === "formulas")!;
    const half = find("h", "A");
    expect(toLatex(parse(half.rhs))).toBe("\\frac{1}{2}bh");
    expect(toLatex(parse(half.answer))).toBe("\\frac{2A}{b}");
    expect(toLatex(parse("pi*r^2*h"))).toBe("\\pi r^{2}h");
    expect(toLatex(parse("1/2*h*(b1 + b2)"))).toBe("\\frac{1}{2}h(b_{1} + b_{2})");
    expect(toLatex(parse("5/9*(F - 32)"))).toBe("\\frac{5}{9}(F - 32)");
  });

  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const source of SOURCES) {
      const prompts = new Set(Array.from({ length: 100 }, (_, s) => generator.generate({ source }, s).prompt));
      expect(prompts.size, source).toBeGreaterThanOrEqual(25);
    }
  });
});
