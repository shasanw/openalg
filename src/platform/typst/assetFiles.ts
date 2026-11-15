// The runtime files the Typst compiler needs besides its WASM, all bundled in
// ./assets and served from our own origin. Kept free of Vite-only imports so
// Node (the smoke test, build scripts) can read the same list.

/** New Computer Modern: the Worksheet text font and its math companion. */
export const FONT_FILES = [
  "NewCM10-Regular.otf",
  "NewCM10-Bold.otf",
  "NewCM10-Italic.otf",
  "NewCMMath-Regular.otf",
] as const;

/** The `@preview/mitex` Typst package (LaTeX math). */
export const MITEX_PACKAGE_FILE = "mitex-0.2.7.tar.gz";
