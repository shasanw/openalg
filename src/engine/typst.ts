// Builds the Typst source for a worksheet. Layout lives HERE in TypeScript and
// is compiled in the browser by Typst-WASM (ADR 0002). The live preview compiles
// this same source to SVG, so the on-screen page is print-truth (issue #7).
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
  type AnswerKeyFormat,
  type PrintConfig,
  type Worksheet,
} from "./worksheet";

export interface TypstDocument {
  /** Typst source containing `@@M<i>@@` placeholders. */
  source: string;
  /** LaTeX snippets indexed by the placeholders. */
  math: string[];
}

/** The Answer Key format; see AnswerKeyFormat in ./worksheet. */
export type KeyFormat = AnswerKeyFormat;

export interface TypstOptions {
  /**
   * Overrides the Worksheet's own `answerKeyFormat`. The Preview passes "none"
   * to hide the key; Print and PDF leave it unset so they print the teacher's
   * choice.
   */
  keyFormat?: KeyFormat;
}

/** Ink for Answers printed on the in-context key, so they stand out from the copy. */
const KEY_COLOR = `rgb("#c62828")`;

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
  const keyFormat = opts.keyFormat ?? ws.answerKeyFormat;
  const print = ws.print;
  const paper = PAPER[print.paper];
  const margin = MARGIN_IN[print.margin];
  const fontSize = FONT_PT[print.fontSize];
  const flipped = print.orientation === "landscape";
  // Typst page numbering: a pattern string prints a footer number; `none` omits it.
  const numbering = print.pageNumbers ? `"1"` : "none";

  const math: string[] = [];
  const placeholder: Placeholder = (latex) => {
    const i = math.length;
    math.push(latex);
    return `@@M${i}@@`;
  };

  const source = `#set page(paper: "${paper}", flipped: ${flipped}, margin: ${margin}, numbering: ${numbering})
#set text(font: "${TEXT_FONT}", size: ${fontSize})

#let blank(w) = box(width: w, stroke: (bottom: 0.6pt + luma(110)), outset: (bottom: 3pt))[]
#let keycolor = ${KEY_COLOR}

${worksheetMarkup(ws, placeholder, { answers: false })}${answerKeyMarkup(ws, keyFormat, placeholder)}`;

  return { source, math };
}

/** Typst markup for one numbered grid cell. */
const numberedCell = (n: number, body: string): string =>
  `  grid.cell[#box(width: 1.6em)[${n}\\)] ${body}],`;

/**
 * The Worksheet itself: header, then each Section's Directions above its own
 * grid of Problems. With `answers`, this is the in-context Answer Key: the same
 * copy with each Answer printed under its Problem and an "Answer Key" label in
 * place of the Name / Date / Period blanks.
 *
 * Problems and answers are laid out as a balanced, row-major 2-column GRID
 * (cell 1 top-left, cell 2 top-right, cell 3 next row...). Typst has no column
 * *balancer*: its `columns` greedily fills the left column first, which on a
 * short sheet collapses to a single list. A grid gives an even two-up layout
 * that still paginates (it breaks between rows).
 */
function worksheetMarkup(
  ws: Worksheet,
  placeholder: Placeholder,
  { answers }: { answers: boolean },
): string {
  const print = ws.print;
  const spacing = SPACING_EM[print.spacing];
  const mc = isMultipleChoice(ws);
  const choices = ws.responseFormat.choices;

  // Problems are numbered continuously across Sections; each Section prints its
  // own Directions above its own grid.
  let number = 0;
  const sectionBlocks = ws.sections
    .map((section) => {
      const cells = section.problems
        .map((p) => {
          const body = mc
            ? mcProblemBody(p, choices, placeholder, { showAnswer: answers })
            : answers
              ? frInContextBody(p, placeholder)
              : placeholder(p.prompt);
          return numberedCell(++number, body);
        })
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
  // the blanks are off, the title spans the full width on its own. The
  // in-context key always labels itself so it can't be handed out by mistake.
  const title = `#text(size: 16pt, weight: "bold")[${escapeTypstText(ws.title)}]`;
  const header = answers
    ? `#grid(
  columns: (1fr, auto),
  column-gutter: 1.5em,
  align(horizon)[${title}],
  align(horizon)[#text(size: 14pt, weight: "bold", fill: keycolor)[Answer Key]],
)`
    : print.showNameDatePeriod
      ? `#grid(
  columns: (1fr, auto),
  column-gutter: 1.5em,
  align(horizon)[${title}],
  align(horizon)[#text(size: 10pt)[
    Name #blank(1.9in) \\
    #v(0.4em)
    Date #blank(1.1in) #h(1em) Period #blank(0.7in)
  ]],
)`
      : title;

  return `${header}

#v(0.5em)
#line(length: 100%, stroke: 0.8pt)
#v(0.6em)

${sectionBlocks}`;
}

/**
 * The Answer Key pages for a Worksheet in the given format, or "" for none.
 * A pure function of (worksheet, format) so each Version (#11) can render its
 * own key from its own derived Worksheet.
 */
export function answerKeyMarkup(
  ws: Worksheet,
  format: AnswerKeyFormat,
  placeholder: Placeholder,
): string {
  if (format === "none") return "";
  if (format === "in-context") {
    // Restart page numbers so the key copy's pages match the student pages.
    return `
#pagebreak()
#counter(page).update(1)
${worksheetMarkup(ws, placeholder, { answers: true })}`;
  }

  // One continuous list numbered to match the Problems; odds keeps only the
  // odd numbers (numbering runs across Sections).
  const mc = isMultipleChoice(ws);
  const choices = ws.responseFormat.choices;
  const answerCells = allProblems(ws)
    .map((p, i) => ({ p, n: i + 1 }))
    .filter(({ n }) => format === "full" || n % 2 === 1)
    .map(({ p, n }) =>
      numberedCell(
        n,
        mc ? mcAnswerBody(p, choices, placeholder) : placeholder(p.answer),
      ),
    )
    .join("\n");
  const heading =
    format === "odds"
      ? `Answer Key #text(size: 11pt, weight: "regular")[(odd-numbered problems)]`
      : "Answer Key";
  return `
#pagebreak()
#align(center)[#text(size: 14pt, weight: "bold")[${heading}]]

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

/** A free-response Problem on the in-context key: prompt, then its Answer. */
function frInContextBody(problem: Problem, placeholder: Placeholder): string {
  const prompt = placeholder(problem.prompt);
  return `${prompt}
#v(0.3em)
#pad(left: 1.6em)[#text(fill: keycolor)[#strong[Answer:] ${placeholder(problem.answer)}]]`;
}

// --- Multiple-choice layout (issue #5) --------------------------------------
//
// Kept apart from buildTypstDocument so the free-response layout above stays
// untouched. Both functions run the MC assembler with the Problem's default
// choice seed, so the sheet and its Answer Key always agree on the letters.

/** Registers a LaTeX snippet and returns its `@@M<i>@@` placeholder. */
export type Placeholder = (latex: string) => string;

/**
 * A multiple-choice Problem's cell body: the prompt, then its choices stacked
 * one per line as "(A) ...", indented under the prompt. Stacking (rather than
 * laying choices side by side) keeps long radical answers from overflowing a
 * half-page column.
 *
 * With `showAnswer` (the in-context Answer Key) the correct letter is circled,
 * its choice is printed in the key colour, and an "Answer: (X)" line follows.
 */
export function mcProblemBody(
  problem: Problem,
  choices: number,
  placeholder: Placeholder,
  { showAnswer = false }: { showAnswer?: boolean } = {},
): string {
  const prompt = placeholder(problem.prompt);
  const { choices: rendered, correctIndex } = assemble(problem, {
    choices,
    seed: choiceSeed(problem),
  });
  const lines = rendered
    .map((latex, i) => {
      if (showAnswer && i === correctIndex) {
        // The bare letter ringed where "(X)" sits on the sheet. Outset (not
        // inset) for the height, so the ring never changes the line spacing.
        return `#box(width: 1.8em)[#h(0.2em)#box(stroke: 0.9pt + keycolor, radius: 50%, inset: (x: 2.5pt), outset: (y: 2.5pt))[#text(fill: keycolor)[#strong[${choiceLetter(i)}]]]] #text(fill: keycolor)[${placeholder(latex)}]`;
      }
      return `#box(width: 1.8em)[(${choiceLetter(i)})] ${placeholder(latex)}`;
    })
    .join(" \\\n");
  const answerLine = showAnswer
    ? `
#v(0.2em)
#text(fill: keycolor)[#strong[Answer: (${choiceLetter(correctIndex)})]]`
    : "";
  return `${prompt}
#v(0.3em)
#pad(left: 1.6em)[#set par(leading: 0.75em)
${lines}${answerLine}]`;
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
