// @vitest-environment node
// Shard 5 of "every Topic compiles" (see topicSmoke.testkit.ts).
import { everyTopicCompiles } from "./topicSmoke.testkit";

everyTopicCompiles(4);
