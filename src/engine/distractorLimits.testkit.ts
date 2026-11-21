// Problems where every real mistake lands on the same few values, so only
// three distinct Distractors exist. Shared by the fixed-seed check
// (distractors.allGenerators.test.ts) and the opt-in soak scan
// (distractors.soak.ts). Each is named exactly, needs three, and says why;
// anything else still needs four.

import type { Problem } from "./types";

export const NATURAL_LIMITS: Record<string, { is: (p: Problem) => boolean; why: string }> = {
  "order-of-operations": {
    // (2^2)^2, 2 - 2 \div 2: every slip gives 0, 2, 3, 4, 6 or 8
    is: (p) => /\d/.test(p.prompt) && !/[013-9]/.test(p.prompt),
    why: "an expression made only of 2s",
  },
  "percent-of-change": {
    // the base is 100, so "decreased by p%" is p either way, and the decimal
    // slips that would remain are excluded from a whole-number sheet
    is: (p) => /^100 \\text\{ decreased by \}/.test(p.prompt),
    why: "100 decreased by a whole percent",
  },
  "adding-subtracting-rationals": {
    // 1 + 1 + 1 or 2 + 2 + 2 with no negatives: the slips coincide
    is: (p) => !/\\frac|\.|-/.test(p.prompt) && new Set(p.prompt.match(/\d+/g) ?? []).size === 1,
    why: "the same whole number repeated, with no negatives",
  },
};
