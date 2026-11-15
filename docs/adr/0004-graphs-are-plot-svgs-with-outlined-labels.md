# Graphs are one plot() SVG, embedded in Typst, with labels as glyph outlines

Every graph (coordinate planes, number lines, the blank grid a student draws on) is drawn by one pure function, `plot(spec) -> SVG string` in `src/engine/plot.ts`, from a `GraphSpec` saved with its Problem. Typst embeds that SVG as an image, so the Preview, Print and PDF all show the same SVG (ADR 0002). The Add Section picker shows it as an `<img>`. We rejected drawing graphs in Typst's own drawing functions, because that would leave the picker and tests without a pure, snapshot-testable graph, and drawing them twice (screen and print) because the two would drift.

Labels (tick numbers, axis names, number-line values) are New Computer Modern glyph outlines (`<use>` of paths in `<defs>`), not SVG `<text>`. On screen a graph is always an image: Typst's SVG pages carry it as a nested `data:` image, and the picker uses `<img>`. An image cannot use the page's web fonts, so `<text>` would show a system serif on screen and New Computer Modern in the PDF. The outlines come from the bundled fonts, extracted by `scripts/plot-glyphs.py` into `src/engine/plotGlyphs.ts`.

## Consequences

- Labels can use only the characters in that table (digits, minus, plus, slash, radical, brackets and a few marks; italic a to z for axis names). `graphSpecProblem` rejects any other label, so a Worksheet File with one fails on load instead of printing a blank. To add characters, extend the script and run it again.
- Each SVG carries the glyphs it uses, so `plot` can also return a graph as two stacked layers (`plotLayers`): the frame (grid, axes, labels) and what is drawn on it. The Typst source defines each distinct SVG once, so a sheet of graphs carries its grid once and each Answer Key graph is the student's own grid with a small overlay. This keeps a 20-graph sheet's source near 25 kB.
