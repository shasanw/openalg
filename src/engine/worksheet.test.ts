import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  buildWorksheet,
  normalizeWorksheet,
  regenerateAll,
  rerollProblem,
  removeProblem,
  reorderProblem,
  regenerateSection,
  setSectionDirections,
  buildSection,
  allProblems,
  problemCount,
  DEFAULT_PRINT_CONFIG,
  DEFAULT_RESPONSE_FORMAT,
  DEFAULT_ANSWER_KEY_FORMAT,
  isMultipleChoice,
  setResponseFormat,
  emptyWorksheet,
  isThrowaway,
  addSection,
  removeSection,
  moveSection,
  duplicateSection,
  setSectionParams,
  setSectionCount,
  clampSectionCount,
  sectionRanges,
  sectionLetter,
  MAX_SECTION_PROBLEMS,
  MIN_SECTION_PROBLEMS,
  type Worksheet,
} from "./worksheet";
import { PARABOLA_PROPERTIES_ID } from "./generators/parabolaProperties";
import { QUADRATIC_FACTORING_ID } from "./generators/quadraticFactoring";
import { QUADRATIC_FORMULA_ID } from "./generators/quadraticFormula";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });

/** A hand-built two-Topic, two-Section Worksheet (the UI builds one Section today). */
function twoSectionSheet(): Worksheet {
  const ws = buildWorksheet({
    generatorId: QUADRATIC_FACTORING_ID,
    baseSeed: 1,
    count: 3,
    directions: "Solve by factoring.",
  });
  const second = buildSection({
    generatorId: QUADRATIC_FORMULA_ID,
    baseSeed: 2,
    count: 2,
    directions: "Solve each equation.",
  });
  return { ...ws, sections: [...ws.sections, second] };
}

describe("buildWorksheet", () => {
  it("produces exactly `count` problems", () => {
    const ws = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 1,
      count: 12,
    });
    expect(ws.sections).toHaveLength(1);
    expect(ws.sections[0].problems).toHaveLength(12);
    expect(ws.version).toBe(2);
  });

  it("produces an empty sheet for count 0 (a blank worksheet)", () => {
    const ws = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 1,
      count: 0,
      title: "Untitled worksheet",
    });
    expect(ws.sections[0].problems).toEqual([]);
    expect(ws.title).toBe("Untitled worksheet");
  });

  it("is deterministic for the same recipe", () => {
    fc.assert(
      fc.property(anySeed, (baseSeed) => {
        const a = buildWorksheet({
          generatorId: QUADRATIC_FACTORING_ID,
          baseSeed,
          count: 6,
        });
        const b = buildWorksheet({
          generatorId: QUADRATIC_FACTORING_ID,
          baseSeed,
          count: 6,
        });
        expect(a).toEqual(b);
      }),
    );
  });

  it("defaults title and directions from the generator", () => {
    const ws = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 1,
      count: 1,
    });
    expect(ws.sections[0].directions).toBe("Solve each equation by factoring.");
    expect(ws.title.length).toBeGreaterThan(0);
  });

  it("never repeats a problem within a sheet when the space is large enough", () => {
    // Default options give 171 distinct factoring problems; a 12-problem sheet
    // must contain 12 distinct prompts for ANY base seed (reject-and-resample).
    fc.assert(
      fc.property(anySeed, (baseSeed) => {
        const ws = buildWorksheet({
          generatorId: QUADRATIC_FACTORING_ID,
          baseSeed,
          count: 12,
        });
        const prompts = new Set(ws.sections[0].problems.map((p) => p.prompt));
        expect(prompts.size).toBe(12);
      }),
    );
  });

  it("degrades gracefully when count exceeds the available problem space", () => {
    // maxRoot=1 yields only 3 distinct problems; asking for 10 must still return
    // 10 (topped up with repeats) and terminate rather than spin forever.
    const ws = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      params: { maxRoot: 1 },
      baseSeed: 5,
      count: 10,
    });
    expect(ws.sections[0].problems).toHaveLength(10);
    const distinct = new Set(ws.sections[0].problems.map((p) => p.prompt));
    expect(distinct.size).toBeLessThanOrEqual(3);
    expect(distinct.size).toBeGreaterThan(0);
  });

  it("throws on an unknown generator", () => {
    expect(() =>
      buildWorksheet({ generatorId: "nope", baseSeed: 1, count: 1 }),
    ).toThrow(/Unknown generator/);
  });
});

describe("regenerateAll", () => {
  it("keeps the recipe but changes the problems with a new base seed", () => {
    const ws = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 100,
      count: 8,
    });
    const fresh = regenerateAll(ws, 200);
    const [a, b] = [ws.sections[0], fresh.sections[0]];
    expect(b.generatorId).toBe(a.generatorId);
    expect(b.count).toBe(a.count);
    expect(b.directions).toBe(a.directions);
    expect(b.baseSeed).toBe(200);
    // overwhelmingly likely the problem set differs
    expect(b.problems).not.toEqual(a.problems);
  });

  it("regenerates every Section of a multi-Section Worksheet, keeping each Recipe", () => {
    const ws = twoSectionSheet();
    const fresh = regenerateAll(ws, 7);
    expect(fresh.sections).toHaveLength(2);
    fresh.sections.forEach((s, i) => {
      expect(s.generatorId).toBe(ws.sections[i].generatorId);
      expect(s.params).toEqual(ws.sections[i].params);
      expect(s.directions).toBe(ws.sections[i].directions);
      expect(s.count).toBe(ws.sections[i].count);
      expect(s.problems).not.toEqual(ws.sections[i].problems);
    });
    expect(fresh.sections[0].baseSeed).not.toBe(fresh.sections[1].baseSeed);
  });
});

describe("regenerateSection", () => {
  it("regenerates only the targeted Section", () => {
    const ws = twoSectionSheet();
    const fresh = regenerateSection(ws, 1, 555);
    expect(fresh.sections[0]).toBe(ws.sections[0]);
    expect(fresh.sections[1].baseSeed).toBe(555);
    expect(fresh.sections[1].directions).toBe(ws.sections[1].directions);
    expect(fresh.sections[1].problems).not.toEqual(ws.sections[1].problems);
  });

  it("is a no-op for an out-of-range Section", () => {
    const ws = twoSectionSheet();
    expect(regenerateSection(ws, 5, 1)).toBe(ws);
  });
});

describe("Sections", () => {
  it("allProblems and problemCount span every Section in order", () => {
    const ws = twoSectionSheet();
    expect(problemCount(ws)).toBe(5);
    expect(allProblems(ws)).toEqual([
      ...ws.sections[0].problems,
      ...ws.sections[1].problems,
    ]);
  });

  it("setSectionDirections changes only that Section's Directions", () => {
    const ws = twoSectionSheet();
    const next = setSectionDirections(ws, 1, "Factor completely.");
    expect(next.sections[1].directions).toBe("Factor completely.");
    expect(next.sections[0]).toBe(ws.sections[0]);
    expect(setSectionDirections(ws, 9, "x")).toBe(ws);
  });
});

describe("per-problem curation", () => {
  const sheet = () =>
    buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 42,
      count: 5,
    });

  it("leaves every other Section untouched", () => {
    const ws = twoSectionSheet();
    const rerolled = rerollProblem(ws, 1, 0, 4242);
    expect(rerolled.sections[0]).toBe(ws.sections[0]);
    expect(rerolled.sections[1].problems[0].seed).toBe(4242);
    const removed = removeProblem(ws, 1, 1);
    expect(removed.sections[0]).toBe(ws.sections[0]);
    expect(removed.sections[1].count).toBe(1);
    const reordered = reorderProblem(ws, 0, 0, 2);
    expect(reordered.sections[1]).toBe(ws.sections[1]);
    expect(reordered.sections[0].problems[2]).toEqual(ws.sections[0].problems[0]);
  });

  it("is a no-op for an out-of-range Section", () => {
    const ws = sheet();
    expect(rerollProblem(ws, 3, 0, 1)).toBe(ws);
    expect(removeProblem(ws, -1, 0)).toBe(ws);
    expect(reorderProblem(ws, 1, 0, 1)).toBe(ws);
  });

  describe("rerollProblem", () => {
    it("changes only the targeted problem", () => {
      const ws = sheet();
      const next = rerollProblem(ws, 0, 2, 999);
      expect(next.sections[0].problems[2]).not.toEqual(ws.sections[0].problems[2]);
      // every other problem is byte-identical
      [0, 1, 3, 4].forEach((i) =>
        expect(next.sections[0].problems[i]).toEqual(ws.sections[0].problems[i]),
      );
      expect(next.sections[0].count).toBe(5);
    });

    it("re-rolls from the problem's own recipe (same params, new seed)", () => {
      const ws = sheet();
      const next = rerollProblem(ws, 0, 0, 12345);
      expect(next.sections[0].problems[0].generatorId).toBe(ws.sections[0].problems[0].generatorId);
      expect(next.sections[0].problems[0].params).toEqual(ws.sections[0].problems[0].params);
      expect(next.sections[0].problems[0].seed).toBe(12345);
    });

    it("stays correct by construction for any seed", () => {
      // The construction guarantee: factors (x - r1)(x - r2) expand to x^2+bx+c,
      // so re-rolling can never produce a problem whose answer doesn't fit it.
      // Here we assert the recipe contract that upholds it (kind + own seed).
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
          const next = rerollProblem(sheet(), 0, 1, seed);
          expect(next.sections[0].problems[1].kind).toBe("generated");
          expect(next.sections[0].problems[1].seed).toBe(seed);
        }),
      );
    });

    it("is a no-op for an out-of-range index", () => {
      const ws = sheet();
      expect(rerollProblem(ws, 0, 99, 1)).toEqual(ws);
    });
  });

  describe("removeProblem", () => {
    it("drops the problem and keeps count consistent", () => {
      const ws = sheet();
      const removed = ws.sections[0].problems[2];
      const next = removeProblem(ws, 0, 2);
      expect(next.sections[0].problems).toHaveLength(4);
      expect(next.sections[0].count).toBe(4);
      expect(next.sections[0].problems).not.toContainEqual(removed);
      // surrounding problems are preserved and in order
      expect(next.sections[0].problems).toEqual([
        ws.sections[0].problems[0],
        ws.sections[0].problems[1],
        ws.sections[0].problems[3],
        ws.sections[0].problems[4],
      ]);
    });

    it("is a no-op for an out-of-range index", () => {
      const ws = sheet();
      expect(removeProblem(ws, 0, -1)).toEqual(ws);
      expect(removeProblem(ws, 0, 5)).toEqual(ws);
    });
  });

  describe("reorderProblem", () => {
    it("moves a problem to a later slot, shifting the rest to fill the gap", () => {
      const ws = sheet();
      const next = reorderProblem(ws, 0, 1, 3);
      // problem 1 lands at index 3; the items between shift left by one
      expect(next.sections[0].problems).toEqual([
        ws.sections[0].problems[0],
        ws.sections[0].problems[2],
        ws.sections[0].problems[3],
        ws.sections[0].problems[1],
        ws.sections[0].problems[4],
      ]);
    });

    it("moves a problem to an earlier slot", () => {
      const ws = sheet();
      const next = reorderProblem(ws, 0, 3, 0);
      expect(next.sections[0].problems).toEqual([
        ws.sections[0].problems[3],
        ws.sections[0].problems[0],
        ws.sections[0].problems[1],
        ws.sections[0].problems[2],
        ws.sections[0].problems[4],
      ]);
    });

    it("preserves the multiset of problems and the count", () => {
      const ws = sheet();
      const next = reorderProblem(ws, 0, 0, 4);
      expect(next.sections[0].count).toBe(5);
      const bySeed = (a: { seed: number }, b: { seed: number }) =>
        a.seed - b.seed;
      expect([...next.sections[0].problems].sort(bySeed)).toEqual(
        [...ws.sections[0].problems].sort(bySeed),
      );
    });

    it("is a no-op for same-slot or out-of-range moves", () => {
      const ws = sheet();
      expect(reorderProblem(ws, 0, 2, 2)).toEqual(ws);
      expect(reorderProblem(ws, 0, -1, 2)).toEqual(ws);
      expect(reorderProblem(ws, 0, 2, 5)).toEqual(ws);
    });
  });

  describe("print config (issue #7)", () => {
    it("buildWorksheet attaches the default print config", () => {
      const ws = buildWorksheet({
        generatorId: QUADRATIC_FACTORING_ID,
        baseSeed: 1,
        count: 3,
      });
      expect(ws.print).toEqual(DEFAULT_PRINT_CONFIG);
    });

    it("regenerateAll carries the print config forward", () => {
      const base = buildWorksheet({
        generatorId: QUADRATIC_FACTORING_ID,
        baseSeed: 1,
        count: 3,
        print: { ...DEFAULT_PRINT_CONFIG, paper: "a4", spacing: "roomy" },
      });
      expect(regenerateAll(base, 99).print).toEqual(base.print);
    });

    it("normalizeWorksheet backfills print on pre-#7 saved files", () => {
      // A file saved before issue #7 has no `print` block.
      const legacy = {
        version: 2,
        title: "Old sheet",
        sections: [],
      } as unknown as Worksheet;
      expect(normalizeWorksheet(legacy).print).toEqual(DEFAULT_PRINT_CONFIG);
    });

    it("normalizeWorksheet preserves an explicit print config", () => {
      const ws = buildWorksheet({
        generatorId: QUADRATIC_FACTORING_ID,
        baseSeed: 1,
        count: 1,
        print: { ...DEFAULT_PRINT_CONFIG, orientation: "landscape" },
      });
      expect(normalizeWorksheet(ws).print.orientation).toBe("landscape");
    });
  });
});

describe("Response Format", () => {
  const base = () =>
    buildWorksheet({ generatorId: QUADRATIC_FACTORING_ID, baseSeed: 1, count: 3 });

  it("new Worksheets are free response with a default choice count", () => {
    expect(base().responseFormat).toEqual(DEFAULT_RESPONSE_FORMAT);
    expect(isMultipleChoice(base())).toBe(false);
  });

  it("setResponseFormat toggles the whole sheet and clamps choices to 2 to 5", () => {
    const mc = setResponseFormat(base(), { mode: "multiple-choice", choices: 3 });
    expect(isMultipleChoice(mc)).toBe(true);
    expect(mc.responseFormat.choices).toBe(3);
    expect(setResponseFormat(mc, { mode: "multiple-choice", choices: 1 }).responseFormat.choices).toBe(2);
    expect(setResponseFormat(mc, { mode: "multiple-choice", choices: 8 }).responseFormat.choices).toBe(5);
    // The Problems themselves are untouched.
    expect(mc.sections).toEqual(base().sections);
  });

  it("buildWorksheet carries a given Response Format", () => {
    const rf = { mode: "multiple-choice" as const, choices: 5 };
    const ws = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 1,
      count: 1,
      responseFormat: rf,
    });
    expect(ws.responseFormat).toEqual(rf);
  });

  it("regenerating keeps the Response Format", () => {
    const mc = setResponseFormat(base(), { mode: "multiple-choice", choices: 3 });
    expect(regenerateAll(mc, 99).responseFormat).toEqual(mc.responseFormat);
  });

  it("normalizeWorksheet backfills a missing Response Format", () => {
    const { responseFormat: _drop, ...legacy } = base();
    expect(normalizeWorksheet(legacy as Worksheet).responseFormat).toEqual(
      DEFAULT_RESPONSE_FORMAT,
    );
  });
});

describe("Answer Key format", () => {
  const base = () =>
    buildWorksheet({ generatorId: QUADRATIC_FACTORING_ID, baseSeed: 1, count: 3 });

  it("new Worksheets print a full key", () => {
    expect(DEFAULT_ANSWER_KEY_FORMAT).toBe("full");
    expect(base().answerKeyFormat).toBe("full");
  });

  it("buildWorksheet carries a given format, and regenerating keeps it", () => {
    const ws = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 1,
      count: 3,
      answerKeyFormat: "in-context",
    });
    expect(ws.answerKeyFormat).toBe("in-context");
    expect(regenerateAll(ws, 99).answerKeyFormat).toBe("in-context");
  });

  it("normalizeWorksheet backfills a missing or unknown format as full", () => {
    const { answerKeyFormat: _drop, ...legacy } = base();
    expect(normalizeWorksheet(legacy as Worksheet).answerKeyFormat).toBe("full");
    const odd = { ...base(), answerKeyFormat: "evens" } as unknown as Worksheet;
    expect(normalizeWorksheet(odd).answerKeyFormat).toBe("full");
    const kept = { ...base(), answerKeyFormat: "odds" as const };
    expect(normalizeWorksheet(kept).answerKeyFormat).toBe("odds");
  });
});

describe("Section editing", () => {
  const section = (generatorId: string, baseSeed: number, count: number) =>
    buildSection({ generatorId, baseSeed, count });

  /** Three Sections: factoring (3), formula (2), parabola properties (4). */
  function threeSectionSheet(): Worksheet {
    let ws = emptyWorksheet({ title: "Unit test" });
    ws = addSection(ws, section(QUADRATIC_FACTORING_ID, 1, 3));
    ws = addSection(ws, section(QUADRATIC_FORMULA_ID, 2, 2));
    ws = addSection(ws, section(PARABOLA_PROPERTIES_ID, 3, 4));
    return ws;
  }
  const topics = (ws: Worksheet) => ws.sections.map((s) => s.generatorId);

  it("emptyWorksheet has no Sections and the default settings", () => {
    const ws = emptyWorksheet();
    expect(ws.sections).toEqual([]);
    expect(ws.title).toBe("Untitled worksheet");
    expect(ws.print).toEqual(DEFAULT_PRINT_CONFIG);
    expect(ws.responseFormat).toEqual(DEFAULT_RESPONSE_FORMAT);
    expect(ws.answerKeyFormat).toBe(DEFAULT_ANSWER_KEY_FORMAT);
    expect(problemCount(ws)).toBe(0);
  });

  it("addSection appends by default and inserts at a clamped index", () => {
    const ws = threeSectionSheet();
    expect(topics(ws)).toEqual([QUADRATIC_FACTORING_ID, QUADRATIC_FORMULA_ID, PARABOLA_PROPERTIES_ID]);
    const front = addSection(ws, section(QUADRATIC_FORMULA_ID, 9, 1), -5);
    expect(front.sections[0].baseSeed).toBe(9);
    const back = addSection(ws, section(QUADRATIC_FORMULA_ID, 9, 1), 99);
    expect(back.sections.at(-1)!.baseSeed).toBe(9);
    // The input is never mutated.
    expect(ws.sections).toHaveLength(3);
  });

  it("removeSection drops only that Section; out of range is a no-op", () => {
    const ws = threeSectionSheet();
    const next = removeSection(ws, 1);
    expect(topics(next)).toEqual([QUADRATIC_FACTORING_ID, PARABOLA_PROPERTIES_ID]);
    expect(next.sections[0]).toBe(ws.sections[0]);
    expect(removeSection(ws, 3)).toBe(ws);
    expect(removeSection(ws, -1)).toBe(ws);
  });

  it("moveSection reorders, keeping each Section's Problems intact", () => {
    const ws = threeSectionSheet();
    const down = moveSection(ws, 0, 2);
    expect(topics(down)).toEqual([QUADRATIC_FORMULA_ID, PARABOLA_PROPERTIES_ID, QUADRATIC_FACTORING_ID]);
    expect(down.sections[2]).toBe(ws.sections[0]);
    const up = moveSection(ws, 2, 1);
    expect(topics(up)).toEqual([QUADRATIC_FACTORING_ID, PARABOLA_PROPERTIES_ID, QUADRATIC_FORMULA_ID]);
    expect(moveSection(ws, 1, 1)).toBe(ws);
    expect(moveSection(ws, 0, 3)).toBe(ws);
    expect(moveSection(ws, -1, 0)).toBe(ws);
  });

  it("duplicateSection inserts a copy after the source with fresh Problems", () => {
    let ws = threeSectionSheet();
    ws = setSectionDirections(ws, 1, "Use the quadratic formula.");
    ws = setSectionParams(ws, 1, { ...ws.sections[1].params, allowLeadingCoefficient: true });
    const next = duplicateSection(ws, 1, 777);
    expect(next.sections).toHaveLength(4);
    const [src, copy] = [next.sections[1], next.sections[2]];
    expect(copy.generatorId).toBe(src.generatorId);
    expect(copy.params).toEqual(src.params);
    expect(copy.directions).toBe("Use the quadratic formula.");
    expect(copy.count).toBe(src.count);
    expect(copy.baseSeed).toBe(777);
    expect(copy.problems.map((p) => p.prompt)).not.toEqual(src.problems.map((p) => p.prompt));
    expect(next.sections[3]).toBe(ws.sections[2]);
    expect(duplicateSection(ws, 5, 1)).toBe(ws);
  });

  it("setSectionParams rebuilds only that Section from its Recipe", () => {
    let ws = threeSectionSheet();
    ws = setSectionDirections(ws, 0, "Factor.");
    const params = { ...ws.sections[0].params, maxRoot: 3 };
    const next = setSectionParams(ws, 0, params);
    const s = next.sections[0];
    expect(s.params).toEqual(params);
    expect(s.baseSeed).toBe(ws.sections[0].baseSeed);
    expect(s.directions).toBe("Factor.");
    expect(s.problems).toHaveLength(3);
    for (const p of s.problems) expect(p.params).toMatchObject(params);
    expect(next.sections[1]).toBe(ws.sections[1]);
    expect(next.sections[2]).toBe(ws.sections[2]);
  });

  it("setSectionCount clamps to the limits and keeps the first Problems", () => {
    const ws = threeSectionSheet();
    const grown = setSectionCount(ws, 2, 6);
    expect(grown.sections[2].problems).toHaveLength(6);
    expect(grown.sections[2].count).toBe(6);
    expect(grown.sections[2].problems.slice(0, 4)).toEqual(ws.sections[2].problems);
    expect(setSectionCount(ws, 2, 0).sections[2].count).toBe(MIN_SECTION_PROBLEMS);
    expect(setSectionCount(ws, 2, 999).sections[2].count).toBe(MAX_SECTION_PROBLEMS);
    expect(setSectionCount(ws, 2, 4)).toBe(ws);
    expect(setSectionCount(ws, 9, 4)).toBe(ws);
  });

  it("clampSectionCount rounds and handles junk input", () => {
    expect(clampSectionCount(2.6)).toBe(3);
    expect(clampSectionCount(Number.NaN)).toBe(MIN_SECTION_PROBLEMS);
    expect(clampSectionCount(-4)).toBe(MIN_SECTION_PROBLEMS);
  });

  it("sectionRanges number Problems continuously across Sections", () => {
    const ws = threeSectionSheet();
    expect(sectionRanges(ws)).toEqual([
      { first: 1, last: 3 },
      { first: 4, last: 5 },
      { first: 6, last: 9 },
    ]);
    expect(sectionRanges(moveSection(ws, 2, 0))).toEqual([
      { first: 1, last: 4 },
      { first: 5, last: 7 },
      { first: 8, last: 9 },
    ]);
    expect(sectionRanges(emptyWorksheet())).toEqual([]);
  });

  it("sectionRanges stay continuous after any sequence of edits", () => {
    const op = fc.oneof(
      fc.record({ kind: fc.constant("add" as const), count: fc.integer({ min: 1, max: 8 }) }),
      fc.record({ kind: fc.constant("remove" as const), i: fc.nat(5) }),
      fc.record({ kind: fc.constant("move" as const), i: fc.nat(5), j: fc.nat(5) }),
      fc.record({ kind: fc.constant("dup" as const), i: fc.nat(5) }),
      fc.record({ kind: fc.constant("count" as const), i: fc.nat(5), count: fc.integer({ min: -3, max: 12 }) }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 12 }), (ops) => {
        let ws = emptyWorksheet();
        let seed = 1;
        for (const o of ops) {
          if (o.kind === "add") ws = addSection(ws, section(QUADRATIC_FACTORING_ID, seed++, o.count));
          if (o.kind === "remove") ws = removeSection(ws, o.i);
          if (o.kind === "move") ws = moveSection(ws, o.i, o.j);
          if (o.kind === "dup") ws = duplicateSection(ws, o.i, seed++);
          if (o.kind === "count") ws = setSectionCount(ws, o.i, o.count);
        }
        const ranges = sectionRanges(ws);
        let expected = 1;
        ranges.forEach((r, i) => {
          expect(r.first).toBe(expected);
          expect(r.last - r.first + 1).toBe(ws.sections[i].problems.length);
          expected = r.last + 1;
        });
        expect(expected - 1).toBe(problemCount(ws));
      }),
      { numRuns: 60 },
    );
  });

  it("sectionLetter labels Sections A to Z, then AA", () => {
    expect([0, 1, 25, 26, 27].map(sectionLetter)).toEqual(["A", "B", "Z", "AA", "AB"]);
  });
});

describe("isThrowaway", () => {
  it("is true only for a Worksheet with no Problems and no name of its own", () => {
    const blank = emptyWorksheet();
    expect(isThrowaway(blank)).toBe(true);
    expect(isThrowaway({ ...blank, title: "  " })).toBe(true);
    expect(isThrowaway({ ...blank, title: "Solving quadratics by factoring" })).toBe(true);
    expect(isThrowaway({ ...blank, title: "Unit 4 Quiz" })).toBe(false);
    const withProblems = buildWorksheet({ generatorId: "quadratic-factoring", baseSeed: 1, count: 3 });
    expect(isThrowaway(withProblems)).toBe(false);
  });
});
