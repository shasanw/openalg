import { describe, expect, it, vi } from "vitest";
import { GENERATORS, getGenerator } from "@/engine/registry";
import type { Generator, ParamValues } from "@/engine/types";
import {
  browseTopics,
  filterTopics,
  SAMPLE_SEEDS,
  sectionsByTopic,
  topicSample,
  usedLabel,
} from "./topicBrowser";

function stub(id: string, course: string, unit: string, title: string): Generator {
  return {
    id,
    course,
    unit,
    title,
    defaultDirections: "",
    schema: [],
    generate: (_params: ParamValues, seed: number) => ({
      kind: "generated",
      generatorId: id,
      params: {},
      seed,
      prompt: `${id}_{${seed}}`,
      answer: "",
      distractorHints: [],
    }),
  };
}

const TOPICS = [
  stub("factor", "Algebra 2", "Quadratics", "Solving quadratics by factoring"),
  stub("formula", "Algebra 2", "Quadratics", "Solving quadratics with the quadratic formula"),
  stub("qform", "Algebra 2", "Polynomials", "Solving quadratic-form equations"),
  stub("divide", "Algebra 2", "Polynomials", "Dividing polynomials"),
  stub("limits", "Precalculus", "Limits", "Evaluating limits"),
];

describe("filterTopics", () => {
  it("filters the registry by Topic title or Unit, grouped by Unit", () => {
    expect(filterTopics("quadratics").flatMap((u) => u.generators)).toHaveLength(GENERATORS.length);
    expect(filterTopics("factor").map((u) => u.name)).toEqual(["Quadratics"]);
    expect(filterTopics("nothing here")).toEqual([]);
  });
});

describe("browseTopics", () => {
  const browse = (query: string, unit: string | null = null, course = "Algebra 2") =>
    browseTopics({ topics: TOPICS, course, unit, query });

  it("lists only the chosen Course's Units that have Topics, with counts", () => {
    const v = browse("");
    expect(v.units).toEqual([
      { name: "Quadratics", count: 2 },
      { name: "Polynomials", count: 2 },
    ]);
    expect(v.total).toBe(4);
    expect(v.groups.map((g) => g.name)).toEqual(["Quadratics", "Polynomials"]);
    expect(browse("", null, "Precalculus").units).toEqual([{ name: "Limits", count: 1 }]);
  });

  it("counts follow the search and Units without matches drop out", () => {
    const v = browse("quadratic");
    expect(v.units).toEqual([
      { name: "Quadratics", count: 2 },
      { name: "Polynomials", count: 1 },
    ]);
    expect(v.total).toBe(3);
    expect(browse("dividing").units).toEqual([{ name: "Polynomials", count: 1 }]);
  });

  it("searches words in any order across title and Unit", () => {
    expect(browse("polynomials solving").flat.map((g) => g.id)).toEqual(["qform"]);
  });

  it("narrows to one Unit, keeping the Unit-wide search", () => {
    const v = browse("quadratic", "Polynomials");
    expect(v.unit).toBe("Polynomials");
    expect(v.flat.map((g) => g.id)).toEqual(["qform"]);
    expect(v.total).toBe(3);
  });

  it("falls back to All Units when the search empties the chosen Unit", () => {
    const v = browse("formula", "Polynomials");
    expect(v.unit).toBeNull();
    expect(v.flat.map((g) => g.id)).toEqual(["formula"]);
  });

  it("is empty when nothing matches", () => {
    const v = browse("zzz");
    expect(v).toMatchObject({ units: [], total: 0, groups: [], flat: [] });
  });
});

describe("Used in Section badges", () => {
  it("collects each Topic's Section letters in outline order", () => {
    const used = sectionsByTopic(["a", "b", "a", "c", "a"]);
    expect(used.get("a")).toEqual(["A", "C", "E"]);
    expect(used.get("b")).toEqual(["B"]);
    expect(used.get("z")).toBeUndefined();
  });

  it("names one, two or more Sections", () => {
    expect(usedLabel(["A"])).toBe("Used in Section A");
    expect(usedLabel(["B", "C"])).toBe("Used in Sections B and C");
    expect(usedLabel(["A", "B", "D"])).toBe("Used in Sections A, B and D");
  });
});

describe("topicSample", () => {
  it("shows two Problems from the default Topic Options with fixed seeds", () => {
    const g = getGenerator("quadratic-formula")!;
    const s = topicSample(g);
    expect(s.problems).toHaveLength(2);
    const defaults = Object.fromEntries(g.schema.map((f) => [f.key, f.default]));
    expect(s.problems).toEqual(SAMPLE_SEEDS.map((seed) => g.generate(defaults, seed).prompt));
    expect(s.options).toEqual(g.schema.map((f) => f.label));
    expect(s.directions).toBe(g.defaultDirections);
  });

  it("generates once per Topic", () => {
    const g = stub("once", "Algebra 2", "Quadratics", "Once");
    const spy = vi.spyOn(g, "generate");
    const first = topicSample(g);
    expect(topicSample(g)).toBe(first);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
