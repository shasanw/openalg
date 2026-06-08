# OpenAlg

An offline desktop worksheet and test generator for math teachers, focused on Algebra 2 and Precalculus. Pick a topic, set its parameters, and generate printable problems with matching answer keys. Worksheets are saved as local files — no database, no network, no accounts.

## Features

- Topic-driven problem generation with per-topic options
- Free-response or multiple-choice (with distractors based on common mistakes)
- Answer keys: full, odds-only, in-context, or none
- Multiple scrambled versions of a worksheet
- Precise graphs and graph paper
- PDF output with configurable page layout and a live preview

## Tech Stack

- **[Tauri](https://tauri.app/)** (Rust) — desktop shell, file I/O, PDF, printing
- **TypeScript** — generation engine and worksheet model
- **React** + **Tailwind** + **[shadcn/ui](https://ui.shadcn.com/)** — UI
- **[KaTeX](https://katex.org/)** — on-screen math
- **[Typst](https://typst.app/)** (+ [`mitex`](https://github.com/mitex-rs/mitex)) — PDF typesetting

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Tauri's [system dependencies](https://tauri.app/start/prerequisites/) for your OS

### Install

```bash
git clone https://github.com/shasan00/openalg.git
cd openalg
npm install
```

### Develop

```bash
npm run tauri dev      # run the app in development
```

### Build

```bash
npm run tauri build    # produce a release binary
```

## Testing

```bash
npm test               # engine unit & property-based tests (Vitest)
```

## Contributing

Work is tracked in [Issues](https://github.com/shasan00/openalg/issues). Issues labeled `ready-for-agent` are scoped and ready to pick up.

## License

TBD
