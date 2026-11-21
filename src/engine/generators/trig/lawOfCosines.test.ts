import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { choiceKey } from "../../mc";
import { ANSWER_PART_SEPARATOR } from "../../format";
import type { ParamValues } from "../../types";
import { generator, LAW_OF_COSINES_ID } from "./lawOfCosines";
import { anySeed, expectRenders } from "./trig.testkit";
import {
  expectDiagramProblemRight,
  expectGoodDistractors,
  expectWordProblemRight,
  printedValue,
  promptNumbers,
} from "./oblique.testkit";

const anyParams = fc.record({
  problems: fc.constantFrom("mixed", "side", "angle"),
  solveTriangle: fc.boolean(),
  context: fc.constantFrom("diagrams", "mixed", "word"),
  rounding: fc.constantFrom("tenth", "hundredth"),
});

const placesOf = (params: ParamValues) => (params.rounding === "hundredth" ? 2 : 1);
describe("law-of-cosines", () => {
  it("is registered with its id, title and directions", () => {
    expect(generator.id).toBe(LAW_OF_COSINES_ID);
    expect(generator.title).toBe("The Law of Cosines");
    expect(generator.defaultDirections).toMatch(/Law of Cosines/);
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
    for (const problems of ["mixed", "side", "angle"])
      for (const solveTriangle of [true, false])
        for (const context of ["diagrams", "word", "mixed"])
        for (const rounding of ["tenth", "hundredth"]) {
          const params = { problems, solveTriangle, rounding, context };
          fc.assert(fc.property(anySeed, seed => {
          const p = generator.generate(params, seed);
          const places = placesOf(params);
          expect(p.prompt).toContain(places === 2 ? "nearest hundredth" : "nearest tenth");
          expectRenders(p.prompt);
          for (const part of p.answer.split(ANSWER_PART_SEPARATOR)) expectRenders(part);
          let kind: "side" | "angle";
          if (p.graph) {
            expect(params.context).not.toBe("word");
            const r = expectDiagramProblemRight(p, places, params.solveTriangle);
            const sides = r.givens.sides.filter((x) => x !== null).length;
            kind = sides === 3 ? "angle" : "side";
            if (kind === "side") {
              // SAS: the given angle is between the given sides
              const G = r.givens.angles.findIndex((x) => x !== null);
              expect(r.givens.sides[G]).toBeNull();
            }
          } else {
            expect(params.context).not.toBe("diagrams");
            expect(p.answerGraph).toBeUndefined();
            kind = expectWordProblemRight(p, places);
            expect(p.answer.includes(ANSWER_PART_SEPARATOR)).toBe(params.solveTriangle);
          }
          if (params.problems !== "mixed") expect(kind).toBe(params.problems);
          }), { numRuns: 40 });
        }
  }, 60_000);

  it("Distractors are distinct, never the Answer, and include the classic slips", () => {
    fc.assert(
      fc.property(anyParams, anySeed, (params, seed) => {
        const p = generator.generate(params, seed);
        expectGoodDistractors(p, choiceKey);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        for (const d of p.distractorHints) for (const part of d.split(ANSWER_PART_SEPARATOR)) expectRenders(part);
      }),
      { numRuns: 600 },
    );
    for (let seed = 1; seed <= 100; seed++) {
      const p = generator.generate({ problems: "side" }, seed);
      const { lengths, angles } = promptNumbers(
        (p.graph as { corners: { angle?: { text: string }; opposite?: { text: string } }[] }).corners
          .flatMap((c) => [c.angle ? `${c.angle.text.replace("°", "^{\\circ}")}` : "", c.opposite?.text ?? ""])
          .join(" "),
      );
      const [b, c] = lengths;
      const A = (angles[0] * Math.PI) / 180;
      const vals = p.distractorHints.map((d) => printedValue(d).value);
      const near = (x: number) => vals.some((v) => Math.abs(v - x) <= 0.05 + 1e-9);
      // the sign of 2bc cos A flipped, and the square root forgotten
      if (angles[0] !== 90) expect(near(Math.sqrt(b * b + c * c + 2 * b * c * Math.cos(A)))).toBe(true);
      expect(near(b * b + c * c - 2 * b * c * Math.cos(A))).toBe(true);
    }
  });

  it("mixes diagrams and word problems under 'Diagrams and word problems'", () => {
    let word = 0;
    for (let seed = 1; seed <= 100; seed++) if (!generator.generate({ context: "mixed" }, seed).graph) word++;
    expect(word).toBeGreaterThan(15);
    expect(word).toBeLessThan(85);
  });
});

it("offers the mistake of leaving the opposite side unsquared in the 6-8-10 triangle", () => {
  const p = generator.generate({ problems: "angle" }, 4);
  expect(p.distractorHints).toContain("20.4^{\\circ}");
});

it("keeps four Distractors when solving a whole triangle, even a right triangle", () => {
  for (const problems of ["mixed", "side", "angle"] as const) {
    for (const rounding of ["tenth", "hundredth"] as const) {
      for (let seed = 0; seed < 150; seed++) {
        const p = generator.generate({ problems, solveTriangle: true, rounding }, seed);
        expect(p.distractorHints.length, `${problems} ${rounding} seed ${seed}`).toBeGreaterThanOrEqual(4);
      }
    }
  }
  // A right triangle: the supplement mistake coincides with the Answer, so a swap of two angles is offered instead.
  const right = generator.generate({ problems: "mixed", solveTriangle: true, context: "mixed", rounding: "hundredth" }, 1);
  expect(right.answer).toBe("A = 90^{\\circ};\\quad B = 36.87^{\\circ};\\quad C = 53.13^{\\circ}");
  expect(right.distractorHints).toContain("A = 36.87^{\\circ};\\quad B = 90^{\\circ};\\quad C = 53.13^{\\circ}");
});
