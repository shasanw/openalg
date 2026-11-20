// Shared pieces for the Percents and Percent of Change Topics: how percents
// and amounts print, which percents a sheet uses, and which wrong values make
// believable choices. Exact arithmetic throughout (Rat from equationKit).

import type { Rng } from "../rng";
import { decimalString, isInt, rat, type Rat } from "./equationKit";
import { decimalPlaces } from "./rationalKit";

/** "25\%", "12.5\%" (a percent that does not terminate never prints; callers avoid it). */
export function percentLatex(p: Rat): string {
  return `${decimalString(p) ?? `${p.n}/${p.d}`}\\%`;
}

/** An amount: a whole number or a terminating decimal. */
export function amountLatex(r: Rat): string {
  return decimalString(r) ?? `${r.n}/${r.d}`;
}

/** Which percents a sheet uses: whole-number percents up to 100, or also over 100 and part-percents. */
export type PercentRange = "whole" | "any";

/**
 * A percent for a Problem. Whole: mostly friendly multiples of 5, now and
 * then any whole percent. Any: also over 100% and decimal percents such as
 * 12.5% and 0.5%.
 */
export function drawPercent(rng: Rng, range: PercentRange, maxPercent = 100): Rat {
  if (range === "any" && rng.bool(0.4)) {
    const special = [12.5, 37.5, 0.5, 2.5, 7.5, 17.5, 110, 125, 150, 175, 200, 250]
      .map((p) => rat(p * 2, 2))
      .filter((p) => p.n / p.d <= maxPercent);
    return rng.pick(special);
  }
  const top = Math.min(maxPercent, 100);
  if (rng.bool(0.7)) return rat(5 * rng.int(1, Math.floor((top - 1) / 5)));
  return rat(rng.int(1, top - 1));
}

/** Prints as a whole number or a decimal with at most `places` places. */
export function terminates(r: Rat, places = 2): boolean {
  const pl = decimalPlaces(r);
  return pl !== null && pl <= places;
}

/** Is a wrong value believable next to the Answer (positive, and a decimal only when the Answer could be)? */
export function plausibleAmount(r: Rat | null, answer: Rat, decimals: boolean): r is Rat {
  if (!r || r.n <= 0) return false;
  if (!decimals && isInt(answer) && !isInt(r)) return false;
  return terminates(r, 3);
}
