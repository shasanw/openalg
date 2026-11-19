import { describe, expect, it } from "vitest";
import { GENERATORS, getGenerator } from "./registry";

describe("registry", () => {
  it("looks up every registered generator by id", () => {
    for (const g of GENERATORS) {
      expect(getGenerator(g.id)).toBe(g);
    }
  });

  it("gives every Topic a unique id", () => {
    const ids = GENERATORS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns undefined for an unknown id", () => {
    expect(getGenerator("nope")).toBeUndefined();
  });
});
