// Builds the Typst source for a worksheet. Layout lives HERE in TypeScript and
// is compiled in the browser by Typst-WASM (ADR 0002). The live preview compiles
// this same source to SVG, so the on-screen page is print-truth (issue #7).
//
// Math is emitted as `@@M<i>@@` placeholders plus an array of LaTeX snippets. The
// platform's PDF/SVG compiler converts each snippet to Typst math (via mitex) and
// substitutes the placeholders. This keeps the single LaTeX representation while
// letting Typst own page layout, columns, and pagination.
//
// Graphs (#9) are plot(spec) SVG strings embedded as Typst images, in two
// stacked layers (plotLayers): the frame, then what is drawn on it. Each
// distinct SVG is defined once at the top of the source (`#let oag<i> =
// bytes("<svg…>")`) and referenced by name, so a sheet of identical blank grids
// carries one copy of the grid, and every answer graph on the key reuses it
// under its own small overlay. plot() emits single-quoted SVG
// with no backslashes or newlines, so it sits in a Typst string unchanged
// (typstStringLiteral escapes defensively all the same).

import { ANSWER_PART_SEPARATOR } from "./format";
import { choiceLetter } from "./mc";
import { plotLayers, PLOT_WIDTH_PT, type GraphSpec } from "./plot";
import type { Problem } from "./types";
import {
  deriveVersion,
  deriveVersions,
  versionChoices,
  type WorksheetVersion,
} from "./versions";
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
  /**
   * Which Version(s) to emit. A Version index (0 is Version A, the default)
   * gives that one Version's student pages followed by its own Answer Key: the
   * Preview shows one Version at a time. "all" gives every Version's student
   * pages, then every Version's Answer Key, in order: what Print and Export PDF
   * emit. With a single Version the two are identical.
   */
  version?: number | "all";
}

/** Ink for Answers printed on the in-context key, so they stand out from the copy. */
const KEY_HEX = "#c62828";
const KEY_COLOR = `rgb("${KEY_HEX}")`;

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
  const graphs = new Map<string, string>();
  const named = (svg: string): string => {
    let name = graphs.get(svg);
    if (name === undefined) {
      name = `oag${graphs.size}`;
      graphs.set(svg, name);
    }
    return name;
  };
  const graph: GraphMarkup = (spec, { answer }) => {
    const { frame, content } = plotLayers(spec, answer ? { ink: KEY_HEX } : {});
    return content ? `#oagraph(${named(frame)}, over: ${named(content)})` : `#oagraph(${named(frame)})`;
  };

  const versions =
    opts.version === "all" ? deriveVersions(ws) : [deriveVersion(ws, opts.version ?? 0)];
  // With several Versions, every Version and every key restarts its page
  // numbers, so each stack of pages reads "1, 2, ..." on its own.
  const multi = versions.some((v) => v.label !== null);
  const students = versions
    .map(
      (v, i) =>
        (i > 0 ? "\n#pagebreak()\n#counter(page).update(1)\n" : "") +
        worksheetMarkup(v.worksheet, placeholder, graph, {
          answers: false,
          label: v.label,
          choiceVariant: v.choiceVariant,
        }),
    )
    .join("");
  const keys = versions
    .map((v) =>
      answerKeyMarkup(v.worksheet, keyFormat, placeholder, graph, {
        label: v.label,
        choiceVariant: v.choiceVariant,
        restartPageNumbers: multi,
      }),
    )
    .join("");

  const graphDefs = [...graphs]
    .map(([svg, name]) => `#let ${name} = bytes(${typstStringLiteral(svg)})\n`)
    .join("");
  // A graph sits under its prompt, indented like the prompt's text, at its
  // drawn size, shrinking only if the column is narrower. What is drawn on it
  // (`over`, the same size) is placed exactly on top of its frame.
  const graphHelper = graphs.size
    ? `#let oagraph(frame, over: none) = pad(left: 1.6em, layout(size => {
  let w = calc.min(size.width, ${PLOT_WIDTH_PT}pt)
  block(width: w, {
    image(frame, format: "svg", width: w)
    if over != none { place(top + left, image(over, format: "svg", width: w)) }
  })
}))
${graphDefs}`
    : "";

  const source = `#set page(paper: "${paper}", flipped: ${flipped}, margin: ${margin}, numbering: ${numbering})
#set text(font: "${TEXT_FONT}", size: ${fontSize})

#let blank(w) = box(width: w, stroke: (bottom: 0.6pt + luma(110)), outset: (bottom: 3pt))[]
#let keycolor = ${KEY_COLOR}
${graphHelper}
${students}${keys}`;

  return { source, math };
}

/** A Typst string literal (quotes, backslashes and line breaks escaped). */
function typstStringLiteral(s: string): string {
  return `"${s.replace(/[\\"]/g, (c) => "\\" + c).replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
}

/**
 * Typst markup drawing a graph: the student's graph, or with `answer` the
 * Answer drawn in the key colour.
 */
export type GraphMarkup = (spec: GraphSpec, opts: { answer: boolean }) => string;

/** A graph on its own lines below what precedes it in a cell. */
const graphBlock = (markup: string): string => `
#v(0.4em)
${markup}`;

/** The prompt, with the Problem's graph (if any) under it, as the student sees it. */
function promptWithGraph(problem: Problem, placeholder: Placeholder, graph: GraphMarkup): string {
  const prompt = placeholder(problem.prompt);
  return problem.graph ? prompt + graphBlock(graph(problem.graph, { answer: false })) : prompt;
}

/**
 * The prompt on an in-context key: the student's graph is replaced by the
 * answer graph, drawn on the same window. A Problem whose answer graph has no
 * student graph to replace gets it after the Answer instead (`trailing`).
 */
function inContextPrompt(
  problem: Problem,
  placeholder: Placeholder,
  graph: GraphMarkup,
): { prompt: string; trailing: string } {
  const prompt = placeholder(problem.prompt);
  const answerGraph = problem.answerGraph;
  if (problem.graph) {
    const shown = answerGraph ?? problem.graph;
    return { prompt: prompt + graphBlock(graph(shown, { answer: !!answerGraph })), trailing: "" };
  }
  return { prompt, trailing: answerGraph ? graphBlock(graph(answerGraph, { answer: true })) : "" };
}

/** The answer graph under a key entry, or nothing. */
function keyGraph(problem: Problem, graph: GraphMarkup): string {
  return problem.answerGraph ? graphBlock(graph(problem.answerGraph, { answer: true })) : "";
}

/**
 * Typst markup for one numbered grid cell. The hanging indent keeps a body that
 * wraps (a long Answer) aligned under its own first line, not under the number.
 */
const numberedCell = (n: number, body: string): string =>
  // A cell with a graph never splits across pages, so a prompt stays with its grid.
  `  grid.cell${body.includes("#oagraph(") ? "(breakable: false)" : ""}[#set par(hanging-indent: 1.6em)
#box(width: 1.6em)[${n}\\)] ${body}
#parbreak()],`;

/**
 * An Answer or choice as math. A multi-part Answer (parts joined by
 * ANSWER_PART_SEPARATOR) becomes one equation per part with breakable "; "
 * text between them, so it wraps between parts instead of running as one
 * unbreakable equation past the edge of its column. A single-part Answer is
 * left as one breakable equation.
 */
export function answerMath(latex: string, placeholder: Placeholder): string {
  const parts = latex.split(ANSWER_PART_SEPARATOR);
  if (parts.length === 1) return placeholder(latex);
  return parts
    // Each part is kept whole (boxed), so lines break only between parts.
    .map((part) => `#box[${placeholder(part)}]`)
    // `#[;]`, not a bare ";": right after an embedded math call, Typst reads a
    // bare semicolon as the end of that expression and drops it.
    .join("#[;] ");
}

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
  graph: GraphMarkup,
  {
    answers,
    label = null,
    choiceVariant = 0,
  }: { answers: boolean } & VersionMarkupOptions,
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
            ? mcProblemBody(p, choices, placeholder, graph, { showAnswer: answers, choiceVariant })
            : answers
              ? frInContextBody(p, placeholder, graph)
              : promptWithGraph(p, placeholder, graph);
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
  // With several Versions, the Version's label sits under the title on both
  // the student copy and its in-context key.
  const titleText = `#text(size: 16pt, weight: "bold")[${escapeTypstText(ws.title)}]`;
  const title = label
    ? `${titleText} \\
#text(size: 12pt, weight: "bold")[${escapeTypstText(label)}]`
    : titleText;
  const header = answers
    ? `#grid(
  columns: (1fr, auto),
  column-gutter: 1.5em,
  align(horizon)[${title}],
  align(horizon)[#text(size: 14pt, weight: "bold", fill: keycolor)[${keyTitle(label)}]],
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
 * What distinguishes one Version's markup from another's, beyond its own
 * derived Worksheet: its printed label and its multiple-choice order.
 * Defaults (no label, variant 0) print the Worksheet itself.
 */
export interface VersionMarkupOptions {
  /** "Version B", printed in the header and on the key; null for none. */
  label?: WorksheetVersion["label"];
  /** Passed to choiceSeed; see WorksheetVersion.choiceVariant. */
  choiceVariant?: number;
}

/** The Answer Key's title, naming its Version when there is one. */
function keyTitle(label: string | null): string {
  return label ? `${escapeTypstText(label)} Answer Key` : "Answer Key";
}

/**
 * The Answer Key pages for a Worksheet in the given format, or "" for none.
 * A pure function of (worksheet, format, Version options) so each Version
 * (#11) renders its own key from its own derived Worksheet, labelled and with
 * the same choice letters as that Version's student pages.
 */
export function answerKeyMarkup(
  ws: Worksheet,
  format: AnswerKeyFormat,
  placeholder: Placeholder,
  graph: GraphMarkup,
  {
    label = null,
    choiceVariant = 0,
    restartPageNumbers = false,
  }: VersionMarkupOptions & {
    /** Number the key's pages from 1 (always so for the in-context key). */
    restartPageNumbers?: boolean;
  } = {},
): string {
  if (format === "none") return "";
  if (format === "in-context") {
    // Restart page numbers so the key copy's pages match the student pages.
    return `
#pagebreak()
#counter(page).update(1)
${worksheetMarkup(ws, placeholder, graph, { answers: true, label, choiceVariant })}`;
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
        (mc
          ? mcAnswerBody(p, choices, placeholder, choiceVariant)
          : answerMath(p.answer, placeholder)) + keyGraph(p, graph),
      ),
    )
    .join("\n");
  const heading =
    format === "odds"
      ? `${keyTitle(label)} #text(size: 11pt, weight: "regular")[(odd-numbered problems)]`
      : keyTitle(label);
  const restart = restartPageNumbers ? "#counter(page).update(1)\n" : "";
  return `
#pagebreak()
${restart}#align(center)[#text(size: 14pt, weight: "bold")[${heading}]]

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
function frInContextBody(problem: Problem, placeholder: Placeholder, graph: GraphMarkup): string {
  const { prompt, trailing } = inContextPrompt(problem, placeholder, graph);
  return `${prompt}
#v(0.3em)
#pad(left: 1.6em)[#text(fill: keycolor)[#strong[Answer:] ${answerMath(problem.answer, placeholder)}]]${trailing}`;
}

// --- Multiple-choice layout (issue #5) --------------------------------------
//
// Kept apart from buildTypstDocument so the free-response layout above stays
// untouched. Both functions read choices through versionChoices with the same
// Version's choice variant, so the sheet and its Answer Key always agree on the
// letters.

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
  graph: GraphMarkup,
  {
    showAnswer = false,
    choiceVariant = 0,
  }: { showAnswer?: boolean; choiceVariant?: number } = {},
): string {
  const { prompt, trailing } = showAnswer
    ? inContextPrompt(problem, placeholder, graph)
    : { prompt: promptWithGraph(problem, placeholder, graph), trailing: "" };
  const { choices: rendered, correctIndex } = versionChoices(problem, choices, choiceVariant);
  const lines = rendered
    .map((latex, i) => {
      if (showAnswer && i === correctIndex) {
        // The bare letter ringed where "(X)" sits on the sheet. Outset (not
        // inset) for the height, so the ring never changes the line spacing.
        return `#box(width: 1.8em)[#h(0.2em)#box(stroke: 0.9pt + keycolor, radius: 50%, inset: (x: 2.5pt), outset: (y: 2.5pt))[#text(fill: keycolor)[#strong[${choiceLetter(i)}]]]] #text(fill: keycolor)[${answerMath(latex, placeholder)}]`;
      }
      return `#box(width: 1.8em)[(${choiceLetter(i)})] ${answerMath(latex, placeholder)}`;
    })
    // One paragraph per choice, so a long choice wraps under its own text
    // (hanging indent) rather than under its letter.
    .join("\n\n");
  const answerLine = showAnswer
    ? `
#v(0.2em)
#text(fill: keycolor)[#strong[Answer: (${choiceLetter(correctIndex)})]]`
    : "";
  return `${prompt}
#v(0.3em)
#pad(left: 1.6em)[#set par(leading: 0.75em, spacing: 0.75em, hanging-indent: 1.8em)
${lines}${answerLine}]${trailing}`;
}

/** A multiple-choice Answer Key cell body: the correct letter, then the Answer. */
export function mcAnswerBody(
  problem: Problem,
  choices: number,
  placeholder: Placeholder,
  choiceVariant = 0,
): string {
  const { correctIndex } = versionChoices(problem, choices, choiceVariant);
  return `#strong[(${choiceLetter(correctIndex)})] ${answerMath(problem.answer, placeholder)}`;
}
