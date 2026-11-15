import { describe, expect, it } from "vitest";
import type { Generator, ParamValues } from "./types";
import { coursesOf, GENERATORS, getGenerator, groupByUnit } from "./registry";

function stub(id: string, unit: string, title: string, course = "Algebra 2"): Generator {
  return {
    id,
    course,
    unit,
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

  it("files completing the square under Quadratics, after the formula", () => {
    const ids = GENERATORS.map((g) => g.id);
    expect(getGenerator("completing-the-square")?.unit).toBe("Quadratics");
    expect(ids.indexOf("completing-the-square")).toBeGreaterThan(
      ids.indexOf("quadratic-formula"),
    );
  });

  it("files the quadratic-inequalities topic under Quadratics", () => {
    const g = getGenerator("quadratic-inequalities");
    expect(g).toBeDefined();
    expect(g?.unit).toBe("Quadratics");
    const quadratics = groupByUnit().find((c) => c.name === "Quadratics");
    expect(quadratics?.generators).toContain(g);
  });

  it("every registered generator declares a Course and a Unit", () => {
    for (const g of GENERATORS) {
      expect(g.course).toBeTruthy();
      expect(g.unit).toBeTruthy();
    }
  });

  it("files properties of parabolas under Quadratics", () => {
    expect(getGenerator("parabola-properties")?.unit).toBe("Quadratics");
  });
});

describe("groupByUnit", () => {
  it("groups generators under their Unit", () => {
    const units = groupByUnit([
      stub("a", "Quadratics", "A"),
      stub("b", "Quadratics", "B"),
      stub("c", "Polynomials", "C"),
    ]);
    expect(units.map((c) => c.name)).toEqual(["Quadratics", "Polynomials"]);
    expect(units[0].generators.map((g) => g.id)).toEqual(["a", "b"]);
    expect(units[1].generators.map((g) => g.id)).toEqual(["c"]);
  });

  it("preserves registration order of units and topics", () => {
    const units = groupByUnit([
      stub("c", "Z", "C"),
      stub("a", "A", "A"),
      stub("b", "Z", "B"),
    ]);
    // Z appears first because its first member ("c") was registered first.
    expect(units.map((c) => c.name)).toEqual(["Z", "A"]);
    expect(units[0].generators.map((g) => g.id)).toEqual(["c", "b"]);
  });

  it("defaults to the live registry", () => {
    const units = groupByUnit();
    expect(units.length).toBeGreaterThan(0);
    expect(units[0].name).toBe("Quadratics");
  });
});

describe("coursesOf", () => {
  it("lists each Course with Topics once, in registration order", () => {
    expect(
      coursesOf([
        stub("a", "Quadratics", "A"),
        stub("b", "Limits", "B", "Precalculus"),
        stub("c", "Radicals", "C"),
      ]),
    ).toEqual(["Algebra 2", "Precalculus"]);
  });

  it("files every current Topic under Algebra 2", () => {
    expect(coursesOf()).toEqual(["Algebra 2"]);
  });
});
