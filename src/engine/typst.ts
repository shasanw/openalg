// Builds the Typst source for a worksheet. Layout lives HERE in TypeScript (not
// in Rust) so it stays web-portable: desktop (Rust Typst) and a future web build
// (Typst-WASM) compile the very same source. The live preview compiles this same
// source to SVG, so the on-screen page is print-truth (issue #7).
//
// Math is emitted as `@@M<i>@@` placeholders plus an array of LaTeX snippets. The
// platform's PDF/SVG compiler converts each snippet to Typst math (via mitex) and
// substitutes the placeholders. This keeps the single LaTeX representation while
// letting Typst own page layout, columns, and pagination.

import type { PrintConfig, Worksheet } from "./worksheet";

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

  const problemCells = ws.problems
    .map((p, i) => cell(i + 1, p.prompt))
    .join("\n");

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
#set text(size: 11pt)

#let blank(w) = box(width: w, stroke: (bottom: 0.6pt + luma(110)), outset: (bottom: 3pt))[]

${header}

#v(0.5em)
#line(length: 100%, stroke: 0.8pt)
#v(0.6em)

#emph[${escapeTypstText(ws.directions)}]

#v(0.8em)

#grid(
  columns: (1fr, 1fr),
  column-gutter: 1.5em,
  row-gutter: ${spacing},
  align: top,
${problemCells}
)
`;

  if (keyFormat === "full") {
    const answerCells = ws.problems
      .map((p, i) => cell(i + 1, p.answer))
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
