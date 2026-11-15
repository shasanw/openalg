// Builds the spike's input with the REAL engine: 30 quadratic-formula Problems
// (irrational roots, so every Answer has a fraction + radical + plus-minus),
// Answer Key "full". Edits are expressed as Worksheet changes, exactly as the
// app would make them, then re-run through buildTypstDocument.
import { buildWorksheet, type Worksheet } from "../../../src/engine/worksheet";
import { buildTypstDocument, type TypstDocument } from "../../../src/engine/typst";
import { QUADRATIC_FORMULA_ID } from "../../../src/engine/generators/quadraticFormula";

export function baseWorksheet(count = 30): Worksheet {
  return buildWorksheet({
    generatorId: QUADRATIC_FORMULA_ID,
    params: { rootType: "irrational", allowLeadingCoefficient: true, maxCoefficient: 9 },
    baseSeed: 20261114,
    count,
  });
}

export function toDoc(ws: Worksheet): TypstDocument {
  return buildTypstDocument(ws, { keyFormat: "full" });
}

const SPACINGS = ["normal", "roomy", "tight"] as const;

/** The i-th edit of a given kind, applied to the base worksheet. */
export function edited(ws: Worksheet, kind: "title" | "spacing", i: number): Worksheet {
  if (kind === "title") return { ...ws, title: `${ws.title} (period ${i + 1})` };
  return { ...ws, print: { ...ws.print, spacing: SPACINGS[(i + 1) % SPACINGS.length] } };
}
