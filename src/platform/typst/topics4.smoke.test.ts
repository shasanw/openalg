// @vitest-environment node
// Shard 4 of "every Topic compiles" (see topicSmoke.testkit.ts).
import { everyTopicCompiles } from "./topicSmoke.testkit";

everyTopicCompiles(3);
