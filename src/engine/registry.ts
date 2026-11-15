// The generator registry. Topics in the UI are driven by this list; adding a
// topic later = registering one generator here (no UI changes needed).

import type { Generator } from "./types";
import { generator as quadraticFactoring } from "./generators/quadraticFactoring";
import { generator as quadraticFormula } from "./generators/quadraticFormula";
import { generator as completingTheSquare } from "./generators/completingTheSquare";
import { generator as parabolaProperties } from "./generators/parabolaProperties";
import { generator as quadraticInequalities } from "./generators/quadraticInequalities";

export const GENERATORS: readonly Generator[] = [
  quadraticFactoring,
  quadraticFormula,
  completingTheSquare,
  parabolaProperties,
  quadraticInequalities,
];

const byId: Record<string, Generator> = Object.fromEntries(
  GENERATORS.map((g) => [g.id, g]),
);

export function getGenerator(id: string): Generator | undefined {
  return byId[id];
}

export interface Unit {
  name: string;
  generators: Generator[];
}

/**
 * Group generators by Unit. Units and the Topics within them preserve
 * registration order, so lists are stable and adding a generator never
 * reshuffles the existing ones.
 */
export function groupByUnit(generators: readonly Generator[] = GENERATORS): Unit[] {
  const units: Unit[] = [];
  const byName = new Map<string, Unit>();
  for (const g of generators) {
    let unit = byName.get(g.unit);
    if (!unit) {
      unit = { name: g.unit, generators: [] };
      byName.set(g.unit, unit);
      units.push(unit);
    }
    unit.generators.push(g);
  }
  return units;
}

/** The Courses that have at least one Topic, in registration order. */
export function coursesOf(generators: readonly Generator[] = GENERATORS): string[] {
  return [...new Set(generators.map((g) => g.course))];
}
