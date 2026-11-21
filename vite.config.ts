/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { typstAssetBytes, typstServiceWorker } from "./vite/typstAssets";

// Agent worktrees hold whole copies of the repo (with their own React).
const EXCLUDE = ["**/node_modules/**", "**/dist/**", ".claude/**"];

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), typstServiceWorker()],

  // Typst-WASM (ADR 0002): the compiler runs in a module Web Worker; its WASM
  // and fonts are emitted as hashed files served from our own origin.
  define: {
    __TYPST_ASSET_BYTES__: JSON.stringify(typstAssetBytes()),
  },
  worker: { format: "es" as const },
  optimizeDeps: {
    // The worker is only discovered at runtime; pre-bundle its entry up front
    // so the first `pnpm dev` visit doesn't reload mid-load.
    include: ["@myriaddreamin/typst.ts"],
    // Pre-bundling would separate the wasm-bindgen glue from its .wasm file.
    exclude: ["@myriaddreamin/typst-ts-web-compiler", "@myriaddreamin/typst-ts-renderer"],
  },
  build: {
    target: "es2022",
    // The compiler WASM is 28 MB; it is meant to be large, so don't warn.
    chunkSizeWarningLimit: 1024,
  },

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  server: {
    port: 1420,
  },

  test: {
    globals: true,
    // Property tests take 1 to 3 s alone, and the Typst smoke shards run
    // beside them: the default 5 s timed them out under load.
    testTimeout: 20_000,
    // Three projects, so each test file pays only for what it uses:
    // - engine: pure generators and layout, in plain Node (no fake browser);
    // - dom: components, the app and browser platform code, in jsdom;
    // - typst: every Topic compiled by the real compiler (slow; `pnpm test:typst`).
    // `pnpm test` runs engine and dom; `pnpm test:all` runs all three.
    projects: [
      {
        extends: true,
        test: {
          name: "engine",
          environment: "node",
          include: ["src/engine/**/*.test.ts"],
          exclude: EXCLUDE,
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [...EXCLUDE, "src/engine/**", "src/platform/typst/*.smoke.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "typst",
          environment: "node",
          include: ["src/platform/typst/*.smoke.test.ts"],
          exclude: EXCLUDE,
        },
      },
    ],
  },
}));
