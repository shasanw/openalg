import { describe, expect, it } from "vitest";
import { GENERATORS } from "../registry";
import { COURSE_OUTLINES, coursesOf, groupByUnit, LISTINGS, listingFor } from ".";

describe("Course Outlines", () => {
  it("only list registered Topics", () => {
    const ids = new Set(GENERATORS.map((g) => g.id));
    for (const o of COURSE_OUTLINES)
      for (const u of o.units)
        for (const e of u.topics) expect(ids, `${o.course} > ${u.name}`).toContain(e.topic);
  });

  it("list every registered Topic somewhere", () => {
    const listed = new Set(LISTINGS.map((l) => l.topic.id));
    for (const g of GENERATORS) expect(listed, g.id).toContain(g.id);
  });

  it("give each Course a unique name and each Unit a unique name within its Course", () => {
    const courses = COURSE_OUTLINES.map((o) => o.course);
    expect(new Set(courses).size).toBe(courses.length);
    for (const o of COURSE_OUTLINES) {
      const units = o.units.map((u) => u.name);
      expect(new Set(units).size, o.course).toBe(units.length);
    }
  });

  it("list a Topic at most once per Course", () => {
    const keys = LISTINGS.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("set only real Topic Options, with valid values", () => {
    for (const o of COURSE_OUTLINES)
      for (const u of o.units)
        for (const e of u.topics) {
          const g = GENERATORS.find((x) => x.id === e.topic)!;
          for (const [key, value] of Object.entries(e.options ?? {})) {
            const where = `${o.course} > ${e.topic}.${key}`;
            const field = g.schema.find((f) => f.key === key);
            expect(field, where).toBeDefined();
            if (field?.type === "boolean") expect(typeof value, where).toBe("boolean");
            if (field?.type === "int") {
              expect(Number.isInteger(value), where).toBe(true);
              expect(value as number, where).toBeGreaterThanOrEqual(field.min);
              expect(value as number, where).toBeLessThanOrEqual(field.max);
            }
            if (field?.type === "enum") expect(field.options.map((x) => x.value), where).toContain(value);
          }
        }
  });

  it("orders Courses by curriculum, showing only those with Topics", () => {
    expect(coursesOf()).toEqual(["Algebra 1", "Algebra 2"]);
  });

  it("lists the quadratics Topics in both Algebra 1 and Algebra 2", () => {
    const where = (id: string) => LISTINGS.filter((l) => l.topic.id === id).map((l) => `${l.course} > ${l.unit}`);
    expect(where("quadratic-factoring")).toEqual(["Algebra 1 > Quadratic Functions", "Algebra 2 > Quadratics"]);
  });

  it("gives every listing the full set of starting Topic Options", () => {
    for (const l of LISTINGS) expect(Object.keys(l.options).sort()).toEqual(l.topic.schema.map((f) => f.key).sort());
  });

  it("hides Units with nothing listed", () => {
    const names = groupByUnit(LISTINGS.filter((l) => l.course === "Algebra 1")).map((u) => u.name);
    expect(names).toEqual(["Quadratic Functions"]);
  });

  it("finds a Topic's listing, preferring the given Course", () => {
    expect(listingFor("quadratic-factoring")?.course).toBe("Algebra 1");
    expect(listingFor("quadratic-factoring", "Algebra 2")?.unit).toBe("Quadratics");
    expect(listingFor("quadratic-factoring", "Precalculus")?.course).toBe("Algebra 1");
    expect(listingFor("nope")).toBeUndefined();
  });
});
