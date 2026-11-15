# One renderer: Typst in the browser for both Preview and print

The Preview (the app's center view) and the printed/PDF output are both compiled by Typst running as WebAssembly in the browser, so what the teacher sees on screen is exactly what prints. We rejected a fast HTML/KaTeX preview with Typst only for export (the two would drift apart, which issue #7 already ruled out), and compiling on a server (a network round-trip per edit, no offline use, ongoing cost).

## Consequences

- Typst is on the critical path, so speed is engineered rather than hoped for: the compiler runs in a Web Worker, starts downloading as soon as the app opens, is cached by a service worker (for speed, not offline use), ships only the fonts we use, and stays warm between compiles so unchanged layout is reused; stale compiles are dropped so the latest edit wins.
- Budgets, checked by a spike before the migration commits: cold first Preview under ~3 s on school wifi, recompile after an edit under ~150 ms, first Preview on a return visit under ~1 s. Missing them reopens this decision.
