import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { choiceKey } from "../../mc";
import { generator } from "./rightTriangleSolving";
import { anySeed, expectRenders } from "./trig.testkit";
import { labelDegrees, labelLength, readRightTriangle } from "./rightTriangle.testkit";
import {
  isDividing,
  kindOf,
  rightTriangleSolving,
  workAngle,
  workSide,
  workWord,
  WORDS,
  type Kind,
} from "./rightTriangleSolving.answer.testkit";

const PROBLEMS = ["sides", "angles", "mixed", "solve", "words", "everything"] as const;
const anyParams = fc.record({
  problems: fc.constantFrom(...PROBLEMS),
  divide: fc.boolean(),
  maxSide: fc.integer({ min: 10, max: 100 }),
});

describe("right-triangle-solving: answers", () => {
  it("every Answer and the answer graph are recomputed from the printed givens", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => rightTriangleSolving(generator.generate(params, seed))),
      { numRuns: 600 },
    );
  });
});

describe("right-triangle-solving: Topic Options", () => {
  it("are honoured: the kind of Problem, dividing, the largest given side", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const kind = kindOf(p);
        const allowed: Record<(typeof PROBLEMS)[number], Kind[]> = {
          sides: ["side"],
          angles: ["angle"],
          mixed: ["side", "angle"],
          solve: ["solve"],
          words: ["word"],
          everything: ["side", "angle", "solve", "word"],
        };
        expect(allowed[params.problems]).toContain(kind);
        let givens: number[] = [];
        if (kind === "word") {
          const { w, nums } = workWord(p);
          givens = nums;
          if (!params.divide) expect(w.divide).toBe(false);
        } else {
          const t = readRightTriangle(p.graph);
          givens = t.corners.flatMap((c) => {
            const l = c.opposite ? labelLength(c.opposite.text) : null;
            return l === null ? [] : [l];
          });
          for (const c of t.corners) {
            const d = c.angle ? labelDegrees(c.angle.text) : null;
            if (d !== null) expect(d >= 20 && d <= 70).toBe(true);
          }
          if (kind === "side") {
            const s = workSide(p);
            if (!params.divide) expect(isDividing(s.given, s.unknown)).toBe(false);
          }
          if (kind === "angle") {
            const { theta } = workAngle(p, "θ");
            expect(theta >= 15 && theta <= 75).toBe(true);
          }
        }
        for (const g of givens) {
          expect(Number.isInteger(g)).toBe(true);
          expect(g).toBeGreaterThanOrEqual(1);
          expect(g).toBeLessThanOrEqual(params.maxSide);
        }
      }),
      { numRuns: 600 },
    );
  });

  it("every kind of Problem, word problem and given side turns up", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 3000; seed++) {
      const p = generator.generate({ problems: "everything" }, seed);
      const kind = kindOf(p);
      if (kind === "word") seen.add(String(WORDS.indexOf(workWord(p).w)));
      if (kind === "side") {
        const s = workSide(p);
        seen.add(`${s.given}->${s.unknown}`);
      }
      seen.add(kind);
    }
    expect(seen.size).toBe(4 + WORDS.length + 6);
  });
});

/** The value(s) a choice states, in order. */
const values = (latex: string) =>
  latex.split(ANSWER_PART_SEPARATOR).map((part) => {
    const m = part.match(/(\d+(?:\.\d+)?)(?:\^\{\\circ\}| \\text\{ (?:ft|m)\})?$/);
    expect(m, part).not.toBeNull();
    return Number(m![1]);
  });

describe("right-triangle-solving: Distractors", () => {
  it("are distinct, positive, never the Answer, and printed like it", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const stated = new Set([JSON.stringify(values(p.answer))]);
        const shape = (s: string) => s.replace(/\d+(\.\d+)?/g, "#").replace(/\\approx|=/g, "~");
        const keys = new Set([choiceKey(p.answer)]);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
        for (const d of p.distractorHints) {
          expect(keys.has(choiceKey(d)), d).toBe(false);
          keys.add(choiceKey(d));
          expect(shape(d)).toBe(shape(p.answer));
          const v = values(d);
          expect(v.every((x) => x > 0)).toBe(true);
          expect(stated.has(JSON.stringify(v)), d).toBe(false);
          stated.add(JSON.stringify(v));
        }
      }),
      { numRuns: 400 },
    );
  });
});

describe("right-triangle-solving: generator", () => {
  it("is seed-deterministic and renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(generator.generate(params, seed)).toEqual(p);
        expectRenders(p.prompt);
        expectRenders(p.answer);
        for (const d of p.distractorHints) expectRenders(d);
      }),
      { numRuns: 100 },
    );
  });
});

it("offers the mistake of using cosine for both legs of the 24-degree triangle", () => {
  const p = generator.generate({ problems: "solve" }, 3);
  expect(p.distractorHints).toContain("A = 66^{\\circ};\\quad a \\approx 14.6;\\quad b \\approx 14.6");
});
