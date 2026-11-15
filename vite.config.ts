/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { typstAssetBytes, typstServiceWorker } from "./vite/typstAssets";

const host = process.env.TAURI_DEV_HOST;

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

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
}));
