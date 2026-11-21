import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { choiceKey } from "../../mc";
import { anySeed, expectRenders } from "./trig.testkit";
import { construct, generator, type ProblemType, type Units } from "./multipleAngleIdentities";
import { isStandard } from "./trigKit";
import { mul, rat } from "../shared/equationKit";

const anyParams = fc.record({
  problemType: fc.constantFrom<ProblemType>("double", "half", "rewrite", "mixed"),
  units: fc.constantFrom<Units>("degrees", "radians", "mixed"),
  tangent: fc.boolean(),
});

describe("multiple-angle-identities: answers", () => {
  it("asks for half angles that are not standard, and rewrites that change the expression", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (k.type === "halfExact") {
          expect(isStandard(k.h)).toBe(false);
          expect(isStandard(mul(k.h, rat(2)))).toBe(true);
        }
        if (k.type === "rewrite" && k.angle) expect(isStandard(k.angle)).toBe(false);
        const p = generator.generate(params, seed);
        expect(choiceKey(p.prompt)).not.toBe(choiceKey(p.answer));
      }),
    );
  });

  it("gives half-angle sines and cosines as nested radicals and tangents without them", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, problemType: "half" }, createRng(seed));
        const p = generator.generate({ ...params, problemType: "half" }, seed);
        if (k.type === "halfExact") {
          if (k.fn === "tan") expect(p.answer).not.toMatch(/\\sqrt\{[^}]*\\sqrt/);
          else expect(p.answer).toMatch(/^-?\\frac\{\\sqrt\{2 [+-] \\sqrt\{[23]\}\}\}\{2\}$/);
        }
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

describe("multiple-angle-identities: Topic Options", () => {
  it("gives the kind of Problem asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.problemType === "half") expect(["halfExact", "halfGiven"]).toContain(k.type);
        else if (params.problemType !== "mixed") expect(k.type).toBe(params.problemType);
      }),
    );
    const types = Array.from({ length: 60 }, (_, s) => construct({ problemType: "mixed" }, createRng(s)).type);
    expect(new Set(types).size).toBe(4);
  });

  it("writes angles in the units asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, problemType: "half", units: "degrees" }, createRng(seed));
        const deg = generator.generate({ ...params, problemType: "half", units: "degrees" }, seed).prompt;
        if (k.type === "halfExact") expect(deg).toContain("^{\\circ}");
        expect(deg).not.toContain("\\pi");
        const rad = generator.generate({ ...params, problemType: "half", units: "radians" }, seed).prompt;
        expect(rad).not.toContain("\\circ");
      }),
    );
  });

  it("uses tangent only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, tangent: false }, seed);
        expect(p.prompt + p.answer).not.toContain("\\tan");
      }),
    );
    const some = Array.from({ length: 30 }, (_, s) => generator.generate({ tangent: true }, s).prompt);
    expect(some.some((t) => t.includes("\\tan"))).toBe(true);
  });
});
