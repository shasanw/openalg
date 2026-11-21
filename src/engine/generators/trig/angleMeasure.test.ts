import { angleMeasure, givenOf, readDms, readDecimalDegrees } from "./angleMeasure.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { rat } from "../shared/equationKit";
import { forEachOptionSeed, anySeed, evalTrig, expectRenders } from "./trig.testkit";
import { construct, distractors, generator, type AngleMeasureConstruction } from "./angleMeasure";
import { fromDegrees } from "./trigKit";

const anyParams = fc.record({
  problems: fc.constantFrom("coterminal", "location", "reference", "dms", "mixed"),
  units: fc.constantFrom("degrees", "radians", "mixed"),
  angles: fc.constantFrom("standard", "any"),
});

describe("angle-measure: answers", () => {
  it("are correct for the angle printed in the prompt", () => {
    forEachOptionSeed(generator.schema, (seed, params) => {
      angleMeasure(generator.generate(params, seed));
    });
  });
});

describe("angle-measure: Topic Options", () => {
  it("gives the problems and units asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        if (params.problems !== "mixed") expect(k.problem).toBe(params.problems);
        if (k.problem === "dms") return;
        if (params.units !== "mixed") expect(k.unit).toBe(params.units);
        const tex = givenOf(p.prompt) + p.answer;
        if (k.unit === "degrees") expect(tex).not.toContain("\\pi");
        else expect(tex).not.toContain("\\circ");
      }),
    );
    const problems = new Set(Array.from({ length: 80 }, (_, s) => construct({}, createRng(s)).problem));
    expect(problems.size).toBe(4);
  });

  it("uses only multiples of 30° and 45° when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, angles: "standard" }, createRng(seed));
        if (k.problem === "dms") return;
        expect([1, 2, 3, 4, 6]).toContain(k.given.d);
      }),
    );
    const some = Array.from({ length: 60 }, (_, s) => construct({ problems: "reference", angles: "any" }, createRng(s)));
    expect(some.some((k) => k.problem !== "dms" && ![1, 2, 3, 4, 6].includes(k.given.d))).toBe(true);
  });

  it("asks about quadrantal angles only for the location", () => {
    const quadrantal = (k: AngleMeasureConstruction) => k.problem !== "dms" && (2 * k.given.n) % k.given.d === 0;
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (k.problem !== "location") expect(quadrantal(k)).toBe(false);
      }),
    );
    const some = Array.from({ length: 100 }, (_, s) => construct({ problems: "location" }, createRng(s)));
    expect(some.some(quadrantal)).toBe(true);
  });
});

describe("angle-measure: distractors", () => {
  it("are distinct, never the Answer, and at least four", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const k = construct(params, createRng(seed));
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        const value = (s: string) => {
          if (k.problem === "dms") return (k.toDecimal ? readDecimalDegrees(s) : readDms(s)).toFixed(9);
          if (k.problem === "location") return s;
          return s.split(ANSWER_PART_SEPARATOR).map(x => evalTrig(x).toFixed(9)).join(",");
        };
        const values = [p.answer, ...p.distractorHints].map(value);
        expect(new Set(values).size).toBe(values.length);
      }),
    );
  });

  it("model the usual slips", () => {
    // 25° 30' 18'' is 25.505°, not 25.3018°
    const dms = { problem: "dms", toDecimal: true, deg: 25, min: 30, sec: 18 } as const;
    expect(distractors(dms)[0]).toBe("25.3018^{\\circ}");
    expect(distractors({ ...dms, toDecimal: false })[0]).toBe("25^{\\circ} 50' 50''");
    // -45° is coterminal with 315°; dropping the sign gives 45°
    const k = { problem: "coterminal", task: "between", unit: "degrees", base: fromDegrees(315), given: fromDegrees(-45) } as const;
    expect(distractors(k)).toContain("45^{\\circ}");
    // the reference angle of 150° is 30°, not 150° or 60°
    const r = { problem: "reference", unit: "degrees", base: rat(5, 6), given: rat(5, 6) } as const;
    expect(distractors(r).slice(0, 2)).toEqual(["150^{\\circ}", "60^{\\circ}"]);
  });
});

describe("angle-measure: generate()", () => {
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
    for (const problems of ["coterminal", "location", "reference", "dms"]) {
      for (const angles of ["standard", "any"]) {
        const prompts = new Set(Array.from({ length: 100 }, (_, s) => generator.generate({ problems, angles }, s).prompt));
        expect(prompts.size, `${problems} ${angles}`).toBeGreaterThan(30);
      }
    }
  });
});
