import { describe, expect, it } from "vitest";
import type { Generator, ParamValues } from "./types";
import { GENERATORS, getGenerator, groupByChapter } from "./registry";

function stub(id: string, chapter: string, title: string): Generator {
  return {
    id,
    chapter,
    title,
    defaultDirections: "",
    schema: [],
    generate: (_params: ParamValues, _seed: number) => ({
      kind: "generated",
      generatorId: id,
      params: {},
      seed: 0,
      prompt: "",
      answer: "",
      distractorHints: [],
    }),
  };
}

describe("registry", () => {
  it("looks up every registered generator by id", () => {
    for (const g of GENERATORS) {
      expect(getGenerator(g.id)).toBe(g);
    }
  });

  it("files the quadratic-inequalities topic under Quadratics", () => {
    const g = getGenerator("quadratic-inequalities");
    expect(g).toBeDefined();
    expect(g?.chapter).toBe("Quadratics");
    const quadratics = groupByChapter().find((c) => c.name === "Quadratics");
    expect(quadratics?.generators).toContain(g);
  });

  it("every registered generator declares a chapter", () => {
    for (const g of GENERATORS) {
      expect(g.chapter).toBeTruthy();
    }
  });
});

describe("groupByChapter", () => {
  it("groups generators under their chapter", () => {
    const chapters = groupByChapter([
      stub("a", "Quadratics", "A"),
      stub("b", "Quadratics", "B"),
      stub("c", "Polynomials", "C"),
    ]);
    expect(chapters.map((c) => c.name)).toEqual(["Quadratics", "Polynomials"]);
    expect(chapters[0].generators.map((g) => g.id)).toEqual(["a", "b"]);
    expect(chapters[1].generators.map((g) => g.id)).toEqual(["c"]);
  });

  it("preserves registration order of chapters and topics", () => {
    const chapters = groupByChapter([
      stub("c", "Z", "C"),
      stub("a", "A", "A"),
      stub("b", "Z", "B"),
    ]);
    // Z appears first because its first member ("c") was registered first.
    expect(chapters.map((c) => c.name)).toEqual(["Z", "A"]);
    expect(chapters[0].generators.map((g) => g.id)).toEqual(["c", "b"]);
  });

  it("defaults to the live registry", () => {
    const chapters = groupByChapter();
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters[0].name).toBe("Quadratics");
  });
});
