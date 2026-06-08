// Builds the Typst source for a worksheet. Layout lives HERE in TypeScript (not
// in Rust) so it stays web-portable: desktop (Rust Typst) and a future web build
// (Typst-WASM) compile the very same source.
//
// Math is emitted as `@@M<i>@@` placeholders plus an array of LaTeX snippets. The
// platform's PDF compiler converts each snippet to Typst math (via mitex) and
// substitutes the placeholders. This keeps the single LaTeX representation while
// letting Typst own page layout.

import type { Worksheet } from "./worksheet";

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
  /** Vertical work space under each free-response problem. */
  spacing?: "tight" | "normal" | "roomy";
}

const SPACING_EM: Record<NonNullable<TypstOptions["spacing"]>, string> = {
  tight: "0.8em",
  normal: "1.6em",
  roomy: "3em",
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
  const spacing = SPACING_EM[opts.spacing ?? "normal"];

  const math: string[] = [];
  const placeholder = (latex: string): string => {
    const i = math.length;
    math.push(latex);
    return `@@M${i}@@`;
  };

  const problemItems = ws.problems
    .map((p) => `  [${placeholder(p.prompt)}],`)
    .join("\n");

  let source = `#set page(paper: "us-letter", margin: 1in, numbering: "1")
#set text(size: 11pt)
#set enum(numbering: "1.", spacing: ${spacing})

#align(center)[#text(size: 16pt, weight: "bold")[${escapeTypstText(ws.title)}]]

#emph[${escapeTypstText(ws.directions)}]

#enum(
${problemItems}
)
`;

  if (keyFormat === "full") {
    const answerItems = ws.problems
      .map((p) => `  [${placeholder(p.answer)}],`)
      .join("\n");
    source += `
#pagebreak()
#align(center)[#text(size: 14pt, weight: "bold")[Answer Key]]

#enum(
${answerItems}
)
`;
  }

  return { source, math };
}
