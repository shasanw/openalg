import { expect, it } from "vitest";
import fc from "fast-check";
import { choiceKey } from "../../mc";
import { generator } from "./triangleArea";
import { anySeed, expectRenders } from "./trig.testkit";
import { checkArea, expectGoodDistractors, printedValue } from "./oblique.testkit";

it("solves the printed triangle independently for every area option combination", () => {
  for (const given of ["sas", "sss", "asa", "mixed"])
    for (const context of ["diagrams", "word", "mixed"])
      for (const units of [true, false])
        for (const rounding of ["tenth", "hundredth"]) {
          const params = { given, context, units, rounding };
          fc.assert(fc.property(anySeed, seed => {
            const p = generator.generate(params, seed);
            expect(p).toEqual(generator.generate(params, seed));
            expect(p.prompt).toContain("nearest " + rounding);
            expectRenders(p.prompt);
            expectRenders(p.answer);
            if (context !== "mixed") expect(!!p.graph).toBe(context === "diagrams");
            expect(!!printedValue(p.answer).unit).toBe(!p.graph || units);
            const kind = checkArea(p, rounding === "tenth" ? 1 : 2);
            if (given !== "mixed") expect(kind).toBe(given);
            expectGoodDistractors(p, choiceKey);
            expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
          }), { numRuns: 24 });
        }
}, 60_000);

it("offers the mistake of dropping the semiperimeter factor in Heron's formula", () => {
  const p = generator.generate({}, 22);
  expect(p.distractorHints).toContain("12.1");
});
