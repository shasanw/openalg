// @vitest-environment node
// Shard 3 of "every Topic compiles" (see topicSmoke.testkit.ts).
import { everyTopicCompiles } from "./topicSmoke.testkit";

everyTopicCompiles(2);
