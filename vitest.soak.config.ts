// `pnpm test:soak`: the opt-in Distractor soak scan, kept out of the normal run.
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    globals: true,
    environment: "node",
    include: ["src/engine/**/*.soak.ts"],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
