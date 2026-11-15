// Builds the Typst source for a worksheet. Layout lives HERE in TypeScript (not
// in Rust) so it stays web-portable: the browser (Typst-WASM, ADR 0002) and the
// legacy desktop shell (Rust Typst) compile the very same source. The live preview compiles this same
// source to SVG, so the on-screen page is print-truth (issue #7).
//
// Math is emitted as `@@M<i>@@` placeholders plus an array of LaTeX snippets. The
// platform's PDF/SVG compiler converts each snippet to Typst math (via mitex) and
// substitutes the placeholders. This keeps the single LaTeX representation while
// letting Typst own page layout, columns, and pagination.

import { assemble, choiceLetter, choiceSeed } from "./mc";
import type { Problem } from "./types";
import {
  allProblems,
  isMultipleChoice,
  type PrintConfig,
  type Worksheet,
} from "./worksheet";

export interface TypstDocument {
  /** Typst source containing `@@M<i>@@` placeholders. */
  source: string;
  /** LaTeX snippets indexed by the placeholders. */
  math: string[];
}

export type KeyFormat = "full" | "none";

export interface TypstOptions {
  /** MVP supports full / none here; odds-only & in-context arrive in slice #5. */
  keyFormat?: KeyFormat;
}

// Vertical work space below each free-response problem (the grid's row gutter).
// Sized so the three settings are clearly distinct on paper: roomy leaves
// several lines for showing work, tight keeps a compact answer sheet.
const SPACING_EM: Record<PrintConfig["spacing"], string> = {
  tight: "1.2em",
  normal: "3.5em",
  roomy: "7em",
};

/** PrintConfig paper -> Typst paper name. */
const PAPER: Record<PrintConfig["paper"], string> = {
  "us-letter": "us-letter",
  a4: "a4",
  legal: "us-legal",
};

/** PrintConfig margin preset -> inches. */
const MARGIN_IN: Record<PrintConfig["margin"], string> = {
  narrow: "0.5in",
  normal: "1in",
  wide: "1.5in",
};

/** PrintConfig body font-size preset -> points. */
const FONT_PT: Record<PrintConfig["fontSize"], string> = {
  small: "10pt",
  normal: "12pt",
  large: "14pt",
};

/**
 * The Worksheet text font. Set explicitly so every compiler renders the same
 * face: the browser compiler bundles only New Computer Modern (and its math
 * companion, Typst's default math font), not Typst's default Libertinus Serif.
 */
export const TEXT_FONT = "New Computer Modern";

/** Escape characters Typst would otherwise interpret as markup. */
export function escapeTypstText(s: string): string {
  return s.replace(/[\\#$[\]*_`@<>]/g, (c) => "\\" + c);
}

export function buildTypstDocument(
  ws: Worksheet,
  opts: TypstOptions = {},
): TypstDocument {
  const keyFormat = opts.keyFormat ?? "full";
  const print = ws.print;
  const spacing = SPACING_EM[print.spacing];
  const paper = PAPER[print.paper];
  const margin = MARGIN_IN[print.margin];
  const fontSize = FONT_PT[print.fontSize];
  const flipped = print.orientation === "landscape";
  // Typst page numbering: a pattern string prints a footer number; `none` omits it.
  const numbering = print.pageNumbers ? `"1"` : "none";

  const math: string[] = [];
  const placeholder = (latex: string): string => {
    const i = math.length;
    math.push(latex);
    return `@@M${i}@@`;
  };

  // Problems and answers are laid out as a balanced, row-major 2-column GRID
  // (cell 1 top-left, cell 2 top-right, cell 3 next row…). Typst has no column
  // *balancer* — its `columns` greedily fills the left column first, which on a
  // short sheet collapses to a single list — so a grid is what gives an even
  // two-up layout that still paginates (it breaks between rows). This mirrors
  // the on-screen edit view exactly, so the preview is print-truth (#7).
  const cell = (n: number, latex: string): string =>
    `  grid.cell[#box(width: 1.6em)[${n}\\)] ${placeholder(latex)}],`;
  // Multiple choice (#5): same numbered cell, with a body built by the MC
  // layout functions below.
  const mc = isMultipleChoice(ws);
  const choices = ws.responseFormat.choices;
  const cellWith = (n: number, body: string): string =>
    `  grid.cell[#box(width: 1.6em)[${n}\\)] ${body}],`;

  // Problems are numbered continuously across Sections; each Section prints its
  // own Directions above its own grid.
  let number = 0;
  const sectionBlocks = ws.sections
    .map((section) => {
      const cells = section.problems
        .map((p) =>
          mc
            ? cellWith(++number, mcProblemBody(p, choices, placeholder))
            : cell(++number, p.prompt),
        )
        .join("\n");
      return `#emph[${escapeTypstText(section.directions)}]

#v(0.8em)

#grid(
  columns: (1fr, 1fr),
  column-gutter: 1.5em,
  row-gutter: ${spacing},
  align: top,
${cells}
)
`;
    })
    .join("\n#v(1.2em)\n\n");

  // Header: editable title (sized to its content so it never wraps early), with
  // an optional Name / Date / Period blank filling the rest of the line. When
  // the blanks are off, the title spans the full width on its own.
  const header = print.showNameDatePeriod
    ? `#grid(
  columns: (1fr, auto),
  column-gutter: 1.5em,
  align(horizon)[#text(size: 16pt, weight: "bold")[${escapeTypstText(ws.title)}]],
  align(horizon)[#text(size: 10pt)[
    Name #blank(1.9in) \\
    #v(0.4em)
    Date #blank(1.1in) #h(1em) Period #blank(0.7in)
  ]],
)`
    : `#text(size: 16pt, weight: "bold")[${escapeTypstText(ws.title)}]`;

  let source = `#set page(paper: "${paper}", flipped: ${flipped}, margin: ${margin}, numbering: ${numbering})
#set text(font: "${TEXT_FONT}", size: ${fontSize})

#let blank(w) = box(width: w, stroke: (bottom: 0.6pt + luma(110)), outset: (bottom: 3pt))[]

${header}

#v(0.5em)
#line(length: 100%, stroke: 0.8pt)
#v(0.6em)

${sectionBlocks}`;

  if (keyFormat === "full") {
    // One continuous Answer Key, numbered to match the Problems.
    const answerCells = allProblems(ws)
      .map((p, i) =>
        mc
          ? cellWith(i + 1, mcAnswerBody(p, choices, placeholder))
          : cell(i + 1, p.answer),
      )
      .join("\n");
    source += `
#pagebreak()
#align(center)[#text(size: 14pt, weight: "bold")[Answer Key]]

#v(0.8em)

#grid(
  columns: (1fr, 1fr),
  column-gutter: 1.5em,
  row-gutter: 1em,
  align: top,
${answerCells}
)
`;
  }

  return { source, math };
}

// --- Multiple-choice layout (issue #5) --------------------------------------
//
// Kept apart from buildTypstDocument so the free-response layout above stays
// untouched. Both functions run the MC assembler with the Problem's default
// choice seed, so the sheet and its Answer Key always agree on the letters.

type Placeholder = (latex: string) => string;

/**
 * A multiple-choice Problem's cell body: the prompt, then its choices stacked
 * one per line as "(A) ...", indented under the prompt. Stacking (rather than
 * laying choices side by side) keeps long radical answers from overflowing a
 * half-page column.
 */
export function mcProblemBody(
  problem: Problem,
  choices: number,
  placeholder: Placeholder,
): string {
  const prompt = placeholder(problem.prompt);
  const { choices: rendered } = assemble(problem, {
    choices,
    seed: choiceSeed(problem),
  });
  const lines = rendered
    .map(
      (latex, i) =>
        `#box(width: 1.8em)[(${choiceLetter(i)})] ${placeholder(latex)}`,
    )
    .join(" \\\n");
  return `${prompt}
#v(0.3em)
#pad(left: 1.6em)[#set par(leading: 0.75em)
${lines}]`;
}

/** A multiple-choice Answer Key cell body: the correct letter, then the Answer. */
export function mcAnswerBody(
  problem: Problem,
  choices: number,
  placeholder: Placeholder,
): string {
  const { correctIndex } = assemble(problem, {
    choices,
    seed: choiceSeed(problem),
  });
  return `#strong[(${choiceLetter(correctIndex)})] ${placeholder(problem.answer)}`;
}
