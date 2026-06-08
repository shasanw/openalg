// Resolves the active platform adapter. Only Tauri exists today; a web build
// would select a `WebPlatform` here (File System Access API + Typst-WASM).

import type { Platform } from "./types";
import { tauriPlatform } from "./tauri";

export const platform: Platform = tauriPlatform;
export type { Platform };
