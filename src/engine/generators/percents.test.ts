import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { construct, distractors, generator, type PercentConstruction } from "./percents";
import * as Change from "./percentOfChange";
import { rat } from "./equationKit";
import { close } from "./latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });

/** "12.5\%" -> 12.5, "48" -> 48 */
const num = (s: string) => Number(s.replace("\\%", ""));

/** The numbers printed in a prompt, in order: [value, isPercent]. */
function printed(prompt: string): { value: number; percent: boolean }[] {
  return [...prompt.matchAll(/(\d+(?:\.\d+)?)(\\%)?/g)].map((m) => ({ value: Number(m[1]), percent: !!m[2] }));
}

// ------------------------------------------------------------------ percents

const percentParams = fc.record({
  find: fc.constantFrom("all", "part", "percent", "whole"),
  percents: fc.constantFrom("whole", "any"),
  decimals: fc.boolean(),
  maxWhole: fc.integer({ min: 20, max: 1000 }),
});

/** Answer the printed question from its wording and numbers alone. */
function answerPercentQuestion(prompt: string): number {
  const nums = printed(prompt);
  if (/what percent/i.test(prompt)) {
    // "P is what percent of W" / "What percent of W is P"
    const [a, b] = nums.map((n) => n.value);
    const [part, whole] = prompt.startsWith("\\text{What percent") ? [b, a] : [a, b];
    return (part / whole) * 100;
  }
  const pc = nums.find((n) => n.percent)!.value;
  const other = nums.find((n) => !n.percent)!.value;
  if (prompt.includes("of what number")) return other / (pc / 100);
  return (pc / 100) * other;
}

describe("percents: answers", () => {
  it("the Answer answers the printed question, for any seed and options", () => {
    fc.assert(
      fc.property(anySeed, percentParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(close(num(p.answer), answerPercentQuestion(p.prompt)), `${p.prompt} => ${p.answer}`).toBe(true);
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
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(1);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
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
        const nums = printed(p.prompt);
        if (p.prompt.includes("\\text{ to }")) {
          const [from, to] = nums.map((n) => n.value);
          const m = p.answer.match(/^([\d.]+)\\% \\text\{ (increase|decrease)\}$/)!;
          expect(m, p.answer).not.toBeNull();
          expect(close(Number(m[1]), (Math.abs(to - from) / from) * 100), `${p.prompt} => ${p.answer}`).toBe(true);
          expect(m[2]).toBe(to > from ? "increase" : "decrease");
        } else {
          const from = nums[0].value;
          const pc = nums[1].value;
          const up = p.prompt.includes("increased");
          expect(close(num(p.answer), from * (1 + ((up ? 1 : -1) * pc) / 100)), `${p.prompt} => ${p.answer}`).toBe(true);
        }
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
  it("are distinct, never the Answer, and at least one", () => {
    fc.assert(
      fc.property(anySeed, changeParams, (seed, params) => {
        const p = Change.generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(1);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
      }),
    );
  });

  it("model the real mistakes", () => {
    // 40 to 52: 30% increase. Divided by the new amount (23.07...% does not terminate, so skipped),
    // the wrong direction, the change as the percent (12%), 130%, and 0.3%
    const k: Change.ChangeConstruction = { find: "percent", direction: "increase", percent: rat(30), original: rat(40), updated: rat(52) };
    expect(Change.distractors(k)).toEqual([
      "30\\% \\text{ decrease}",
      "12\\% \\text{ increase}",
      "130\\% \\text{ increase}",
      "0.3\\% \\text{ increase}",
    ]);
    // 40 increased by 30%: just the change (12), the wrong direction (28), 30 added on (70)
    expect(Change.distractors({ ...k, find: "amount" }).slice(0, 3)).toEqual(["12", "28", "70"]);
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
