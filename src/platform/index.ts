// Resolves the active platform adapter. The app is web-first and client-only
// (ADR 0001), so the browser adapter is the only implementation.

import type { Platform } from "./types";
import { webPlatform } from "./web";

export const platform: Platform = webPlatform;
export type { Platform };
