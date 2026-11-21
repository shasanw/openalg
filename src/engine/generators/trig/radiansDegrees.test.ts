import { radiansDegrees } from "./radiansDegrees.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { forEachOptionSeed, anySeed, evalTrig, expectRenders } from "./trig.testkit";
import { construct, distractors, generator } from "./radiansDegrees";
import { fromDegrees } from "./trigKit";

const anyParams = fc.record({
  direction: fc.constantFrom("toRadians", "toDegrees", "both"),
  angles: fc.constantFrom("standard", "15", "5"),
  wide: fc.boolean(),
  nonPi: fc.boolean(),
});

describe("radians-degrees: answers", () => {
  it("the Answer is the same angle as the prompt, in the other unit", () => {
    forEachOptionSeed(generator.schema, (seed, params) => {
      radiansDegrees(generator.generate(params, seed));
    });
  });
});

describe("radians-degrees: Topic Options", () => {
  it("converts the way asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        if (params.direction === "toRadians") expect(p.prompt).toContain("\\circ");
        if (params.direction === "toDegrees") expect(p.prompt).not.toContain("\\circ");
      }),
    );
    const prompts = Array.from({ length: 40 }, (_, s) => generator.generate({}, s).prompt);
    expect(prompts.some((s) => s.includes("\\circ"))).toBe(true);
    expect(prompts.some((s) => s.includes("\\pi"))).toBe(true);
  });

  it("uses the angles asked for, and negative or large ones only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (k.kind === "decimal") {
          expect(params.nonPi).toBe(true);
          if (!params.wide) expect(k.radians > 0 && k.radians < 2 * Math.PI).toBe(true);
          return;
        }
        const deg = (k.a.n * 180) / k.a.d;
        const step = params.angles === "5" ? 5 : params.angles === "15" ? 15 : null;
        if (step) expect(Math.abs(deg % step)).toBe(0);
        else expect(deg % 30 === 0 || deg % 45 === 0).toBe(true);
        if (!params.wide) {
          expect(deg).toBeGreaterThan(0);
          expect(deg).toBeLessThanOrEqual(360);
        }
      }),
    );
    const degs = Array.from({ length: 100 }, (_, s) => construct({ wide: true, angles: "5" }, createRng(s)))
      .map((k) => (k.kind === "exact" ? (k.a.n * 180) / k.a.d : 0));
    expect(degs.some((d) => d < 0)).toBe(true);
    expect(degs.some((d) => d > 360)).toBe(true);
    expect(degs.some((d) => d % 15 !== 0)).toBe(true);
  });

  it("uses radian measures without π only when asked", () => {
    const some = Array.from({ length: 60 }, (_, s) => construct({ nonPi: true, direction: "toDegrees" }, createRng(s)));
    expect(some.some((k) => k.kind === "decimal")).toBe(true);
    for (let s = 0; s < 60; s++) expect(construct({ nonPi: false }, createRng(s)).kind).toBe("exact");
  });
});

describe("radians-degrees: distractors", () => {
  it("are distinct, never the Answer's value, and at least four", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        const values = [p.answer, ...p.distractorHints].map(s => evalTrig(s).toFixed(9));
        expect(new Set(values).size).toBe(values.length);
      }),
    );
  });

  it("model the usual slips", () => {
    // 150° = 5π/6: not 5/6 (π dropped) or 27000/π (factor flipped)
    const k = { kind: "exact", toRadians: true, a: fromDegrees(150) } as const;
    expect(distractors(k).slice(0, 2)).toEqual(["\\frac{5}{6}", "\\frac{27000}{\\pi}"]);
    // 5π/6 = 150°: not 150π°, 300° or 75°, and flipped 216°
    const back = distractors({ ...k, toRadians: false });
    expect(back).toEqual(["150\\pi^{\\circ}", "300^{\\circ}", "75^{\\circ}", "216^{\\circ}", "50^{\\circ}"]);
  });
});

describe("radians-degrees: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("prompt, answer and distractors render with KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const tex of [p.prompt, p.answer, ...p.distractorHints]) expectRenders(tex);
      }),
      { numRuns: 100 },
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const angles of ["standard", "15", "5"]) {
      const prompts = new Set(Array.from({ length: 100 }, (_, s) => generator.generate({ angles }, s).prompt));
      expect(prompts.size, angles).toBeGreaterThan(25);
    }
  });
});
