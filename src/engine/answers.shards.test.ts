// The answer shards together cover every registered Topic exactly once.
import { describe, expect, it } from "vitest";
import { ANSWER_SHARDS, answerTopicsOfShard } from "./answers.allGenerators.testkit";
import { GENERATORS } from "./registry";

describe("answer shards", () => {
  it("cover every Topic exactly once", () => {
    const ids = Array.from({ length: ANSWER_SHARDS }, (_, i) => answerTopicsOfShard(i).map((g) => g.id)).flat();
    expect(ids.sort()).toEqual(GENERATORS.map((g) => g.id).sort());
  });
});
