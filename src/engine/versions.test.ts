import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  deriveVersion,
  deriveVersions,
  versionChoices,
  versionLetter,
  versionsAreIdentical,
} from "./versions";
import {
  allProblems,
  buildSection,
  buildWorksheet,
  rerollProblem,
  setResponseFormat,
  setVersionSettings,
  type ScrambleMode,
  type Worksheet,
} from "./worksheet";
import { assemble, choiceSeed } from "./mc";
import { QUADRATIC_FACTORING_ID } from "./generators/quadratics/quadraticFactoring";
import { QUADRATIC_FORMULA_ID } from "./generators/quadratics/quadraticFormula";

function twoSections(baseSeed = 11): Worksheet {
  const first = buildWorksheet({
    generatorId: QUADRATIC_FACTORING_ID,
    baseSeed,
    count: 6,
    title: "Quiz",
  });
  const second = buildSection({
    generatorId: QUADRATIC_FORMULA_ID,
    params: { rootType: "irrational" },
    baseSeed: baseSeed + 1,
    count: 5,
    directions: "Use the quadratic formula.",
  });
  return { ...first, sections: [...first.sections, second] };
}

const mc = (ws: Worksheet, choices = 4) =>
  setResponseFormat(ws, { mode: "multiple-choice", choices });

const withVersions = (ws: Worksheet, count: number, mode: ScrambleMode) =>
  setVersionSettings(ws, { count, mode });

const prompts = (ws: Worksheet) => ws.sections.map((s) => s.problems.map((p) => p.prompt));
const sorted = (xs: string[]) => xs.slice().sort();
const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const MODES: ScrambleMode[] = ["scramble-choices", "scramble-order", "new-questions"];

describe("deriveVersions", () => {
  it("derives as many Versions as the setting asks for, lettered A, B, C, ...", () => {
    const versions = deriveVersions(withVersions(twoSections(), 4, "scramble-order"));
    expect(versions.map((v) => v.index)).toEqual([0, 1, 2, 3]);
    expect(versions.map((v) => v.label)).toEqual([
      "Version A",
      "Version B",
      "Version C",
      "Version D",
    ]);
    expect(versionLetter(9)).toBe("J");
  });

  it("a single Version is the Worksheet itself, unlabelled", () => {
    const ws = twoSections();
    const versions = deriveVersions(ws);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toEqual({ index: 0, label: null, worksheet: ws, choiceVariant: 0 });
  });

  it("Version A is exactly the base Worksheet in every mode", () => {
    for (const mode of MODES) {
      const ws = mc(withVersions(twoSections(), 3, mode));
      const a = deriveVersion(ws, 0);
      expect(a.worksheet).toBe(ws);
      expect(a.choiceVariant).toBe(0);
      expect(a.label).toBe("Version A");
    }
  });

  it("is deterministic: the same Worksheet always derives the same Versions", () => {
    fc.assert(
      fc.property(anySeed, fc.constantFrom(...MODES), (seed, mode) => {
        const ws = withVersions(twoSections(seed), 4, mode);
        expect(deriveVersions(ws)).toEqual(deriveVersions(structuredClone(ws)));
        // One Version on its own matches the same Version from the full set.
        expect(deriveVersion(ws, 2)).toEqual(deriveVersions(ws)[2]);
      }),
      { numRuns: 15 },
    );
  });

  it("clamps an out-of-range index to the Worksheet's Versions", () => {
    const ws = withVersions(twoSections(), 3, "scramble-order");
    expect(deriveVersion(ws, 7)).toEqual(deriveVersion(ws, 2));
    expect(deriveVersion(ws, -1)).toEqual(deriveVersion(ws, 0));
  });
});

describe("scramble-choices", () => {
  it("changes only the choice order: same Problems, same order", () => {
    const ws = mc(withVersions(twoSections(), 4, "scramble-choices"), 5);
    const versions = deriveVersions(ws);
    for (const v of versions) {
      expect(v.worksheet).toEqual(ws);
      expect(v.choiceVariant).toBe(v.index);
    }
    // Every Version offers the same set of choices for each Problem, and at
    // least one Problem's order (and so its correct letter) actually changes.
    let moved = 0;
    for (const p of allProblems(ws)) {
      const orders = versions.map((v) => versionChoices(p, 5, v.choiceVariant));
      for (const o of orders) expect(sorted(o.choices)).toEqual(sorted(orders[0].choices));
      if (orders.some((o) => o.correctIndex !== orders[0].correctIndex)) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it("Version A keeps the Worksheet's existing choice order", () => {
    const ws = mc(withVersions(twoSections(), 3, "scramble-choices"));
    for (const p of allProblems(ws)) {
      expect(versionChoices(p, 4, deriveVersion(ws, 0).choiceVariant)).toEqual(
        assemble(p, { choices: 4, seed: choiceSeed(p) }),
      );
    }
  });

  it("in free response every Version is identical, and says so", () => {
    const fr = withVersions(twoSections(), 3, "scramble-choices");
    expect(versionsAreIdentical(fr)).toBe(true);
    for (const v of deriveVersions(fr)) expect(v.worksheet).toEqual(fr);
    expect(versionsAreIdentical(mc(fr))).toBe(false);
    expect(versionsAreIdentical(withVersions(fr, 3, "scramble-order"))).toBe(false);
    expect(versionsAreIdentical(withVersions(fr, 1, "scramble-choices"))).toBe(false);
  });
});

describe("scramble-order", () => {
  it("shuffles Problems only within their own Section", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        const ws = mc(withVersions(twoSections(seed), 5, "scramble-order"));
        for (const v of deriveVersions(ws)) {
          expect(v.choiceVariant).toBe(0);
          expect(v.worksheet.title).toBe(ws.title);
          expect(v.worksheet.sections).toHaveLength(ws.sections.length);
          v.worksheet.sections.forEach((s, i) => {
            const base = ws.sections[i];
            // Sections, their Topics, Directions and Recipes stay put.
            const { problems: _a, ...rest } = s;
            const { problems: _b, ...baseRest } = base;
            expect(rest).toEqual(baseRest);
            // Same Problems (the very same objects), possibly reordered.
            expect(s.problems).toHaveLength(base.problems.length);
            for (const p of s.problems) expect(base.problems).toContain(p);
            expect(new Set(s.problems).size).toBe(s.problems.length);
          });
        }
      }),
      { numRuns: 20 },
    );
  });

  it("gives every Version its own order when there are enough orders to go round", () => {
    const ws = withVersions(twoSections(), 10, "scramble-order");
    const orders = deriveVersions(ws).map((v) => JSON.stringify(prompts(v.worksheet)));
    expect(new Set(orders).size).toBe(10);
  });

  it("leaves choice order untouched: each Problem keeps its letters", () => {
    const ws = mc(withVersions(twoSections(), 3, "scramble-order"));
    for (const v of deriveVersions(ws)) {
      for (const p of allProblems(v.worksheet)) {
        expect(versionChoices(p, 4, v.choiceVariant)).toEqual(
          assemble(p, { choices: 4, seed: choiceSeed(p) }),
        );
      }
    }
  });

  it("a one-Problem Section has nothing to shuffle", () => {
    const ws = withVersions(
      buildWorksheet({ generatorId: QUADRATIC_FACTORING_ID, baseSeed: 5, count: 1 }),
      3,
      "scramble-order",
    );
    for (const v of deriveVersions(ws)) expect(v.worksheet.sections).toEqual(ws.sections);
  });
});

describe("new-questions", () => {
  it("regenerates each Section from its Recipe: new Problems, same shape", () => {
    const ws = withVersions(twoSections(), 3, "new-questions");
    const versions = deriveVersions(ws);
    for (const v of versions.slice(1)) {
      expect(v.choiceVariant).toBe(0);
      v.worksheet.sections.forEach((s, i) => {
        const base = ws.sections[i];
        expect(s.generatorId).toBe(base.generatorId);
        expect(s.params).toEqual(base.params);
        expect(s.directions).toBe(base.directions);
        expect(s.problems).toHaveLength(base.problems.length);
        expect(s.problems.map((p) => p.prompt)).not.toEqual(base.problems.map((p) => p.prompt));
        for (const p of s.problems) expect(p.generatorId).toBe(base.generatorId);
      });
    }
    expect(prompts(versions[1].worksheet)).not.toEqual(prompts(versions[2].worksheet));
  });

  it("replaces hand-curated Problems too, keeping the curated count", () => {
    const curated = rerollProblem(withVersions(twoSections(), 2, "new-questions"), 0, 2, 999);
    const b = deriveVersion(curated, 1);
    expect(b.worksheet.sections[0].problems).toHaveLength(6);
    expect(b.worksheet.sections[0].problems).not.toContainEqual(
      curated.sections[0].problems[2],
    );
  });
});
