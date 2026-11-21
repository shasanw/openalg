import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { choiceKey } from "../../mc";
import { evalLatex } from "../shared/latexEval.testkit";
import { generator } from "./rightTriangleRatios";
import { anySeed, expectRationalized, expectRenders } from "./trig.testkit";
import { parts, rightTriangleRatios, sidesOf } from "./rightTriangleRatios.answer.testkit";

const anyParams = fc.record({
  functions: fc.constantFrom("one", "primary", "all"),
  sides: fc.constantFrom("whole", "radical", "mixed"),
  missingSide: fc.constantFrom("none", "mixed", "always"),
  maxSide: fc.integer({ min: 5, max: 60 }),
});

describe("right-triangle-ratios: answers", () => {
  it("every printed ratio and the answer graph are recomputed from the labelled triangle", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => rightTriangleRatios(generator.generate(params, seed))),
      { numRuns: 400 },
    );
  });
});

describe("right-triangle-ratios: Topic Options", () => {
  it("are honoured", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const s = sidesOf(p);
        const n = parts(p.answer).length;
        expect(n).toBe({ one: 1, primary: 3, all: 6 }[params.functions]);
        if (params.functions === "primary") expect(parts(p.answer).map(([f]) => f)).toEqual(["sin", "cos", "tan"]);
        if (params.functions === "one" && s.missingRole) {
          const [fn] = parts(p.answer)[0];
          const used = { sin: ["opp", "hyp"], cos: ["adj", "hyp"], tan: ["opp", "adj"] };
          expect(used[fn as keyof typeof used]).toContain(s.missingRole);
        }
        const lengths = [s.opp, s.adj, s.hyp];
        expect(s.hyp).toBeLessThanOrEqual(params.maxSide + 1e-9);
        const irrational = lengths.filter((l) => Math.abs(l - Math.round(l)) > 1e-9).length;
        if (params.sides === "whole") expect(irrational).toBe(0);
        if (params.sides === "radical") expect(irrational).toBe(1);
        expect(irrational).toBeLessThanOrEqual(1);
        if (params.missingSide === "none") expect(s.missing).toBeNull();
        if (params.missingSide === "always") expect(s.missing).not.toBeNull();
        // a radical given side is printed as one (never a decimal)
        for (const l of s.labels) expect(l).not.toMatch(/\./);
      }),
      { numRuns: 300 },
    );
  });

  it("radical and missing-side options each actually happen in a mix", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const p = generator.generate({ sides: "mixed", missingSide: "mixed" }, seed);
      const s = sidesOf(p);
      seen.add(s.missing === null ? "given" : "missing");
      seen.add(s.labels.concat(p.answerGraph?.kind === "triangle" ? p.answerGraph.corners.map((c) => c.opposite?.text ?? "") : []).some((l) => l.includes("√")) ? "radical" : "whole");
    }
    expect([...seen].sort()).toEqual(["given", "missing", "radical", "whole"]);
  });
});

describe("right-triangle-ratios: Distractors", () => {
  it("are distinct, never the Answer (in value), and shaped like it", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const ans = parts(p.answer);
        const keys = new Set([choiceKey(p.answer)]);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        for (const d of p.distractorHints) {
          expect(keys.has(choiceKey(d)), d).toBe(false);
          keys.add(choiceKey(d));
          const dp = parts(d);
          expect(dp.map(([f]) => f)).toEqual(ans.map(([f]) => f));
          // some part differs in value, not just in spelling
          expect(dp.some(([, v], i) => Math.abs(evalLatex(v) - evalLatex(ans[i][1])) > 1e-9), d).toBe(true);
          for (const [, v] of dp) expectRationalized(v);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe("right-triangle-ratios: generator", () => {
  it("is seed-deterministic and renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(generator.generate(params, seed)).toEqual(p);
        expectRenders(p.prompt);
        expectRenders(p.answer);
        for (const d of p.distractorHints) expectRenders(d);
      }),
      { numRuns: 100 },
    );
  });
});
