import { choiceKey } from "../../mc";
import { percentOfChange } from "./percentOfChange.answer.testkit";
import { percents, num, printed } from "./percents.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, type PercentConstruction } from "./percents";
import * as Change from "./percentOfChange";
import { rat } from "../shared/equationKit";
import { close } from "../shared/latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });

// ------------------------------------------------------------------ percents

const percentParams = fc.record({
  find: fc.constantFrom("all", "part", "percent", "whole"),
  percents: fc.constantFrom("whole", "any"),
  decimals: fc.boolean(),
  maxWhole: fc.integer({ min: 20, max: 1000 }),
});

describe("percents: answers", () => {
  it("the Answer answers the printed question, for any seed and options", () => {
    fc.assert(
      fc.property(anySeed, percentParams, (seed, params) => {
        const p = generator.generate(params, seed);
        percents(p);
      }),
    );
  });

  it("the construction holds: part = percent / 100 \\cdot whole", () => {
    fc.assert(
      fc.property(anySeed, percentParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(k.part.n * k.whole.d * 100 * k.percent.d).toBe(k.percent.n * k.whole.n * k.part.d);
      }),
    );
  });
});

describe("percents: Topic Options", () => {
  it("asks for what Find says, with whole-number percents and Answers unless allowed otherwise", () => {
    fc.assert(
      fc.property(anySeed, percentParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.find !== "all") expect(k.find).toBe(params.find);
        const p = generator.generate(params, seed);
        if (params.percents === "whole") {
          expect(k.percent.d).toBe(1);
          expect(k.percent.n).toBeLessThan(100);
        }
        if (!params.decimals) for (const n of printed(p.prompt).filter((x) => !x.percent)) expect(Number.isInteger(n.value)).toBe(true);
        if (!params.decimals && k.find !== "percent") expect(Number.isInteger(num(p.answer))).toBe(true);
        expect(k.whole.n).toBeLessThanOrEqual(params.maxWhole);
      }),
    );
  });

  it("mixes all three questions by default", () => {
    const finds = new Set(Array.from({ length: 30 }, (_, s) => construct({}, createRng(s)).find));
    expect(finds).toEqual(new Set(["part", "percent", "whole"]));
  });
});

describe("percents: Distractors", () => {
  it("are distinct, positive, never the Answer", () => {
    fc.assert(
      fc.property(anySeed, percentParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        expect(new Set(p.distractorHints.map(choiceKey)).size).toBe(p.distractorHints.length);
        for (const d of p.distractorHints) {
          expect(close(num(d), num(p.answer))).toBe(false);
          expect(num(d)).toBeGreaterThan(0);
          expect(d.endsWith("\\%")).toBe(p.answer.endsWith("\\%"));
        }
      }),
    );
  });

  it("model the real mistakes", () => {
    const base: Omit<PercentConstruction, "find"> = { percent: rat(25), part: rat(12), whole: rat(48), phrasing: 0 };
    // 12 is what percent of 48: upside down gives 400%, forgetting \times 100 gives 0.25%
    expect(distractors({ ...base, find: "percent" }).slice(0, 2)).toEqual(["400\\%", "0.25\\%"]);
    // 25% of 48: divided by the percent instead (192)
    expect(distractors({ ...base, find: "part" })).toContain("60"); // reported the increased whole
    expect(distractors({ ...base, find: "part" })[0]).toBe("192");
    // 12 is 25% of what: multiplied instead (3)
    expect(distractors({ ...base, find: "whole" })[0]).toBe("3");
  });
});

// ------------------------------------------------------------------ percent of change

const changeParams = fc.record({
  find: fc.constantFrom("percent", "amount", "both"),
  direction: fc.constantFrom("both", "increase", "decrease"),
  percents: fc.constantFrom("whole", "any"),
  decimals: fc.boolean(),
  maxAmount: fc.integer({ min: 20, max: 1000 }),
});

describe("percent-of-change: answers", () => {
  it("the Answer is the percent of change, or the new amount, of the printed numbers", () => {
    fc.assert(
      fc.property(anySeed, changeParams, (seed, params) => {
        const p = Change.generator.generate(params, seed);
        percentOfChange(p);
      }),
    );
  });
});

describe("percent-of-change: Topic Options", () => {
  it("honours Find, Changes, Percents, decimals and Largest original amount", () => {
    fc.assert(
      fc.property(anySeed, changeParams, (seed, params) => {
        const k = Change.construct(params, createRng(seed));
        if (params.find !== "both") expect(k.find).toBe(params.find);
        if (params.direction !== "both") expect(k.direction).toBe(params.direction);
        if (params.percents === "whole") expect(k.percent.d).toBe(1);
        if (params.percents === "whole") expect(k.percent.n).toBeLessThanOrEqual(100);
        if (k.direction === "decrease") expect(k.percent.n / k.percent.d).toBeLessThan(100);
        const p = Change.generator.generate(params, seed);
        if (!params.decimals) for (const n of printed(p.prompt).filter((x) => !x.percent)) expect(Number.isInteger(n.value)).toBe(true);
        expect(k.original.n).toBeLessThanOrEqual(params.maxAmount);
        expect(k.updated.n).toBeGreaterThan(0);
      }),
    );
  });
});

describe("percent-of-change: Distractors", () => {
  it("are distinct, never the Answer, and at least four", () => {
    fc.assert(
      fc.property(anySeed, changeParams, (seed, params) => {
        const p = Change.generator.generate(params, seed);
        // 100 decreased by a large percent, on a whole-number sheet, has only three real slips
        const hundredDown = /^100 \\text\{ decreased by \}/.test(p.prompt) && params.decimals === false;
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(hundredDown ? 3 : 4);
        expect(new Set(p.distractorHints.map(choiceKey)).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
      }),
    );
  });

  it("model the real mistakes", () => {
    // 40 to 52: 30% increase. Divided by the new amount (23.07...% does not terminate, so skipped),
    // the wrong direction, the change as the percent (12%), 130%, and 0.3%
    const k: Change.ChangeConstruction = { find: "percent", direction: "increase", percent: rat(30), original: rat(40), updated: rat(52) };
    expect(Change.distractors(k).slice(0, 5)).toEqual([
      "30\\% \\text{ decrease}",
      "12\\% \\text{ increase}",
      "130\\% \\text{ increase}",
      "0.3\\% \\text{ increase}",
      "3\\% \\text{ increase}",
    ]);
    // 40 increased by 30%: just the change (12), the wrong direction (28), 30 added on (70)
    expect(Change.distractors({ ...k, find: "amount" }).slice(0, 3)).toEqual(["12", "28", "70"]);
  });
});

describe("percent-of-change: soak regressions", () => {
  const exactCase = (find: "amount", direction: "increase" | "decrease", percent: number, original: number, updated: number): Change.ChangeConstruction => ({
    find,
    direction,
    percent: rat(percent),
    original: rat(original),
    updated: rat(updated),
  });

  it("keeps four Distractors for 50 increased by 50% (seed 2141231556)", () => {
    const p = Change.generator.generate({ find: "amount", direction: "both", percents: "whole", decimals: false, maxAmount: 497 }, 2141231556);
    expect(p.prompt).toBe("50 \\text{ increased by } 50\\%");
    expect(p.answer).toBe("75");
    expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
    expect(new Set(p.distractorHints.map(choiceKey)).size).toBe(p.distractorHints.length);
  });

  it("models the decimal moved one place too few, dividing by the decimal, and 100 changed by the percent", () => {
    // 80 decreased by 25% = 60: 80 / 0.25 = 320, and 100 - 25 = 75
    const down = Change.distractors(exactCase("amount", "decrease", 25, 80, 60));
    expect(down).toContain("320");
    expect(down).toContain("75");
    // 50 increased by 50% = 75: 50 (1 + 5) = 300, and 100 + 50 = 150
    const up = Change.distractors(exactCase("amount", "increase", 50, 50, 75));
    expect(up).toContain("300");
    expect(up).toContain("150");
  });

  it("only the exact 100-decreased-by family stays short of four, across option combinations", () => {
    fc.assert(
      fc.property(anySeed, changeParams, (seed, params) => {
        const p = Change.generator.generate(params, seed);
        const hundredDown = /^100 \\text\{ decreased by \}/.test(p.prompt);
        expect(p.distractorHints.length, p.prompt).toBeGreaterThanOrEqual(hundredDown ? 3 : 4);
      }),
      { numRuns: 400 },
    );
  });
});

describe("percents and percent of change: generate()", () => {
  it("are deterministic and varied", () => {
    fc.assert(
      fc.property(anySeed, percentParams, changeParams, (seed, pp, cp) => {
        expect(generator.generate(pp, seed)).toEqual(generator.generate(pp, seed));
        expect(Change.generator.generate(cp, seed)).toEqual(Change.generator.generate(cp, seed));
      }),
    );
    expect(new Set(Array.from({ length: 200 }, (_, s) => generator.generate({}, s).prompt)).size).toBeGreaterThan(150);
    expect(new Set(Array.from({ length: 200 }, (_, s) => Change.generator.generate({}, s).prompt)).size).toBeGreaterThan(150);
  });
});
