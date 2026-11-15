# Typst runtime files

Served from our own origin (Vite emits them as content-hashed files) and cached
by the service worker. Nothing is fetched from a CDN at runtime. They are
committed so `pnpm build` is self-contained; `node scripts/fetch-typst-assets.mjs`
re-downloads them and checks these SHA-256 hashes.

| File | Source | License | SHA-256 |
|---|---|---|---|
| `fonts/NewCM10-Regular.otf` | [typst-assets v0.14.2](https://github.com/typst/typst-assets/tree/v0.14.2/files/fonts) | GUST Font License | `79feac95755b8df2f0be45f55bdaf6c2b3b08f58b1f67518401cf235423e0b84` |
| `fonts/NewCM10-Bold.otf` | typst-assets v0.14.2 | GUST Font License | `d86a61b9956e038b51d172f0030660caf404e1adf5a3d93266ef1790c37c1a99` |
| `fonts/NewCM10-Italic.otf` | typst-assets v0.14.2 | GUST Font License | `ecc561ea03eb21f9623a7c99a6a17e371cf8eddc53039bc347380f40ce6c4d77` |
| `fonts/NewCMMath-Regular.otf` | typst-assets v0.14.2 | GUST Font License | `ad746f5307fed53d8e5d7d201f5054abe73f1f47c51040767d898e3481c6e648` |
| `mitex-0.2.7.tar.gz` | [`@preview/mitex` 0.2.7](https://packages.typst.org/preview/mitex-0.2.7.tar.gz) | Apache-2.0 (LICENSE inside the tarball) | `0159e214845e49cbdc332d9d572da112dae5ad248072e0a7680d38c8307c2e15` |

typst-assets v0.14.2 matches Typst 0.14.2, the version inside
`@myriaddreamin/typst-ts-web-compiler` 0.7.0. Only New Computer Modern ships:
`buildTypstDocument` sets it as the text font, and its math companion is
Typst's default math font. Adding a font means adding it here, to
`../assetFiles.ts` and to `../assets.ts`.
