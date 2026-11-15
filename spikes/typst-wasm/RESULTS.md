# Spike #22: Typst-WASM preview speed vs. ADR 0002 budgets

> Only these results and the worker reference code (`src/worker.ts`, `src/protocol.ts`, `src/mitexHost.ts`, `src/doc.ts`, `fetch-assets.mjs`) are kept on `main` as a reference for #24. The full runnable harness (page, Playwright measurement, raw results) is commit `8fca30c` on branch `t3/typst-wasm-spike`.

Throwaway spike. It compiles a real `buildTypstDocument` output (30 quadratic-formula Problems with irrational roots, Answer Key `full`, 3 US-letter pages, 60 LaTeX snippets) with typst.ts in a Web Worker, renders SVG and PDF, and times every stage.

## Verdict

**The cold first Preview is a no-go as the budget is written. Everything else is a clear go.**

| Budget (ADR 0002) | Target | Measured | Result |
|---|---|---|---|
| Cold first Preview, school wifi (10 Mbps / 40 ms RTT) | < ~3 s | **7.55 to 7.71 s** (Chromium, 6 runs) | **Over by ~2.5x** |
| Cold first Preview, 25 Mbps / 20 ms RTT (for reference) | < ~3 s | 3.17 to 3.20 s | Just over |
| Recompile after an edit, warm (title / spacing) | < ~150 ms | Chromium median 17 to 21 ms (p95 ≤ 27); WebKit median 32 to 37 ms (p95 ≤ 53) | Within, 4x to 8x headroom |
| First Preview on a return visit (cached) | < ~1 s | Chromium 162 to 225 ms; WebKit 212 to 263 ms | Within, ~4x headroom |
| Peak memory, iPad Safari | "acceptable" | Not measured (needs a human). Desktop WebKit content process peaks at 470 to 555 MB against a 98 MB blank-page baseline | Unknown; this is the main open risk |

The cold miss is a download-size problem, not a CPU problem. Over the network the floor is about 9.0 MB of brotli, which takes **7.2 s at 10 Mbps** before a single byte gets compiled. CPU work on a cold load is small: WASM instantiate is ~100 ms in Chromium (streaming), the first compile 80 to 140 ms, and SVG render ~10 ms. Making the code faster will not fix the cold budget. Only shipping fewer bytes, or changing the budget, will.

Per issue #22 a no-go reopens ADR 0002 rather than starting #24. My recommendation for that reopening: **keep the one-renderer decision and amend only the cold budget.** For example: "cold first Preview under ~8 s at 10 Mbps and under ~3.5 s at 25 Mbps, with a visible loading state, the download starting at app boot". Optionally also commit to the byte-reduction work listed under "Cold-load levers" below. The warm and return-visit numbers are what a teacher feels on every edit, and they have large headroom. Swapping the architecture for a cold-load win would bring back the preview/print drift the ADR exists to prevent.

## What was used

| Thing | Version | Notes |
|---|---|---|
| `@myriaddreamin/typst.ts` | 0.7.0 (2026-06-01) | Latest stable. 0.8.0-rc4 was too new (5 days old) and is an RC |
| `@myriaddreamin/typst-ts-web-compiler` | 0.7.0 | Bundles **Typst 0.14.2** (the desktop app uses typst 0.13) |
| `@myriaddreamin/typst-ts-renderer` | 0.7.0 | Vector artifact to SVG |
| `@preview/mitex` Typst package | 0.2.7 (2026-04) | Vendored tarball, served same-origin |
| Fonts | typst-assets v0.14.2 | NewCM10 Regular/Bold/Italic + NewCMMath Regular only |
| Vite | 7.3.7 | Build only |
| Playwright | 1.64.1 | HeadlessChrome 156.0.8078.4, WebKit 27.2 (pw v2370) |
| Machine | macOS (Apple Silicon laptop) | One machine, so treat the numbers as indicative |

## Download size

Served by `serve.mjs` as a CDN would serve them: precompressed brotli q11 (gzip -9 for comparison), immutable cache headers.

| Asset | Raw | gzip -9 | brotli 11 (as served) |
|---|---:|---:|---:|
| Compiler WASM (`typst_ts_web_compiler_bg.wasm`) | 28.33 MB | 10.73 MB | **7.22 MB** |
| Renderer WASM (SVG output) | 0.97 MB | 0.36 MB | 0.27 MB |
| NewCM10-Regular.otf | 0.59 MB | 0.35 MB | 0.27 MB |
| NewCM10-Bold.otf | 0.52 MB | 0.31 MB | 0.24 MB |
| NewCM10-Italic.otf | 0.61 MB | 0.36 MB | 0.29 MB |
| NewCMMath-Regular.otf | 1.15 MB | 0.77 MB | 0.61 MB |
| mitex package tarball (or `mitex.wasm` alone) | 0.11 MB (0.28 MB) | 0.11 MB (0.09 MB) | 0.11 MB (0.07 MB) |
| JS (page + worker + wasm-bindgen glue) | 0.13 MB | 0.04 MB | ~0.03 MB |
| **Total** | **~32.4 MB** | **~13.0 MB** | **~9.0 MB** |

Fonts are 1.4 MB of that and the compiler is 7.2 MB. The compiler WASM is already stripped (no name or debug sections): 19.1 MB of code plus a 9.2 MB data section. The data section holds the hyphenation patterns, syntax definitions, ICU/segmenter data and so on. Serving gzip instead of brotli adds ~3.5 MB, which is ~3 s at 10 Mbps, so brotli is mandatory.

## Timings

`first` = navigation start until the SVG is in the DOM. Edit times are wall-clock in the page: postMessage, compile, SVG string, `innerHTML`, layout, next frame. They are medians over 10 edits of each kind, each with a real change. Raw data: [`results/full-run.json`](results/full-run.json) and `results/school-cold-repeat-*.json`.

### Chromium (headless, CDP network throttling)

| Scenario | First Preview | Worker init (WASM + fonts + build) | First compile | Title edit median / p95 | Spacing edit median / p95 | Unchanged recompile | PDF (warm) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Cold, 10 Mbps / 40 ms, mitex package | 7.64 s, 7.64 s, 7.71 s | 7.30 s | 124 to 196 ms | 18 / 24 | 18 / 27 | 16 ms | 3 to 7 ms |
| Cold, 10 Mbps / 40 ms, mitex in JS | 7.57 s, 7.55 s, 7.58 s | 7.27 s | 80 to 87 ms | 19 / 33 | 18 / 26 | 16 ms | 5 ms |
| Cold, 25 Mbps / 20 ms | 3.20 s (pkg), 3.17 s (js) | 2.93 s | 99 to 125 ms | 18 / 22 | 18 / 22 | 17 ms | 5 to 8 ms |
| Cold, localhost (CPU-bound) | 287 ms (pkg), 245 ms (js) | 100 ms | 78 to 126 ms | 18 / 23 | 18 / 22 | 17 ms | 6 ms |
| Return visit (HTTP cache), any network | 162 to 225 ms | 103 to 116 ms | 12 to 36 ms | 17 to 21 / 20 to 27 | 17 to 21 / 20 to 23 | 16 to 20 ms | 3 to 8 ms |

Inside the worker a warm title edit costs **~3 ms to compile and ~2 ms to render the SVG**. The rest of the 17 to 21 ms is the main thread replacing a 380 KB SVG in the DOM. The unchanged-recompile column, which costs the same, shows this.

The cold 10 Mbps time splits as follows. The fonts finish at 1.8 s, sharing the pipe with the compiler. The compiler WASM finishes at 7.3 s (6.8 s on the wire), compile plus render takes ~0.1 s, and paint ~0.2 s. At 10 Mbps the 9 MB ideal is 7.2 s, and the measured time is within 6% of that.

Discarded outliers: the first two throttled cold runs (12.3 s and 50.7 s; the 50.7 s one is still in `full-run.json`). They happened because my server was brotli-compressing the 28 MB WASM on the first request after a rebuild, which takes ~35 s. `serve.mjs` now precompresses at startup. The three repeat runs above came after that fix.

### WebKit (headless Playwright WebKit; no network throttling is available)

| Scenario | First Preview | Worker init | First compile | Title edit median / p95 | Spacing edit median / p95 | Unchanged | PDF |
|---|---:|---:|---:|---:|---:|---:|---:|
| Cold, localhost, mitex package | 1055 ms | 668 ms | 115 ms | 34 / 39 | 35 / 43 | 38 ms | 8 ms |
| Cold, localhost, mitex in JS | 372 ms | 114 ms | 50 ms | 35 / 42 | 33 / 42 | 33 ms | 8 ms |
| Return visit | 212 to 263 ms | 95 to 111 ms | 56 to 123 ms | 32 to 37 / 40 to 42 | 32 to 33 / 41 to 53 | 30 ms | 6 to 7 ms |

WebKit compiles the WASM noticeably slower on a truly cold engine: the 668 ms init above, against ~100 ms in Chromium. Its edit loop is ~2x Chromium's, almost all of it in the DOM swap (worker compile ~5 ms, render ~2 ms). For Safari's cold time over a real network, add the same ~7.2 s of download at 10 Mbps.

### SVG vs. PDF

- **SVG** (vector artifact, then renderer `renderSvg`): one 380 KB SVG for the 3 pages. Render takes ~8 to 14 ms cold and ~2 ms warm in the worker.
- **PDF** (`compile({format: pdf})`): 67.9 KB and **3 to 8 ms warm**, because layout is shared with the preview through comemo. A PDF export from a warm compiler is effectively free; no cold PDF-only path was timed.

## Memory

| | Chromium | WebKit |
|---|---:|---:|
| Blank page, content process RSS | 83 MB | 98 MB |
| After page load, before the WASM is ready | 110 MB | 123 MB |
| After the WASM is compiled, before the first compile | 356 MB | 379 MB |
| After the first Preview | 463 MB | 405 MB |
| Peak during a 20-edit run (content process) | 545 to 712 MB | 471 to 555 MB |
| WASM linear memory after 20 edits | 30 to 32 MB | 30 to 32 MB |
| WASM linear memory after 300 unique edits | 74 MB | 73 MB |
| Main-thread JS heap (Chromium, precise) | 5 to 13 MB | n/a |

What this shows:
- The single biggest cost is **~250 MB to compile 19 MB of WASM code** (engine tiers plus machine code). It is paid once per worker and does not depend on the document.
- The Typst heap (WASM linear memory) is small but **only grows**: from 32 MB to 74 MB over 300 unique edits, so comemo keeps entries for old revisions. A long editing session will creep upward until the worker is recycled.
- RSS on macOS is a rough measure (it counts some shared and compressed pages), and these are desktop engines. **The iPad number is the open risk.** ~400 to 450 MB above baseline is probably fine on recent iPads and could get the tab reloaded on older, low-RAM ones. A human has to measure this (see below).

## LaTeX math (mitex)

Both approaches work and render identically (see [`screenshot.png`](screenshot.png), 3 pages, fractions and radicals typeset correctly).

1. **mitex Typst package** (`?math=package`, the default). The worker prepends `#import "@preview/mitex:0.2.7": mi` and replaces each `@@M<i>@@` with `#mi("<escaped latex>")`. The package tarball is served from our own origin and fetched during init. A custom `PackageRegistry` untars it into a `MemoryAccessModel` the first time the compiler asks; `resolve` is synchronous by contract, which is why the bytes have to be prefetched. It costs ~40 to 60 ms more on the *first* compile, because Typst instantiates the 280 KB plugin in its WASM interpreter. After that it costs nothing measurable, since plugin calls are memoized.
2. **mitex in JS** (`?math=js`). [`src/mitexHost.ts`](src/mitexHost.ts) loads the same `mitex.wasm` plugin straight into the worker and implements Typst's two-function wasm-minimal-protocol host (~50 lines). That gives a browser twin of `mitex::convert_math` from `pdf.rs`: 60 snippets in ~4 ms cold, cached per snippet afterwards. The catch is that mitex output is **not plain Typst**. `\sqrt{17}` becomes `mitexsqrt(1 7 )`, which only resolves inside `mitex-scope`, so this mode needs a hand-written prelude (`#let mitexsqrt(..)`). That prelude has to grow with every new LaTeX command a Topic uses.

**Recommendation: the package approach.** It keeps mitex's full scope with no list for us to maintain. The first-compile cost is irrelevant next to the cold download, and edit costs are the same.

Side finding, unverified: `src-tauri/src/pdf.rs` wraps `mitex::convert_math` output in bare `$...$` without `mitex-scope`. The same `mitexsqrt` problem should therefore break desktop PDF/SVG for any Problem with a radical (irrational or imaginary roots). The Rust unit tests only use `x^2 - 5x + 6 = 0`. Worth a quick check, even though the web build replaces that path.

## Risks

1. **Cold download (confirmed).** 9 MB brotli, 7.2 s physics floor at 10 Mbps. Every first visit on slow school wifi waits ~7 to 8 s, and longer on a congested network.
2. **iPad memory (unmeasured).** Desktop engines show ~400 to 450 MB above baseline, and the Typst heap grows over a session. A Safari tab reload mid-edit would be bad.
3. **typst.ts maturity.** It is a single-maintainer project and the 0.8 line was still in RC 5 months after 0.7.0. The 0.7.0 glue logs a "deprecated parameters for the initialization function" warning (harmless). A typst.ts release decides the Typst version (0.14.2 here), so a Typst upgrade waits on typst.ts.
4. **Font default.** The app's Typst source sets no text font, so Typst falls back to Libertinus Serif. The spike prepends `#set text(font: "New Computer Modern")` and ships only NCM. #24 must make that choice explicitly in `buildTypstDocument`, or ship Libertinus (~1.4 MB raw more).
5. **Untested:** throttled WebKit, real Safari (as opposed to Playwright's WebKit build), service-worker caching (HTTP cache was used as the stand-in; it should behave the same or better), CPU-throttled or low-end devices, Firefox.

## Notes for implementing #24

**Worker API shape** (what the spike's [`protocol.ts`](src/protocol.ts) sketches):

```ts
// page -> worker
type ToTypst =
  | { type: "init" }                                   // sent at app boot, before any Worksheet exists
  | { type: "preview"; rev: number; doc: TypstDocument } // SVG
  | { type: "export"; rev: number; doc: TypstDocument }  // PDF bytes (transferable)
// worker -> page
type FromTypst =
  | { type: "ready" } | { type: "progress"; loaded: number; total: number }
  | { type: "preview"; rev: number; svg: string; diagnostics: Diag[] }
  | { type: "export"; rev: number; pdf: Uint8Array }
  | { type: "error"; rev?: number; message: string }
```

- **Latest edit wins:** the worker keeps a single "next job" slot. A new `preview` overwrites any job still queued, and the page ignores replies whose `rev` is lower than the newest it has sent. A warm compile is ~3 ms, so the slot mostly guards against cold-start and burst typing.
- **Keep it warm:** use one long-lived `TypstCompiler`. Call `addSource("/main.typ", ...)` on each edit and never call `reset()`. comemo state survives across `compile()` calls (first compile ~125 ms, then ~3 ms). Build the font resolver once in `init`.
- **Bound memory:** watch the compiler's `WebAssembly.Memory.buffer.byteLength` (the spike captures it by wrapping `WebAssembly.instantiate*`). Recycle the worker past a threshold (e.g. 150 MB) or after idle. A recycle is cheap once cached: ~100 ms init plus one cold compile. Alternatively, check whether typst.ts exposes comemo eviction.
- **Fix the DOM cost, not the compiler:** most of an edit's wall time is swapping 380 KB of SVG. Use the renderer's session and incremental SVG (`renderSvgDiff` / `renderToSvg` with a session), or emit per-page SVGs and replace only pages that changed. This should cut WebKit's ~35 ms considerably.
- **Fonts:** self-host the OTFs and pass them through `loadFonts(urls, { assets: false, fetcher })`. Without `assets: false`, typst.ts **silently downloads its default text font bundle from jsdelivr**. Start the font fetches in parallel with the WASM (the spike's `fetcher` returns bytes that are already downloading). Font subsetting could cut ~1 MB, mostly from the 1.15 MB math font. That is untested, and Typst's handling of subset fonts has to be verified.
- **mitex:** use the vendored `@preview/mitex:0.2.7` tarball, a same-origin URL and the custom `PackageRegistry` from [`src/worker.ts`](src/worker.ts). Do not use `FetchPackageRegistry`, which does a synchronous XHR to packages.typst.org mid-compile.
- **WASM loading:** pass `getModule: () => fetch(url)` so wasm-bindgen uses `instantiateStreaming`. Serve `application/wasm` with brotli and an immutable cache. Cache through a service worker as the ADR says.
- **Cold-load levers** (none tried here; listed by expected payoff):
  1. Start the download at app boot (worker `init` from the shell, or `<link rel="preload">`) and show progress. This hides latency but does not remove it.
  2. A custom typst.ts compiler build without unused features (HTML export, syntax highlighting, CJK segmentation, and so on), plus `wasm-opt -Oz`. The data section alone is 9.2 MB raw, so this could plausibly save 1 to 3 MB brotli. Unproven, and it costs a Rust/WASM build in CI.
  3. Font subsetting (~1 MB).
  4. Drop the renderer WASM (0.27 MB) only if the compiler can emit SVG directly; in 0.7.0 it cannot.

  Even 1 to 3 together are unlikely to get under ~3.4 MB, which is what a 3 s cold load at 10 Mbps requires. That is why the budget itself needs amending.

## Running it (including on an iPad)

```sh
cd spikes/typst-wasm
pnpm install                  # standalone workspace, does not touch the app
pnpm build                    # downloads fonts + mitex into public/vendor, then vite build
pnpm serve                    # brotli + caching server on :4173, prints a LAN URL
pnpm measure                  # optional: the Playwright run (Chromium + WebKit) behind these numbers
```

`pnpm dev` works too (Vite, `--host`), but it serves unbundled and uncompressed files, so do not use it for timings.

**iPad:** put the Mac and iPad on the same Wi-Fi, run `pnpm build && pnpm serve`, and open the printed `http://<mac-lan-ip>:4173/` in Safari (allow Node through the macOS firewall if asked). The page runs on its own and shows a timing table with budget pass/fail, followed by the JSON details.
- *Cold:* Settings > Apps > Safari > Clear History and Website Data, then open the page, ideally on a real school network. `?cold=1` bypasses the HTTP cache for the downloads but not Safari's compiled-WASM cache.
- *Return visit:* tap "Reload (return visit)".
- *Warm edits:* shown in the table, 10 title and 10 spacing edits. Add `&n=150` for a 300-edit stress run that watches memory growth.
- *Memory:* the page shows the WASM linear memory only. For the real figure, enable Settings > Apps > Safari > Advanced > Web Inspector, connect the iPad by cable, then in Mac Safari open Develop > [iPad] > the page > Timelines and record "Memory" across a run. Note the peak, and whether the tab ever reloads by itself.
- `?math=js` switches to the JS mitex path.

## Files

- [`src/worker.ts`](src/worker.ts): the compiler worker (init, fonts, mitex registry, compile, SVG/PDF, memory capture)
- [`src/main.ts`](src/main.ts): the page that runs the scenarios and shows the timings
- [`src/doc.ts`](src/doc.ts): the real engine (`buildWorksheet` and `buildTypstDocument`) plus the edits
- [`src/mitexHost.ts`](src/mitexHost.ts): mitex plugin host for the JS math path
- [`serve.mjs`](serve.mjs): static server with brotli/gzip and caching; [`measure.mjs`](measure.mjs): Playwright harness
- [`results/`](results/): raw JSON from the runs above
