// URLs of the Typst runtime files, resolved by Vite so the build hashes them
// (`assets/<name>-<hash>.<ext>`) and serves them from our own origin. Hashed
// names make them immutable, which is what lets the service worker cache them
// by URL. Imported only by the worker.

import compilerWasm from "@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url";
import rendererWasm from "@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url";
import newCmRegular from "./assets/fonts/NewCM10-Regular.otf?url";
import newCmBold from "./assets/fonts/NewCM10-Bold.otf?url";
import newCmItalic from "./assets/fonts/NewCM10-Italic.otf?url";
import newCmMath from "./assets/fonts/NewCMMath-Regular.otf?url";
import mitexPackage from "./assets/mitex-0.2.7.tar.gz?url";

export const TYPST_ASSET_URLS = {
  compilerWasm,
  rendererWasm,
  fonts: [newCmRegular, newCmBold, newCmItalic, newCmMath],
  mitexPackage,
};

/** Uncompressed size of all of the above, measured at build time. */
export const TYPST_ASSET_BYTES: number = __TYPST_ASSET_BYTES__;
