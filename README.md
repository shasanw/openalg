# OpenAlg

A worksheet and test generator for math teachers, focused on Algebra 2 and Precalculus, that runs in the browser. Pick a topic, set its options, and get printable problems with matching answer keys. Problems are built backwards from their answers. Independent property tests check what the Answer Key prints.

No install, no account. Worksheets are saved automatically in your browser's Library, and you can download any worksheet as a portable `.oalg` file or back up the whole Library.

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

### Install

```bash
git clone https://github.com/shasanw/openalg.git
cd openalg
pnpm install
```

### Develop

```bash
pnpm dev               # http://localhost:1420
```

## Testing

```bash
pnpm test              # engine and UI tests (Vitest, watch mode); fast, for everyday use
pnpm test:typst        # every Topic compiled by the real Typst compiler (slower; run before a PR)
pnpm test:all          # both, once
pnpm test:soak         # opt-in: 100,000 random Problems per Topic, checking each has 4 real Distractors (~3 min)
pnpm build && pnpm check:typst   # browser check: Preview, Print, PDF and ADR 0002 timings (Playwright)
```

`pnpm check:typst` drives the production build in headless Chromium and WebKit (`pnpm exec playwright install chromium webkit` once). It opens the app cold (also throttled to 10 Mbps in Chromium), generates quadratic-formula Worksheets with radicals and imaginary roots, times warm recompiles and return visits, exports a PDF and prints. Results land in `check-results/`.

## Deploying

`pnpm build` writes a self-contained static site to `dist/`; nothing is fetched from another origin at runtime. The Typst compiler (WASM), fonts and mitex package are content-hashed files under `dist/assets/`, cached by a service worker (`dist/sw.js`) so they download once. For a fast first visit the host should:

- serve the `.br` (or `.gz`) files the build writes next to each large asset, or compress on the fly with brotli: the compiler is 28 MB raw, 7.2 MB brotli, 10.9 MB gzip;
- serve `.wasm` as `application/wasm`, and `/assets/*` with `Cache-Control: public, max-age=31536000, immutable`;
- serve `index.html` and `sw.js` with `Cache-Control: no-cache`.

`pnpm serve:dist` is a local server set up exactly like that.

### Vercel

The app is hosted on Vercel (project `openalg`, settings in `vercel.json`, which sets the headers above):

- **Previews**: every pull request and branch gets a preview deployment from the Vercel Git integration.
- **Staging**: every push to `main` builds a deployment at `openalg-git-main-shasan00s-projects.vercel.app`. Previews and staging sit behind Vercel's deployment protection.
- **Production** (`openalg.vercel.app`): only a release tag deploys it. Pushing a `v*` tag runs `.github/workflows/production.yml`, which builds the tagged commit and promotes it. The project's "auto-assign custom production domains" setting is off, so merges to `main` never go live by themselves.

```sh
git tag v0.1.0 && git push origin v0.1.0
```

The workflow needs the repository secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`. To run the browser check against a deployment, use `VERCEL_AUTOMATION_BYPASS_SECRET=... pnpm check:typst --url=https://...`.

Vercel compresses on the fly and doesn't use the build's `.br` files, so the compiler WASM arrives as about 10.3 MB brotli instead of 7.2 MB. The project is on the Hobby plan, which is non-commercial: move to Pro before selling any licence (ADR 0003).

## Supported browsers

Current Chrome, Edge, Safari and Firefox on laptops and Chromebooks, plus Safari on iPad. Phones are not supported.

## Checking a new Topic

Register an independent checker for its id in [the Answer checker map](src/engine/answerCheckers/index.testkit.ts). Read the printed prompt, Answer and any graph specs. Check the mathematical result, the requested form, and that each Distractor is wrong in value. Use test-only readers or evaluators for the reference calculation. Run `pnpm exec vitest run src/engine/answers` to exercise every Topic (the check is sharded across `answersN.allGenerators.test.ts`) over seeds, defaults and single-option variants. The existing Topic tests continue to cover option combinations and construction invariants.

## Contributing

Work is tracked in [Issues](https://github.com/shasanw/openalg/issues). Issues labeled `ready-for-agent` are scoped and ready to pick up.

## License

[AGPL-3.0](LICENSE)
