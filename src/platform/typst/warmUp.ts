// A tiny document the Typst worker compiles as soon as it has loaded and is
// idle, so the first real Preview finds the fonts parsed and the mitex package
// unpacked (measured: ~230 ms to the first Preview cold vs ~65 ms warm). It
// touches every face the Worksheets use: regular, bold and italic text, and
// LaTeX math through mitex in the math font.

import { TEXT_FONT, type TypstDocument } from "../../engine/typst";

export const WARM_UP_DOCUMENT: TypstDocument = {
  source: `#set page(width: 4in, height: auto, margin: 0.25in)
#set text(font: "${TEXT_FONT}", size: 12pt)
#text(weight: "bold")[Warm] #emph[up] 1) @@M0@@`,
  math: ["x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}, \\; 3i"],
};
