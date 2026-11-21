import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { anySeed, expectRenders } from "./trig.testkit";
import { construct, generator, split, type ProblemType, type Units } from "./sumDifferenceIdentities";
import { isStandard } from "./trigKit";
import { rat, ratEq, add, mul } from "../shared/equationKit";

const anyParams = fc.record({
  problemType: fc.constantFrom<ProblemType>("exact", "expression", "given", "mixed"),
  units: fc.constantFrom<Units>("degrees", "radians", "mixed"),
  tangent: fc.boolean(),
});

describe("sum-difference-identities: answers", () => {
  it("asks only for angles that need an identity", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (k.type === "exact") expect(isStandard(k.angle)).toBe(false);
        if (k.type === "expression") {
          expect(isStandard(k.A) || isStandard(k.B)).toBe(false);
          expect(isStandard(k.R)).toBe(true);
          expect(ratEq(add(k.A, mul(rat(k.op), k.B)), k.R)).toBe(true);
        }
        if (k.type === "given") expect(generator.generate(params, seed).answer).not.toBe("0");
      }),
    );
  });

  it("splits angles into standard ones the usual way", () => {
    expect(split(rat(5, 12), "sin")).toEqual({ A: rat(1, 4), B: rat(1, 6), op: 1 });
    expect(split(rat(1, 12), "cos")).toEqual({ A: rat(1, 4), B: rat(1, 6), op: -1 });
    expect(split(rat(7, 12), "tan")).toEqual({ A: rat(1, 3), B: rat(1, 4), op: 1 });
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

describe("sum-difference-identities: Topic Options", () => {
  it("gives the kind of Problem asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.problemType !== "mixed") expect(k.type).toBe(params.problemType);
      }),
    );
    const types = Array.from({ length: 60 }, (_, s) => construct({ problemType: "mixed" }, createRng(s)).type);
    expect(new Set(types).size).toBe(3);
  });

  it("writes angles in the units asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const deg = generator.generate({ ...params, problemType: "exact", units: "degrees" }, seed).prompt;
        expect(deg).toContain("^{\\circ}");
        expect(deg).not.toContain("\\pi");
        const rad = generator.generate({ ...params, problemType: "expression", units: "radians" }, seed).prompt;
        expect(rad).toContain("\\pi");
        expect(rad).not.toContain("\\circ");
      }),
    );
  });

  it("uses tangent only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate({ ...params, tangent: false }, seed).prompt).not.toContain("\\tan");
      }),
    );
    const some = Array.from({ length: 30 }, (_, s) => generator.generate({ tangent: true }, s).prompt);
    expect(some.some((t) => t.includes("\\tan"))).toBe(true);
  });
});
