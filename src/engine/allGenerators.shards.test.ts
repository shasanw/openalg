// The sharded every-Topic checks each cover every registered Topic exactly once.
import { describe, expect, it } from "vitest";
import { ANSWER_SHARDS, answerTopicsOfShard } from "./answers.allGenerators.testkit";
import { DISTRACTOR_SHARDS, distractorTopicsOfShard } from "./distractors.allGenerators.testkit";
import { GENERATORS } from "./registry";
import type { Generator } from "./types";

const covered = (shards: number, of: (shard: number) => Generator[]) =>
  Array.from({ length: shards }, (_, i) => of(i).map((g) => g.id))
    .flat()
    .sort();

describe("every-Topic shards", () => {
  const all = GENERATORS.map((g) => g.id).sort();
  it("the Answer check covers every Topic exactly once", () => {
    expect(covered(ANSWER_SHARDS, answerTopicsOfShard)).toEqual(all);
  });
  it("the Distractor guard covers every Topic exactly once", () => {
    expect(covered(DISTRACTOR_SHARDS, distractorTopicsOfShard)).toEqual(all);
  });
});
