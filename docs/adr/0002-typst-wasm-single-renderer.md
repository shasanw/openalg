# One renderer: Typst in the browser for both Preview and print

The Preview (the app's center view) and the printed/PDF output are both compiled by Typst running as WebAssembly in the browser, so what the teacher sees on screen is exactly what prints. We rejected a fast HTML/KaTeX preview with Typst only for export (the two would drift apart, which issue #7 already ruled out), and compiling on a server (a network round-trip per edit, no offline use, ongoing cost).

## Consequences

- Typst is on the critical path, so speed is engineered rather than hoped for: the compiler runs in a Web Worker, starts downloading as soon as the app opens, is cached by a service worker (for speed, not offline use), ships only the fonts we use, and stays warm between compiles so unchanged layout is reused; stale compiles are dropped so the latest edit wins.
- Budgets: recompile after an edit under ~150 ms, first Preview on a return visit under ~1 s, and cold first Preview under ~8 s at 10 Mbps (~3.5 s at 25 Mbps) with a visible loading state and the download starting when the app opens. The cold budget was originally ~3 s; the #22 spike (`spikes/typst-wasm/RESULTS.md`) showed the cold load is bound by the ~9 MB compressed download of the compiler and fonts, not by compile time, so we relaxed that budget rather than give up a single renderer. Edits measured ~20-35 ms and return visits ~0.2 s.
- Memory on iPad Safari is the remaining open risk (the page grows ~400-450 MB in desktop browsers); it needs a measurement on a real iPad.
- A rough KaTeX "draft" shown only while the compiler first downloads is the fallback if teachers find the first visit too slow.
