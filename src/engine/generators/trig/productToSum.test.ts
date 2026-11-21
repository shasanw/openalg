import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { anySeed, expectRenders } from "./trig.testkit";
import { construct, generator, type ProblemType, type Units } from "./productToSum";
import { isStandard } from "./trigKit";
import { add, sub } from "../shared/equationKit";

const anyParams = fc.record({
  problemType: fc.constantFrom<ProblemType>("toSum", "toProduct", "exact", "mixed"),
  units: fc.constantFrom<Units>("degrees", "radians", "mixed"),
});

describe("product-to-sum: answers", () => {
  it("writes a product as a sum and a sum as a product, in the canonical forms", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        if (k.type === "toSum") {
          // (½ or nothing) then two terms, positive first, arguments positive
          expect(p.answer).toMatch(
            /^(\\frac\{1\}\{2\}\\left\()?\\(sin|cos) (\d*)x [+-] \\(sin|cos) (\d*)x(\\right\))?$/,
          );
          expect(p.answer).not.toContain("-x");
          const args = [...p.answer.matchAll(/\\(?:sin|cos) (\d*)x/g)].map((m) => Number(m[1] || 1));
          if (!/ - /.test(p.answer)) expect(args[0]).toBeGreaterThan(args[1]);
        }
        if (k.type === "toProduct") {
          expect(p.prompt).toMatch(/^\\(sin|cos) \d+x [+-] \\(sin|cos) \d*x$/);
          expect(p.answer).toMatch(/^-?2\\(sin|cos) \d+x \\(sin|cos) \d*x$/);
        }
      }),
    );
  });

  it("asks for exact values only at angles that need an identity", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (k.type === "exactProduct") {
          expect(isStandard(k.A) || isStandard(k.B)).toBe(false);
          expect(isStandard(add(k.A, k.B)) && isStandard(sub(k.A, k.B))).toBe(true);
        }
        if (k.type === "exactSum") {
          expect(isStandard(add(k.p, k.q)) || isStandard(sub(k.p, k.q))).toBe(false);
          expect(isStandard(k.p) && isStandard(k.q)).toBe(true);
        }
        if (k.type === "exactProduct" || k.type === "exactSum") expect(generator.generate(params, seed).answer).not.toBe("0");
      }),
    );
  });

  it("renders and is deterministic", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        [p.prompt, p.answer, ...p.distractorHints].forEach(expectRenders);
        expect(generator.generate(params, seed)).toEqual(p);
      }),
    );
  });
});

describe("product-to-sum: Topic Options", () => {
  it("gives the kind of Problem asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.problemType === "exact") expect(["exactProduct", "exactSum"]).toContain(k.type);
        else if (params.problemType !== "mixed") expect(k.type).toBe(params.problemType);
      }),
    );
    const types = Array.from({ length: 60 }, (_, s) => construct({ problemType: "mixed" }, createRng(s)).type);
    expect(new Set(types).size).toBe(4);
  });

  it("writes exact-value angles in the units asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const deg = generator.generate({ ...params, problemType: "exact", units: "degrees" }, seed).prompt;
        expect(deg).toContain("^{\\circ}");
        expect(deg).not.toContain("\\pi");
        const rad = generator.generate({ ...params, problemType: "exact", units: "radians" }, seed).prompt;
        expect(rad).toContain("\\pi");
      }),
    );
  });
});
