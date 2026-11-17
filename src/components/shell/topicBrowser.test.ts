import { describe, expect, it, vi } from "vitest";
import type { Listing } from "@/engine/courses";
import { getGenerator } from "@/engine/registry";
import type { Generator, ParamValues } from "@/engine/types";
import {
  browseTopics,
  searchListings,
  SAMPLE_SEEDS,
  sectionsByTopic,
  topicSample,
  usedLabel,
} from "./topicBrowser";

function stub(id: string, title: string): Generator {
  return {
    id,
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

function listing(id: string, course: string, unit: string, title: string): Listing {
  return { key: `${course}/${id}`, course, unit, topic: stub(id, title), options: {} };
}

const LISTINGS = [
  listing("factor", "Algebra 2", "Quadratics", "Solving quadratics by factoring"),
  listing("formula", "Algebra 2", "Quadratics", "Solving quadratics with the quadratic formula"),
  listing("qform", "Algebra 2", "Polynomials", "Solving quadratic-form equations"),
  listing("divide", "Algebra 2", "Polynomials", "Dividing polynomials"),
  listing("limits", "Precalculus", "Limits", "Evaluating limits"),
];

describe("searchListings", () => {
  it("matches every word against the Topic title, Unit or Course", () => {
    expect(searchListings("factor", LISTINGS).map((l) => l.key)).toEqual(["Algebra 2/factor"]);
    expect(searchListings("precalculus", LISTINGS).map((l) => l.key)).toEqual(["Precalculus/limits"]);
    expect(searchListings("nothing here", LISTINGS)).toEqual([]);
  });
});

describe("browseTopics", () => {
  const browse = (query: string, unit: string | null = null, course = "Algebra 2") =>
    browseTopics({ listings: LISTINGS, course, unit, query });

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
    expect(browse("polynomials solving").flat.map((l) => l.topic.id)).toEqual(["qform"]);
  });

  it("narrows to one Unit, keeping the Unit-wide search", () => {
    const v = browse("quadratic", "Polynomials");
    expect(v.unit).toBe("Polynomials");
    expect(v.flat.map((l) => l.topic.id)).toEqual(["qform"]);
    expect(v.total).toBe(3);
  });

  it("falls back to All Units when the search empties the chosen Unit", () => {
    const v = browse("formula", "Polynomials");
    expect(v.unit).toBeNull();
    expect(v.flat.map((l) => l.topic.id)).toEqual(["formula"]);
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

  it("carries the blank grid a graphing Topic prints with its Problems, and no graph otherwise", () => {
    const graphing = topicSample(getGenerator("graphing-quadratics")!);
    expect(graphing.graph).toMatch(/^<svg [^]*<\/svg>$/);
    // a blank grid: no curve, no points, nothing in an ink
    expect(graphing.graph).not.toContain("<circle");
    expect(graphing.graph).not.toContain("#c62828");
    expect(topicSample(getGenerator("quadratic-formula")!).graph).toBeNull();
  });

  it("starts from the given Topic Options", () => {
    const g = getGenerator("quadratic-factoring")!;
    expect(topicSample(g, { maxRoot: 3 }).problems).toEqual(
      SAMPLE_SEEDS.map((seed) => g.generate({ ...Object.fromEntries(g.schema.map((f) => [f.key, f.default])), maxRoot: 3 }, seed).prompt),
    );
  });

  it("generates once per Topic and Topic Options", () => {
    const g = stub("once", "Once");
    const spy = vi.spyOn(g, "generate");
    const first = topicSample(g);
    expect(topicSample(g)).toBe(first);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
