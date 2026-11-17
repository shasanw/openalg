// A plain in-memory localStorage for tests, so they don't depend on the
// runner's (recent Node versions shadow jsdom's with an unusable one).
// Undo with vi.unstubAllGlobals().

import { vi } from "vitest";

export function stubMemoryStorage(): void {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  });
}

/** A localStorage that throws on every access, as in a locked-down browser. */
export function stubBrokenStorage(): void {
  const fail = () => {
    throw new Error("storage blocked");
  };
  vi.stubGlobal("localStorage", { getItem: fail, setItem: fail, removeItem: fail, clear: fail });
}
