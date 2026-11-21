import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  assemble,
  choiceKey,
  choiceLetter,
  choiceSeed,
  clampChoices,
  fallbackDistractors,
  MAX_CHOICES,
  MIN_CHOICES,
} from "./mc";
import { generator as factoring } from "./generators/quadratics/quadraticFactoring";
import {
  generator as formula,
  type RootType,
} from "./generators/quadratics/quadraticFormula";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyCount = fc.integer({ min: MIN_CHOICES, max: MAX_CHOICES });

// Answers shaped like real ones ("x = 3, -2", "x = \frac{1 \pm \sqrt{5}}{2}")
// plus arbitrary strings, so the properties hold for any Problem.
const realisticAnswer = fc
  .array(fc.integer({ min: -20, max: 20 }), { minLength: 1, maxLength: 3 })
  .map((xs) => "x = " + xs.join(", "));
const anyAnswer = fc.oneof(realisticAnswer, fc.string({ maxLength: 12 }));

/** Hints that deliberately include the Answer, whitespace and order variants of
 * it, and duplicates, to exercise the dedupe. */
const problemArb = anyAnswer.chain((answer) =>
  fc
    .array(
      fc.oneof(
        anyAnswer,
        fc.constant(answer),
        fc.constant(` ${answer} `),
        fc.constant(answer.replace(/\s+/g, "")),
      ),
      { maxLength: 8 },
    )
    .map((hints) => ({ answer, distractorHints: [...hints, ...hints] })),
);

describe("assemble: properties", () => {
  it("fills to exactly the requested number of choices", () => {
    fc.assert(
      fc.property(problemArb, anyCount, anySeed, (p, choices, seed) => {
        expect(assemble(p, { choices, seed }).choices).toHaveLength(choices);
      }),
    );
  });

  it("never offers two equivalent choices", () => {
    fc.assert(
      fc.property(problemArb, anyCount, anySeed, (p, choices, seed) => {
        const keys = assemble(p, { choices, seed }).choices.map(choiceKey);
        expect(new Set(keys).size).toBe(keys.length);
      }),
    );
  });

  it("records the correct position, and no other choice equals the answer", () => {
    fc.assert(
      fc.property(problemArb, anyCount, anySeed, (p, choices, seed) => {
        const out = assemble(p, { choices, seed });
        expect(out.choices[out.correctIndex]).toBe(p.answer);
        out.choices.forEach((c, i) => {
          if (i !== out.correctIndex) {
            expect(choiceKey(c)).not.toBe(choiceKey(p.answer));
          }
        });
      }),
    );
  });

  it("is deterministic by seed", () => {
    fc.assert(
      fc.property(problemArb, anyCount, anySeed, (p, choices, seed) => {
        expect(assemble(p, { choices, seed })).toEqual(
          assemble(p, { choices, seed }),
        );
      }),
    );
  });

  it("offers the same set of choices for every seed (seed only orders them)", () => {
    fc.assert(
      fc.property(problemArb, anyCount, anySeed, anySeed, (p, choices, s1, s2) => {
        const a = assemble(p, { choices, seed: s1 }).choices.slice().sort();
        const b = assemble(p, { choices, seed: s2 }).choices.slice().sort();
        expect(a).toEqual(b);
      }),
    );
  });

  it("prefers the generator's hints, in order, before any fallback", () => {
    const p = { answer: "x = 1", distractorHints: ["x = 7", "x = 8", "x = 9"] };
    const out = assemble(p, { choices: 3, seed: 5 });
    expect(out.choices.slice().sort()).toEqual(["x = 1", "x = 7", "x = 8"]);
  });

  it("places the correct choice in every position across seeds", () => {
    const p = { answer: "x = 1", distractorHints: ["x = 2", "x = 3", "x = 4", "x = 5"] };
    for (let choices = MIN_CHOICES; choices <= MAX_CHOICES; choices++) {
      const seen = new Set<number>();
      for (let seed = 0; seed < 200; seed++) {
        seen.add(assemble(p, { choices, seed }).correctIndex);
      }
      expect([...seen].sort()).toEqual([...Array(choices).keys()]);
    }
  });

  it("clamps the choice count to 2 to 5", () => {
    const p = { answer: "x = 1", distractorHints: [] };
    expect(assemble(p, { choices: 1, seed: 0 }).choices).toHaveLength(2);
    expect(assemble(p, { choices: 9, seed: 0 }).choices).toHaveLength(5);
    expect(clampChoices(Number.NaN)).toBeGreaterThanOrEqual(MIN_CHOICES);
  });
});

describe("assemble with real generators", () => {
  const ROOT_TYPES: RootType[] = ["rational", "irrational", "imaginary"];

  it("works for every factoring and quadratic-formula Problem", () => {
    fc.assert(
      fc.property(
        anySeed,
        anyCount,
        fc.boolean(),
        fc.constantFrom(...ROOT_TYPES),
        (seed, choices, allowEqualRoots, rootType) => {
          for (const p of [
            factoring.generate({ allowEqualRoots, maxRoot: 3 }, seed),
            formula.generate({ rootType }, seed),
          ]) {
            const out = assemble(p, { choices, seed: choiceSeed(p) });
            expect(out.choices).toHaveLength(choices);
            expect(out.choices[out.correctIndex]).toBe(p.answer);
            expect(new Set(out.choices.map(choiceKey)).size).toBe(choices);
          }
        },
      ),
    );
  });

  it("uses only mistake-based Distractors for a typical factoring Problem", () => {
    const p = factoring.generate({}, 1);
    const out = assemble(p, { choices: MAX_CHOICES, seed: 0 });
    for (const c of out.choices) {
      expect([p.answer, ...p.distractorHints]).toContain(c);
    }
  });
});

describe("choiceKey", () => {
  it("ignores whitespace and the order of a solution set", () => {
    expect(choiceKey("x = 3, -2")).toBe(choiceKey("x=-2,3"));
    expect(choiceKey("x = 3, 3")).toBe(choiceKey("x = 3"));
  });

  it("does not split commas nested in braces", () => {
    expect(choiceKey("x = \\frac{1,2}{3}")).toBe("x=\\frac{1,2}{3}");
  });
});

describe("fallbackDistractors", () => {
  function take(answer: string, n: number): string[] {
    const out: string[] = [];
    for (const d of fallbackDistractors(answer)) {
      out.push(d);
      if (out.length >= n) break;
    }
    return out;
  }

  it("nudges whole numbers, never to zero", () => {
    expect(take("x = 1", 3)).toEqual(["x = 2", "x = 3", "x = 4"]);
    expect(take("x = \\frac{1}{2}", 4)).toEqual([
      "x = \\frac{2}{2}",
      "x = \\frac{1}{3}",
      "x = \\frac{1}{1}",
      "x = \\frac{3}{2}",
    ]);
  });

  it("falls back to small values when the answer has no numbers", () => {
    expect(take("x = \\pm i", 2)).toEqual(["x = 1", "x = 2"]);
  });
});

describe("choiceLetter", () => {
  it("letters choices A to E", () => {
    expect([0, 1, 2, 3, 4].map(choiceLetter)).toEqual(["A", "B", "C", "D", "E"]);
  });
});
