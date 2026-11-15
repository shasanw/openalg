# OpenAlg

A worksheet and test generator for math teachers, focused on Algebra 2 and Precalculus, that runs in the browser. Pick a topic, set its options, and get printable problems with matching answer keys. Every answer is known by construction (problems are built backwards from their answers), so keys are never wrong.

No install, no account. Worksheets are saved automatically in your browser's Library, and you can download any worksheet as a portable `.oalg` file or back up the whole Library.

> **Status:** mid-migration from a Tauri desktop app to a web-first app. See [ADR 0001](docs/adr/0001-web-first-client-only.md). Until the migration lands, the app still runs through the Tauri shell described under *Develop*.

## Features

- Topic-driven problem generation, organised by unit, with per-topic options
- Free-response or multiple-choice (with distractors based on common mistakes)
- Answer keys: full, odds-only, in-context, or none
- Multiple scrambled versions of a worksheet, each with its own key
- Precise graphs and graph paper
- A live, paginated preview that is exactly what prints, plus PDF download

## Tech Stack

- **TypeScript**: generation engine and worksheet model
- **React** + **Tailwind** + **[shadcn/ui](https://ui.shadcn.com/)**: UI
- **[KaTeX](https://katex.org/)**: on-screen math
- **[Typst](https://typst.app/)** (+ [`mitex`](https://github.com/mitex-rs/mitex)), compiled to WebAssembly in the browser: preview, print and PDF ([ADR 0002](docs/adr/0002-typst-wasm-single-renderer.md))
- **IndexedDB**: the worksheet Library

## Docs

- [GLOSSARY.md](GLOSSARY.md): the project's domain language (Worksheet, Section, Topic, Unit, Version…). Use these words in code, issues and UI.
- [docs/adr/](docs/adr/): architecture decisions and why they were made.
- [PRD (#1)](https://github.com/shasanw/openalg/issues/1): the original product requirements.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS) and [pnpm](https://pnpm.io/)
- *(Until the Tauri shell is removed)* [Rust](https://www.rust-lang.org/tools/install) (stable) and Tauri's [system dependencies](https://tauri.app/start/prerequisites/)

### Install

```bash
git clone https://github.com/shasanw/openalg.git
cd openalg
pnpm install
```

### Develop

```bash
pnpm tauri dev         # current: desktop shell
pnpm dev               # the web app (http://localhost:1420)
```

## Testing

```bash
pnpm test              # engine unit & property-based tests (Vitest), incl. a Typst-WASM smoke test
pnpm build && pnpm check:typst   # browser check: Preview, Print, PDF and ADR 0002 timings (Playwright)
```

`pnpm check:typst` drives the production build in headless Chromium and WebKit (`pnpm exec playwright install chromium webkit` once). It opens the app cold (also throttled to 10 Mbps in Chromium), generates quadratic-formula Worksheets with radicals and imaginary roots, times warm recompiles and return visits, exports a PDF and prints. Results land in `check-results/`.

## Deploying

`pnpm build` writes a self-contained static site to `dist/`; nothing is fetched from another origin at runtime. The Typst compiler (WASM), fonts and mitex package are content-hashed files under `dist/assets/`, cached by a service worker (`dist/sw.js`) so they download once. For a fast first visit the host should:

- serve the `.br` (or `.gz`) files the build writes next to each large asset, or compress on the fly with brotli: the compiler is 28 MB raw, 7.2 MB brotli, 10.9 MB gzip;
- serve `.wasm` as `application/wasm`, and `/assets/*` with `Cache-Control: public, max-age=31536000, immutable`;
- serve `index.html` and `sw.js` with `Cache-Control: no-cache`.

`pnpm serve:dist` is a local server set up exactly like that.

## Supported browsers

Current Chrome, Edge, Safari and Firefox on laptops and Chromebooks, plus Safari on iPad. Phones are not supported.

## Contributing

Work is tracked in [Issues](https://github.com/shasanw/openalg/issues). Issues labeled `ready-for-agent` are scoped and ready to pick up.

## License

[AGPL-3.0](LICENSE)
