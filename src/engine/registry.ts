// The generator registry. Topics in the UI are driven by this list; adding a
// topic later = registering one generator here (no UI changes needed).

import type { Generator } from "./types";
import { generator as quadraticFactoring } from "./generators/quadraticFactoring";

export const GENERATORS: readonly Generator[] = [quadraticFactoring];

const byId: Record<string, Generator> = Object.fromEntries(
  GENERATORS.map((g) => [g.id, g]),
);

export function getGenerator(id: string): Generator | undefined {
  return byId[id];
}
