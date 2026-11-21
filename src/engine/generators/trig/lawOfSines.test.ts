import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { choiceKey } from "../../mc";
import { ANSWER_PART_SEPARATOR } from "../../format";
import type { ParamValues } from "../../types";
import { generator, LAW_OF_SINES_ID } from "./lawOfSines";
import { anySeed, expectRenders } from "./trig.testkit";
import {
  expectAmbiguousRight,
  readSsaPrompt,
  expectDiagramProblemRight,
  expectGoodDistractors,
  printedValue,
} from "./oblique.testkit";

const anyParams = fc.record({
  problems: fc.constantFrom("mixed", "side", "angle", "ambiguous", "all"),
  solveTriangle: fc.boolean(),
  rounding: fc.constantFrom("tenth", "hundredth"),
});

const placesOf = (params: ParamValues) => (params.rounding === "hundredth" ? 2 : 1);
describe("law-of-sines", () => {
  it("is registered with its id, title and directions", () => {
    expect(generator.id).toBe(LAW_OF_SINES_ID);
    expect(generator.title).toBe("The Law of Sines");
    expect(generator.defaultDirections).toMatch(/Law of Sines/);
  });

  it("is pure and seed-deterministic", () => {
    fc.assert(
      fc.property(anyParams, anySeed, (params, seed) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
      { numRuns: 100 },
    );
  });

  it("every Answer matches the triangle solved independently from what is printed", () => {
    for (const problems of ["mixed", "side", "angle", "all", "ambiguous"])
      for (const solveTriangle of [true, false])
        for (const rounding of ["tenth", "hundredth"]) {
          const params = { problems, solveTriangle, rounding };
          fc.assert(fc.property(anySeed, seed => {
          const p = generator.generate(params, seed);
          const places = placesOf(params);
          const whole = params.solveTriangle;
          expect(p.prompt).toContain(places === 2 ? "nearest hundredth" : "nearest tenth");
          expectRenders(p.prompt);
          for (const part of p.answer.split(ANSWER_PART_SEPARATOR)) expectRenders(part);
          if (p.graph) {
            const r = expectDiagramProblemRight(p, places, whole);
            const angles = r.givens.angles.filter((x) => x !== null).length;
            if (params.problems === "side") expect(angles).toBe(2);
            if (params.problems === "angle") {
              expect(angles).toBe(1);
              // SSA with the given angle opposite the longer given side: one triangle, so the drawing cannot mislead
              const G = r.givens.angles.findIndex((x) => x !== null);
              const other = r.givens.sides.findIndex((x, v) => x !== null && v !== G);
              expect(r.givens.sides[G]!).toBeGreaterThan(r.givens.sides[other]!);
            }
            expect(params.problems).not.toBe("ambiguous");
          } else {
            // the ambiguous case has no diagram: one would show (or fake) an answer
            expect(["ambiguous", "all"]).toContain(params.problems);
            expect(p.answerGraph).toBeUndefined();
            expect(p.prompt).toContain("How many triangles are possible?");
            expectAmbiguousRight(p.prompt, p.answer, places, whole);
          }
          }), { numRuns: 40 });
        }
  }, 60_000);

  it("the ambiguous case gives no, one and two triangles, including an obtuse angle with no triangle", () => {
    const counts = new Set<number>();
    let obtuseNone = false;
    for (let seed = 1; seed <= 300; seed++) {
      const p = generator.generate({ problems: "ambiguous" }, seed);
      const n = expectAmbiguousRight(p.prompt, p.answer, 1, false);
      counts.add(n);
      const angle = Number(p.prompt.match(/= (\d+)\^\{\\circ\}/)![1]);
      if (n === 0 && angle > 90) {
        obtuseNone = true;
        // sin of the asked angle is still under 1: the trap is real
        const { givens, g, h } = readSsaPrompt(p.prompt);
        expect((givens.sides[h]! * Math.sin((angle * Math.PI) / 180)) / givens.sides[g]!).toBeLessThan(1);
      }
    }
    expect([...counts].sort()).toEqual([0, 1, 2]);
    expect(obtuseNone).toBe(true);
  });

  it("Distractors are distinct, never the Answer, and include the classic slips", () => {
    let obtuseOffered = 0;
    let acuteOnlyOffered = 0;
    let checked = 0;
    fc.assert(
      fc.property(anyParams, anySeed, (params, seed) => {
        const p = generator.generate(params, seed);
        expectGoodDistractors(p, choiceKey);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        for (const d of p.distractorHints) for (const part of d.split(ANSWER_PART_SEPARATOR)) expectRenders(part);
      }),
      { numRuns: 600 },
    );
    for (let seed = 1; seed <= 200; seed++) {
      const angle = generator.generate({ problems: "angle" }, seed);
      checked++;
      // sin⁻¹ ambiguity: 180° − θ offered where only the acute angle fits
      const theta = printedValue(angle.answer).value;
      if (angle.distractorHints.some((d) => Math.abs(printedValue(d).value - (180 - theta)) < 1e-9)) obtuseOffered++;
      const amb = generator.generate({ problems: "ambiguous" }, seed);
      if (amb.answer.startsWith("\\text{2 triangles}")) {
        // missing the second, obtuse triangle
        expect(amb.distractorHints.some((d) => d.startsWith("\\text{1 triangle}"))).toBe(true);
        acuteOnlyOffered++;
      }
    }
    expect(obtuseOffered).toBe(checked);
    expect(acuteOnlyOffered).toBeGreaterThan(20);
  });

  it("each problem kind appears under mixed and all", () => {
    const kinds = (problems: string) => {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 120; seed++) {
        const p = generator.generate({ problems }, seed * 7);
        if (!p.graph) seen.add("ambiguous");
        else if (p.answer.endsWith("^{\\circ}")) seen.add("angle");
        else seen.add("side");
      }
      return [...seen].sort();
    };
    expect(kinds("mixed")).toEqual(["angle", "side"]);
    expect(kinds("all")).toEqual(["ambiguous", "angle", "side"]);
  });
});

it("offers the mistake of using inverse cosine to recover the angle opposite side 16", () => {
  const p = generator.generate({}, 6);
  expect(p.distractorHints).toContain("50.2^{\\circ}");
});

it("keeps four Distractors for the ambiguous case when solving the whole triangle", () => {
  for (const rounding of ["tenth", "hundredth"] as const) {
    for (let seed = 0; seed < 300; seed++) {
      const p = generator.generate({ problems: "ambiguous", solveTriangle: true, rounding }, seed);
      expect(p.distractorHints.length, `${rounding} seed ${seed}`).toBeGreaterThanOrEqual(4);
    }
  }
});

describe("law-of-sines: soak regressions", () => {
  const whole = { problems: "ambiguous", solveTriangle: true, rounding: "tenth" } as const;

  for (const seed of [1244141722, 939979862]) {
    it(`keeps four Distractors for an obtuse given angle, solved whole (seed ${seed})`, () => {
      const p = generator.generate(whole, seed);
      expect(p.answer).toContain("1 triangle");
      expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
      expectGoodDistractors(p, choiceKey);
    });
  }

  it("models sin left out, the third angle as 180 minus the found one, and the inverted ratio", () => {
    // B = 118, b = 17, c = 9: sin C = 9 sin 118 / 17, so C = 27.9; the mistaken C = asin(9 / 17) = 32
    const p = generator.generate(whole, 1244141722);
    expect(p.distractorHints).toContain("\\text{1 triangle};\\quad C = 32^{\\circ};\\quad A = 30^{\\circ};\\quad a = 9.6");
    // A = 180 - C = 152.1 (118 forgotten), side a from that angle
    expect(p.distractorHints).toContain("\\text{1 triangle};\\quad C = 27.9^{\\circ};\\quad A = 152.1^{\\circ};\\quad a = 9");
    // a = b sin A / sin B inverted: 26.8
    expect(p.distractorHints).toContain("\\text{1 triangle};\\quad C = 27.9^{\\circ};\\quad A = 34.1^{\\circ};\\quad a = 26.8");
  });

  it("offers four Distractors across the ambiguous case's options", () => {
    fc.assert(
      fc.property(anySeed, fc.boolean(), fc.constantFrom("tenth", "hundredth"), (seed, solveTriangle, rounding) => {
        const p = generator.generate({ problems: "ambiguous", solveTriangle, rounding }, seed);
        expect(p.distractorHints.length, p.prompt).toBeGreaterThanOrEqual(4);
      }),
      { numRuns: 300 },
    );
  });
});
