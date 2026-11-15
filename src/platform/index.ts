// Resolves the active platform adapter. The app is web-first and client-only
// (ADR 0001), so the browser adapter is the one in use. `tauri.ts` stays until
// the desktop shell is removed (#25) but is no longer imported.

import type { Platform } from "./types";
import { webPlatform } from "./web";

export const platform: Platform = webPlatform;
export type { Platform };
