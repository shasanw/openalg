import { describe, expect, it, vi } from "vitest";
import type { Listing } from "@/engine/courses";
import { getGenerator } from "@/engine/registry";
import type { Generator, ParamValues } from "@/engine/types";
import {
  browseTopics,
  initialCourse,
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

const FIXTURE = [
  listing("factor", "Algebra 2", "Quadratics", "Solving quadratics by factoring"),
  listing("formula", "Algebra 2", "Quadratics", "Solving quadratics with the quadratic formula"),
  listing("qform", "Algebra 2", "Polynomials", "Solving quadratic-form equations"),
  listing("divide", "Algebra 2", "Polynomials", "Dividing polynomials"),
  listing("limits", "Precalculus", "Limits", "Evaluating limits"),
];

/** Three Courses, with factoring quadratics listed in two of them. */
const CROSS = [
  listing("slope", "Algebra 1", "Linear Equations", "Finding slope from two points"),
  listing("trinomials", "Algebra 1", "Factoring", "Factoring trinomials"),
  listing("factor-quad", "Algebra 1", "Quadratic Functions", "Solving quadratics by factoring"),
  listing("factor-quad", "Algebra 2", "Quadratics", "Solving quadratics by factoring"),
  listing("formula", "Algebra 2", "Quadratics", "Solving quadratics with the quadratic formula"),
  listing("divide", "Algebra 2", "Polynomials", "Dividing polynomials by factoring"),
  listing("limits", "Precalculus", "Limits", "Evaluating limits by factoring"),
];

const keys = (ls: readonly Listing[]) => ls.map((l) => l.key);

describe("searchListings", () => {
  it("matches every word against the Topic title, Unit or Course", () => {
    expect(keys(searchListings("factor", FIXTURE))).toEqual(["Algebra 2/factor"]);
    expect(keys(searchListings("precalculus", FIXTURE))).toEqual(["Precalculus/limits"]);
    expect(searchListings("nothing here", FIXTURE)).toEqual([]);
  });

  it("returns everything, in outline order, for an empty query", () => {
    expect(keys(searchListings("  ", FIXTURE))).toEqual(keys(FIXTURE));
  });

  it("tolerates prefixes and typos in the real Course Outlines", () => {
    const ids = (q: string) => new Set(searchListings(q).map((l) => l.topic.id));
    expect(ids("factr quad")).toEqual(new Set(["quadratic-factoring"]));
    const quadratics = ids("qaudratic");
    for (const id of [
      "quadratic-factoring",
      "quadratic-formula",
      "completing-the-square",
      "quadratic-inequalities",
      "graphing-quadratics",
    ])
      expect(quadratics, id).toContain(id);
  });

  it("finds a Topic listed in two Courses once under each", () => {
    expect(searchListings("factr quad").map((l) => l.course).sort()).toEqual(["Algebra 1", "Algebra 2"]);
  });

  it("narrows by Course words", () => {
    const r = searchListings("alg 1 factoring", CROSS);
    expect(keys(r).sort()).toEqual(["Algebra 1/factor-quad", "Algebra 1/trinomials"]);
    expect(keys(searchListings("alg 1 slope", CROSS))).toEqual(["Algebra 1/slope"]);
    const real = searchListings("alg 1 factoring");
    expect(real.length).toBeGreaterThan(0);
    expect(real.every((l) => l.course === "Algebra 1")).toBe(true);
  });

  it("ranks a title match above a Unit-only match", () => {
    const listings = [
      listing("u", "Algebra 2", "Polynomials", "Long division"),
      listing("t", "Algebra 2", "Functions", "Adding polynomials"),
    ];
    expect(keys(searchListings("polynomials", listings))).toEqual(["Algebra 2/t", "Algebra 2/u"]);
  });
});

describe("browseTopics", () => {
  const unit = (name: string, course = "Algebra 2") => ({ course, name });
  const browse = (query: string, u: ReturnType<typeof unit> | null = null, course = "Algebra 2") =>
    browseTopics({ listings: FIXTURE, course, unit: u, query });

  it("lists only the chosen Course's Units that have Topics, with counts", () => {
    const v = browse("");
    expect(v.scope).toBe("course");
    expect(v.units).toEqual([
      { course: "Algebra 2", name: "Quadratics", count: 2 },
      { course: "Algebra 2", name: "Polynomials", count: 2 },
    ]);
    expect(v.total).toBe(4);
    expect(v.groups.map((g) => g.name)).toEqual(["Quadratics", "Polynomials"]);
    expect(browse("", null, "Precalculus").units).toEqual([{ course: "Precalculus", name: "Limits", count: 1 }]);
  });

  it("searches every Course once there is a query", () => {
    const v = browse("limits");
    expect(v.scope).toBe("all");
    expect(keys(v.flat)).toEqual(["Precalculus/limits"]);
  });

  it("counts follow the search and Units without matches drop out", () => {
    const v = browse("quadratic");
    expect(v.units.map((u) => [u.name, u.count])).toEqual([
      ["Quadratics", 2],
      ["Polynomials", 1],
    ]);
    expect(v.total).toBe(3);
    expect(browse("dividing").units.map((u) => u.name)).toEqual(["Polynomials"]);
  });

  it("searches words in any order across title and Unit", () => {
    expect(browse("polynomials solving").flat.map((l) => l.topic.id)).toEqual(["qform"]);
  });

  it("narrows to one Unit", () => {
    const v = browse("", unit("Polynomials"));
    expect(v.unit).toEqual(unit("Polynomials"));
    expect(v.flat.map((l) => l.topic.id)).toEqual(["qform", "divide"]);
    expect(v.total).toBe(4);
    const s = browse("quadratic", unit("Polynomials"));
    expect(s.flat.map((l) => l.topic.id)).toEqual(["qform"]);
    expect(s.total).toBe(3);
  });

  it("falls back to All Units when the search empties the chosen Unit", () => {
    const v = browse("formula", unit("Polynomials"));
    expect(v.unit).toBeNull();
    expect(v.flat.map((l) => l.topic.id)).toEqual(["formula"]);
  });

  it("tells same-named Units in different Courses apart", () => {
    const listings = [
      listing("a", "Algebra 1", "Quadratics", "Graphing quadratics"),
      listing("a", "Algebra 2", "Quadratics", "Graphing quadratics"),
    ];
    const v = browseTopics({ listings, course: "Algebra 1", unit: unit("Quadratics"), query: "graph" });
    expect(keys(v.flat)).toEqual(["Algebra 2/a"]);
  });

  it("groups a cross-Course search Course > Unit, chosen Course first", () => {
    const groups = (course: string) =>
      browseTopics({ listings: CROSS, course, unit: null, query: "factoring" }).groups.map(
        (g) => `${g.course} > ${g.name}`,
      );
    const a2 = groups("Algebra 2");
    expect(a2.map((g) => g.split(" > ")[0])).toEqual([
      "Algebra 2",
      "Algebra 2",
      "Algebra 1",
      "Algebra 1",
      "Precalculus",
    ]);
    expect(groups("Precalculus")[0]).toBe("Precalculus > Limits");
    expect(groups("Algebra 1").map((g) => g.split(" > ")[0])).toEqual([
      "Algebra 1",
      "Algebra 1",
      "Algebra 2",
      "Algebra 2",
      "Precalculus",
    ]);
  });

  it("orders Units within a Course by their best match", () => {
    // In Algebra 1 the Factoring Unit matches by Unit name and title, so it
    // beats Quadratic Functions (title only), though the outline lists it second.
    const v = browseTopics({ listings: CROSS, course: "Algebra 1", unit: null, query: "factoring" });
    expect(v.groups.slice(0, 2).map((g) => g.name)).toEqual(["Factoring", "Quadratic Functions"]);
  });

  it("is empty when nothing matches", () => {
    const v = browse("zzz");
    expect(v).toMatchObject({ units: [], total: 0, groups: [], flat: [] });
  });
});

describe("initialCourse", () => {
  const start = (sections: string[], remembered: string | null = null) =>
    initialCourse({ sections, remembered, listings: CROSS });

  it("follows the last Section's Topic", () => {
    expect(start(["slope", "limits"])).toBe("Precalculus");
    expect(start(["limits", "slope"], "Precalculus")).toBe("Algebra 1");
  });

  it("prefers the remembered Course when it lists the last Section's Topic", () => {
    expect(start(["factor-quad"])).toBe("Algebra 1");
    expect(start(["factor-quad"], "Algebra 2")).toBe("Algebra 2");
    expect(start(["factor-quad"], "Precalculus")).toBe("Algebra 1");
  });

  it("falls back to the remembered Course, then the first Course", () => {
    expect(start([], "Algebra 2")).toBe("Algebra 2");
    expect(start(["unlisted"], "Precalculus")).toBe("Precalculus");
    expect(start([], "Geometry")).toBe("Algebra 1");
    expect(start([])).toBe("Algebra 1");
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
