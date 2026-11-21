import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { serializeWorksheet, deserializeWorksheet } from "./persist";
import {
  buildSection,
  buildWorksheet,
  regenerateAll,
  DEFAULT_PRINT_CONFIG,
  DEFAULT_RESPONSE_FORMAT,
  ANSWER_KEY_FORMATS,
  DEFAULT_VERSION_SETTINGS,
  SCRAMBLE_MODES,
  setResponseFormat,
  setVersionSettings,
  type Worksheet,
} from "./worksheet";
import { buildTypstDocument } from "./typst";
import { trigWindow, triangleFromSides, type TriangleSpec } from "./plot";
import { QUADRATIC_FACTORING_ID } from "./generators/quadratics/quadraticFactoring";
import { QUADRATIC_FORMULA_ID } from "./generators/quadratics/quadraticFormula";
import { GRAPHING_QUADRATICS_ID } from "./generators/quadratics/graphingQuadratics";
import { QUADRATIC_INEQUALITIES_ID } from "./generators/quadratics/quadraticInequalities";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });

function sampleWorksheet(baseSeed = 42, count = 8): Worksheet {
  return buildWorksheet({
    generatorId: QUADRATIC_FACTORING_ID,
    baseSeed,
    count,
    title: "My Sheet",
    directions: "Solve each.",
  });
}

function twoSectionWorksheet(): Worksheet {
  const ws = sampleWorksheet(3, 4);
  const second = buildSection({
    generatorId: QUADRATIC_FORMULA_ID,
    params: { rootType: "irrational" },
    baseSeed: 9,
    count: 3,
    directions: "Use the quadratic formula.",
  });
  return { ...ws, sections: [...ws.sections, second] };
}

/**
 * The version 1 (desktop-era) file for `ws`, a single-Section Worksheet: its
 * Section's fields at the top level, in the key order v1 files were written.
 */
function asV1File(ws: Worksheet, opts: { print?: boolean } = {}): string {
  const [s] = ws.sections;
  const v1: Record<string, unknown> = {
    version: 1,
    title: ws.title,
    generatorId: s.generatorId,
    params: s.params,
    directions: s.directions,
    baseSeed: s.baseSeed,
    count: s.count,
    problems: s.problems,
  };
  if (opts.print !== false) v1.print = ws.print;
  return JSON.stringify(v1, null, 2);
}

describe("serializeWorksheet / deserializeWorksheet", () => {
  it("round-trips: save then load yields an equivalent worksheet model", () => {
    fc.assert(
      fc.property(anySeed, (baseSeed) => {
        const ws = sampleWorksheet(baseSeed);
        const loaded = deserializeWorksheet(serializeWorksheet(ws));
        expect(loaded).toEqual(ws);
      }),
    );
  });

  it("reopens byte-identical: the loaded JSON matches the saved JSON", () => {
    const ws = sampleWorksheet();
    const json = serializeWorksheet(ws);
    // A second serialize of the loaded sheet reproduces the exact same bytes —
    // the baked content survives a save/load with no drift.
    expect(serializeWorksheet(deserializeWorksheet(json))).toBe(json);
  });

  it("round-trips a multi-Section version 2 Worksheet byte-identically", () => {
    const ws = twoSectionWorksheet();
    const json = serializeWorksheet(ws);
    const loaded = deserializeWorksheet(json);
    expect(loaded).toEqual(ws);
    expect(serializeWorksheet(loaded)).toBe(json);
  });

  it("new Worksheets save as version 2 with exactly one Section", () => {
    const data = JSON.parse(serializeWorksheet(sampleWorksheet()));
    expect(data.version).toBe(2);
    expect(data.sections).toHaveLength(1);
    expect(data.generatorId).toBeUndefined();
    expect(data.problems).toBeUndefined();
  });

  it("the saved file contains both the baked problems and the recipe", () => {
    const ws = sampleWorksheet();
    const data = JSON.parse(serializeWorksheet(ws));
    const [section] = data.sections;

    // Recipe at the Section level.
    expect(section.generatorId).toBe(QUADRATIC_FACTORING_ID);
    expect(typeof section.baseSeed).toBe("number");
    expect(section.count).toBe(ws.sections[0].count);
    expect(section.params).toEqual(ws.sections[0].params);
    expect(section.directions).toBe("Solve each.");

    // Each problem carries its own recipe AND its baked content.
    for (const p of section.problems) {
      expect(typeof p.generatorId).toBe("string"); // recipe
      expect(typeof p.seed).toBe("number"); // recipe
      expect(p.params).toBeTypeOf("object"); // recipe
      expect(typeof p.prompt).toBe("string"); // baked
      expect(typeof p.answer).toBe("string"); // baked
    }
  });

  it("regenerate-all on a loaded sheet keeps params but produces new problems", () => {
    const loaded = deserializeWorksheet(serializeWorksheet(sampleWorksheet(7)));
    const before = loaded.sections[0];
    const fresh = regenerateAll(loaded, before.baseSeed + 1).sections[0];

    expect(fresh.generatorId).toBe(before.generatorId);
    expect(fresh.params).toEqual(before.params);
    expect(fresh.count).toBe(before.count);
    // Same recipe, new seeds -> a different set of baked prompts.
    expect(fresh.problems.map((p) => p.prompt)).not.toEqual(
      before.problems.map((p) => p.prompt),
    );
  });
});

describe("deserializeWorksheet validation", () => {
  it("rejects malformed JSON", () => {
    expect(() => deserializeWorksheet("{ not json")).toThrow(/valid JSON/);
  });

  it("rejects JSON that isn't a worksheet object", () => {
    expect(() => deserializeWorksheet("[]")).toThrow(/JSON object/);
    expect(() => deserializeWorksheet("42")).toThrow(/JSON object/);
  });

  it("rejects an unsupported version", () => {
    for (const version of [3, 0, "2", undefined]) {
      const ws = { ...sampleWorksheet(), version };
      expect(() => deserializeWorksheet(JSON.stringify(ws))).toThrow(/version/);
    }
  });

  it("rejects a version 2 worksheet with no sections list", () => {
    const { sections: _omit, ...rest } = sampleWorksheet();
    expect(() => deserializeWorksheet(JSON.stringify(rest))).toThrow(/sections/);
  });

  it("round-trips a new Worksheet that has no Sections yet", () => {
    const empty = { ...sampleWorksheet(), sections: [] };
    const loaded = deserializeWorksheet(serializeWorksheet(empty));
    expect(loaded.sections).toEqual([]);
    expect(loaded.title).toBe(empty.title);
  });

  it("rejects a Section missing required fields", () => {
    const ws = twoSectionWorksheet();
    const { generatorId: _omit, ...rest } = ws.sections[1];
    const broken = { ...ws, sections: [ws.sections[0], rest] };
    expect(() => deserializeWorksheet(JSON.stringify(broken))).toThrow(
      /section 1 missing generatorId/,
    );
  });

  it("rejects a problem with baked content missing", () => {
    const ws = sampleWorksheet();
    const s = ws.sections[0];
    const broken = {
      ...ws,
      sections: [
        {
          ...s,
          problems: [{ ...s.problems[0], prompt: undefined }, ...s.problems.slice(1)],
        },
      ],
    };
    expect(() => deserializeWorksheet(JSON.stringify(broken))).toThrow(/prompt/);
  });

  it("backfills the print config on a file with no print block", () => {
    const { print: _drop, ...legacy } = sampleWorksheet();
    const loaded = deserializeWorksheet(JSON.stringify(legacy));
    expect(loaded.print).toEqual(DEFAULT_PRINT_CONFIG);
  });
});

describe("version 1 upgrade", () => {
  it("opens a v1 file as an identical single-Section v2 Worksheet", () => {
    fc.assert(
      fc.property(anySeed, (baseSeed) => {
        const ws = sampleWorksheet(baseSeed);
        expect(deserializeWorksheet(asV1File(ws))).toEqual(ws);
      }),
    );
  });

  it("a v1 file prints exactly like the Worksheet it came from", () => {
    const ws = {
      ...sampleWorksheet(11, 6),
      print: { ...DEFAULT_PRINT_CONFIG, paper: "a4" as const, spacing: "roomy" as const },
    };
    const upgraded = deserializeWorksheet(asV1File(ws));
    expect(buildTypstDocument(upgraded)).toEqual(buildTypstDocument(ws));
  });

  it("backfills print on a pre-#7 v1 file", () => {
    const ws = sampleWorksheet();
    expect(deserializeWorksheet(asV1File(ws, { print: false }))).toEqual(ws);
  });

  it("saves an upgraded v1 file back out as version 2", () => {
    const ws = sampleWorksheet();
    const resaved = serializeWorksheet(deserializeWorksheet(asV1File(ws)));
    expect(resaved).toBe(serializeWorksheet(ws));
    expect(JSON.parse(resaved).version).toBe(2);
  });

  it("still validates v1 files", () => {
    const v1 = JSON.parse(asV1File(sampleWorksheet()));
    delete v1.generatorId;
    expect(() => deserializeWorksheet(JSON.stringify(v1))).toThrow(/generatorId/);
    const v1b = JSON.parse(asV1File(sampleWorksheet()));
    v1b.problems[0].answer = 3;
    expect(() => deserializeWorksheet(JSON.stringify(v1b))).toThrow(/answer/);
  });
});

describe("Response Format (multiple choice)", () => {
  const mcSheet = (): Worksheet => ({
    ...sampleWorksheet(),
    responseFormat: { mode: "multiple-choice", choices: 3 },
  });

  it("round-trips a multiple-choice Worksheet byte-identically", () => {
    const json = serializeWorksheet(mcSheet());
    expect(serializeWorksheet(deserializeWorksheet(json))).toBe(json);
    expect(deserializeWorksheet(json).responseFormat).toEqual({
      mode: "multiple-choice",
      choices: 3,
    });
  });

  it("a reopened multiple-choice Worksheet prints the same choices and key", () => {
    const ws = mcSheet();
    const loaded = deserializeWorksheet(serializeWorksheet(ws));
    expect(buildTypstDocument(loaded, { keyFormat: "full" })).toEqual(
      buildTypstDocument(ws, { keyFormat: "full" }),
    );
  });

  it("loads a file saved before #5 as free response", () => {
    const { responseFormat: _drop, ...legacy } = sampleWorksheet();
    const loaded = deserializeWorksheet(JSON.stringify(legacy));
    expect(loaded.responseFormat).toEqual(DEFAULT_RESPONSE_FORMAT);
    expect(loaded.responseFormat.mode).toBe("free-response");
  });

  it("v1 files load as free response", () => {
    expect(
      deserializeWorksheet(asV1File(sampleWorksheet())).responseFormat,
    ).toEqual(DEFAULT_RESPONSE_FORMAT);
  });

  it("clamps an out-of-range choice count", () => {
    const ws = { ...mcSheet(), responseFormat: { mode: "multiple-choice", choices: 9 } };
    expect(deserializeWorksheet(JSON.stringify(ws)).responseFormat.choices).toBe(5);
  });

  it("rejects a malformed responseFormat", () => {
    const bad = { ...mcSheet(), responseFormat: { mode: "essay", choices: 4 } };
    expect(() => deserializeWorksheet(JSON.stringify(bad))).toThrow(/responseFormat/);
    const bad2 = { ...mcSheet(), responseFormat: { mode: "multiple-choice" } };
    expect(() => deserializeWorksheet(JSON.stringify(bad2))).toThrow(/choices/);
  });
});

describe("Answer Key format", () => {
  it("round-trips every format byte-identically", () => {
    for (const answerKeyFormat of ANSWER_KEY_FORMATS) {
      const json = serializeWorksheet({ ...sampleWorksheet(), answerKeyFormat });
      expect(serializeWorksheet(deserializeWorksheet(json))).toBe(json);
      expect(deserializeWorksheet(json).answerKeyFormat).toBe(answerKeyFormat);
    }
  });

  it("loads a file saved before #6 with the full key it always printed", () => {
    const { answerKeyFormat: _drop, ...legacy } = sampleWorksheet();
    const loaded = deserializeWorksheet(JSON.stringify(legacy));
    expect(loaded.answerKeyFormat).toBe("full");
    expect(buildTypstDocument(loaded)).toEqual(
      buildTypstDocument(sampleWorksheet(), { keyFormat: "full" }),
    );
  });

  it("v1 files load with a full key", () => {
    expect(deserializeWorksheet(asV1File(sampleWorksheet())).answerKeyFormat).toBe("full");
  });

  it("rejects an unknown format", () => {
    const bad = { ...sampleWorksheet(), answerKeyFormat: "evens" };
    expect(() => deserializeWorksheet(JSON.stringify(bad))).toThrow(/answerKeyFormat/);
  });
});

describe("Versions setting", () => {
  it("round-trips the Version count and Scramble Mode byte-identically", () => {
    for (const mode of SCRAMBLE_MODES) {
      const ws = setVersionSettings(sampleWorksheet(), { count: 4, mode });
      const json = serializeWorksheet(ws);
      expect(serializeWorksheet(deserializeWorksheet(json))).toBe(json);
      expect(deserializeWorksheet(json).versions).toEqual({ count: 4, mode });
    }
  });

  it("saves only the setting, never the derived Versions", () => {
    const ws = setVersionSettings(sampleWorksheet(), { count: 3, mode: "new-questions" });
    const saved = JSON.parse(serializeWorksheet(ws));
    expect(saved.versions).toEqual({ count: 3, mode: "new-questions" });
    expect(saved.sections).toHaveLength(1);
    expect(saved.sections[0].problems).toEqual(ws.sections[0].problems);
  });

  it("a reopened multi-Version Worksheet prints every Version identically", () => {
    const ws = setVersionSettings(
      setResponseFormat(sampleWorksheet(), { mode: "multiple-choice", choices: 4 }),
      { count: 3, mode: "scramble-choices" },
    );
    const loaded = deserializeWorksheet(serializeWorksheet(ws));
    expect(buildTypstDocument(loaded, { version: "all" })).toEqual(
      buildTypstDocument(ws, { version: "all" }),
    );
  });

  it("loads a file saved before #11 as one Version that prints as before", () => {
    const { versions: _drop, ...legacy } = sampleWorksheet();
    const loaded = deserializeWorksheet(JSON.stringify(legacy));
    expect(loaded.versions).toEqual(DEFAULT_VERSION_SETTINGS);
    expect(loaded.versions.count).toBe(1);
    expect(buildTypstDocument(loaded, { version: "all" })).toEqual(
      buildTypstDocument(sampleWorksheet()),
    );
  });

  it("v1 files load as one Version", () => {
    expect(deserializeWorksheet(asV1File(sampleWorksheet())).versions).toEqual(
      DEFAULT_VERSION_SETTINGS,
    );
  });

  it("clamps an out-of-range Version count", () => {
    const hi = { ...sampleWorksheet(), versions: { count: 99, mode: "scramble-order" } };
    expect(deserializeWorksheet(JSON.stringify(hi)).versions.count).toBe(10);
    const lo = { ...sampleWorksheet(), versions: { count: 0, mode: "scramble-order" } };
    expect(deserializeWorksheet(JSON.stringify(lo)).versions.count).toBe(1);
  });

  it("rejects a malformed versions setting", () => {
    for (const versions of [7, { count: 2 }, { count: "2", mode: "scramble-order" }, { count: 2, mode: "shuffle" }]) {
      const bad = { ...sampleWorksheet(), versions };
      expect(() => deserializeWorksheet(JSON.stringify(bad))).toThrow(/versions/);
    }
  });
});

describe("graphs (#9)", () => {
  function graphWorksheet(): Worksheet {
    const ws = buildWorksheet({ generatorId: GRAPHING_QUADRATICS_ID, baseSeed: 5, count: 4 });
    const line = buildSection({
      generatorId: QUADRATIC_INEQUALITIES_ID,
      params: { showNumberLine: true, criticalPoints: "rational" },
      baseSeed: 6,
      count: 3,
    });
    return { ...ws, sections: [...ws.sections, line] };
  }

  it("round-trips Problems with a graph and an answer graph byte-identically", () => {
    const ws = graphWorksheet();
    expect(ws.sections[0].problems[0].graph?.kind).toBe("plane");
    expect(ws.sections[1].problems[0].answerGraph?.kind).toBe("numberLine");
    const json = serializeWorksheet(ws);
    const loaded = deserializeWorksheet(json);
    expect(loaded).toEqual(ws);
    expect(serializeWorksheet(loaded)).toBe(json);
  });

  it("a reopened Worksheet draws the same graphs in every key format", () => {
    const ws = setResponseFormat(graphWorksheet(), { mode: "multiple-choice", choices: 4 });
    const loaded = deserializeWorksheet(serializeWorksheet(ws));
    for (const keyFormat of ANSWER_KEY_FORMATS) {
      expect(buildTypstDocument(loaded, { keyFormat })).toEqual(buildTypstDocument(ws, { keyFormat }));
    }
  });

  it("loads a file saved before #9, whose Problems have no graphs", () => {
    const ws = graphWorksheet();
    const old = JSON.parse(serializeWorksheet(ws));
    for (const s of old.sections) {
      for (const p of s.problems) {
        delete p.graph;
        delete p.answerGraph;
      }
    }
    const loaded = deserializeWorksheet(JSON.stringify(old));
    expect(loaded.version).toBe(2);
    expect(loaded.sections[0].problems[0].graph).toBeUndefined();
    expect(() => buildTypstDocument(loaded, { keyFormat: "in-context" })).not.toThrow();
  });

  /** The graph sheet with trig curves and triangle diagrams (student and answer) in place of its first graphs. */
  function trigWorksheet(): Worksheet {
    const ws = graphWorksheet();
    const window = trigWindow([3, -1]);
    const [A, B, C] = triangleFromSides(7, 9, 12);
    const triangle = (answer: boolean): TriangleSpec => ({
      kind: "triangle",
      corners: [
        { ...A, name: "A", angle: { text: "35°" }, opposite: { text: "7" } },
        { ...B, name: "B", angle: answer ? { text: "48.2°", answer: true } : { text: "θ" }, opposite: { text: "9 cm" } },
        { ...C, name: "C", opposite: { text: "12" } },
      ],
    });
    const problems = ws.sections[0].problems.map((p, i) =>
      i === 0
        ? { ...p, graph: window, answerGraph: { ...window, curves: [{ kind: "trig" as const, fn: "tan" as const, a: 2, b: 0.5, c: Math.PI / 3, d: 1 }] } }
        : i === 1
          ? { ...p, graph: triangle(false), answerGraph: triangle(true) }
          : p,
    );
    return { ...ws, sections: [{ ...ws.sections[0], problems }, ...ws.sections.slice(1)] };
  }

  it("round-trips trig curves and triangle diagrams byte-identically, drawing the same in every key format", () => {
    const ws = trigWorksheet();
    const json = serializeWorksheet(ws);
    const loaded = deserializeWorksheet(json);
    expect(loaded).toEqual(ws);
    expect(serializeWorksheet(loaded)).toBe(json);
    for (const keyFormat of ANSWER_KEY_FORMATS) {
      expect(buildTypstDocument(loaded, { keyFormat })).toEqual(buildTypstDocument(ws, { keyFormat }));
    }
  });

  it("rejects a damaged trig curve or triangle", () => {
    const data = JSON.parse(serializeWorksheet(trigWorksheet()));
    data.sections[0].problems[0].answerGraph.curves[0].fn = "sinh";
    expect(() => deserializeWorksheet(JSON.stringify(data))).toThrow(/problem 0 answerGraph has invalid curves/);
    data.sections[0].problems[0].answerGraph = undefined;
    data.sections[0].problems[1].graph.corners[2].x = data.sections[0].problems[1].graph.corners[0].x;
    data.sections[0].problems[1].graph.corners[2].y = data.sections[0].problems[1].graph.corners[0].y;
    expect(() => deserializeWorksheet(JSON.stringify(data))).toThrow(/problem 1 graph is too thin to draw/);
  });

  it("rejects a damaged graph instead of breaking the Preview", () => {
    const data = JSON.parse(serializeWorksheet(graphWorksheet()));
    data.sections[0].problems[1].answerGraph = { kind: "plane", x: { min: 3, max: 1 } };
    expect(() => deserializeWorksheet(JSON.stringify(data))).toThrow(
      /problem 1 answerGraph has an invalid window/,
    );
    data.sections[0].problems[1].answerGraph = undefined;
    data.sections[0].problems[1].graph = "grid";
    expect(() => deserializeWorksheet(JSON.stringify(data))).toThrow(/problem 1 graph is not an object/);
  });
});
