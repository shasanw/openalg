// The Typst compiler itself, independent of where it runs: the Web Worker
// (worker.ts) hosts one of these for the app, and the smoke test runs one in
// Node. One long-lived compiler is kept warm; each compile replaces the main
// file and never resets, so Typst's comemo caches reuse unchanged layout
// between edits (ADR 0002).
//
// LaTeX math goes through the mitex Typst package, served from our own origin
// and untarred into memory on first use, so mitex's helper functions (e.g.
// `mitexsqrt`) resolve inside its own scope.

import {
  createTypstCompiler,
  createTypstRenderer,
  initOptions,
  loadFonts,
  MemoryAccessModel,
  type TypstCompiler,
  type TypstRenderer,
} from "@myriaddreamin/typst.ts";
import type { TypstDocument } from "../../engine/typst";
import { splitSvgPages } from "./svgPages";

/** The mitex Typst package version the bundled tarball holds. */
export const MITEX_VERSION = "0.2.7";

export interface TypstEngineAssets {
  /** The compiler WASM: a Response (for streaming instantiation) or bytes. */
  compilerWasm: () => Promise<Response | BufferSource>;
  /** The renderer WASM (vector artifact to SVG). */
  rendererWasm: () => Promise<Response | BufferSource>;
  /** Every font the documents use; nothing else is loaded. */
  fonts: Promise<Uint8Array[]>;
  /** How many fonts `fonts` resolves to. */
  fontCount: number;
  /** The `@preview/mitex` package tarball (.tar.gz). */
  mitexPackage: Promise<Uint8Array>;
}

export interface TypstEngine {
  /** Compile to one self-contained SVG string per page. */
  svgPages(doc: TypstDocument): Promise<string[]>;
  /** Compile to PDF bytes. */
  pdf(doc: TypstDocument): Promise<Uint8Array>;
  /**
   * Compile only, rendering nothing: throws on an error and leaves the
   * warnings in `warnings`. For tests that only need "it compiles cleanly".
   */
  check(doc: TypstDocument): Promise<void>;
  /** Warnings from the most recent compile (e.g. a missing font). */
  readonly warnings: string[];
}

/** A Typst string literal. */
export function typstString(s: string): string {
  return `"${s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")}"`;
}

/**
 * The Typst main file for a document: the mitex import, then the source with
 * each `@@M<i>@@` placeholder replaced by a `#mi(...)` call on its LaTeX.
 */
export function fillMath(doc: TypstDocument): string {
  const body = doc.source.replace(/@@M(\d+)@@/g, (whole, i: string) => {
    const latex = doc.math[Number(i)];
    return latex === undefined ? whole : `#mi(${typstString(latex)})`;
  });
  return `#import "@preview/mitex:${MITEX_VERSION}": mi\n${body}`;
}

interface Diagnostic {
  severity?: string;
  message?: string;
  range?: string;
  path?: string;
}

const formatDiagnostic = (d: Diagnostic) =>
  [d.path && d.range ? `${d.path}:${d.range}` : d.path, d.message].filter(Boolean).join(" ");

function diagnosticsOf(raw: unknown, severity: "error" | "warning"): string[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Diagnostic[]).filter((d) => d.severity === severity).map(formatDiagnostic);
}

const MAIN = "/main.typ";

/**
 * The package tarball as gzip. A server that labels `.gz` files with
 * `Content-Encoding: gzip` makes the browser hand us the plain tar, which the
 * compiler's untar can't read, so re-gzip in that case.
 */
async function asGzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return bytes;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function createTypstEngine(assets: TypstEngineAssets): Promise<TypstEngine> {
  const access = new MemoryAccessModel();
  let mitexTar: Uint8Array | undefined;
  const packageDir = `/@memory/packages/preview/mitex/${MITEX_VERSION}`;

  const fontKeys = Array.from({ length: assets.fontCount }, (_, i) => `font:${i}`);

  const compiler: TypstCompiler = createTypstCompiler();
  const renderer: TypstRenderer = createTypstRenderer();

  const rendererReady = renderer.init({
    getModule: () => assets.rendererWasm(),
  });

  await compiler.init({
    getModule: () => assets.compilerWasm(),
    beforeBuild: [
      // Only our own fonts. `assets: false` stops typst.ts from downloading
      // its default font bundle from a CDN; it must be passed to `loadFonts`
      // directly, since typst.ts looks for it on the beforeBuild entries. The
      // "URLs" are just indexes into the fonts already downloading.
      loadFonts(fontKeys, {
        assets: false,
        fetcher: (async (key: string) => {
          const fonts = await assets.fonts;
          return new Response(fonts[fontKeys.indexOf(key)] as BlobPart);
        }) as typeof fetch,
      }),
      initOptions.withAccessModel(access),
      initOptions.withPackageRegistry({
        // Synchronous by contract (the compiler calls it mid-compile), so the
        // tarball is fetched during init and only untarred here, once.
        resolve(spec, ctx) {
          if (spec.namespace !== "preview" || spec.name !== "mitex" || spec.version !== MITEX_VERSION) {
            return undefined;
          }
          if (!access.getMTime(`${packageDir}/typst.toml`)) {
            if (!mitexTar) throw new Error("The mitex package was not loaded.");
            ctx.untar(mitexTar, (path, data, mtime) =>
              access.insertFile(`${packageDir}/${path}`, data, new Date(mtime)),
            );
          }
          return packageDir;
        },
      }),
      async () => {
        mitexTar = await asGzip(await assets.mitexPackage);
      },
    ],
  });
  await rendererReady;

  let warnings: string[] = [];

  async function compile(doc: TypstDocument, format: 0 | 1): Promise<Uint8Array> {
    compiler.addSource(MAIN, fillMath(doc));
    const res = await compiler.compile({ mainFilePath: MAIN, format, diagnostics: "full" });
    warnings = diagnosticsOf(res.diagnostics, "warning");
    if (!res.result) {
      const errors = diagnosticsOf(res.diagnostics, "error");
      throw new Error(errors.length ? errors.join("\n") : "Typst compile failed.");
    }
    return res.result as Uint8Array;
  }

  return {
    get warnings() {
      return warnings;
    },
    async svgPages(doc) {
      const vector = await compile(doc, 0);
      const svg = await renderer.renderSvg({
        format: "vector",
        artifactContent: vector,
        data_selection: { body: true, defs: true, css: true, js: false },
      });
      return splitSvgPages(svg);
    },
    async pdf(doc) {
      return await compile(doc, 1);
    },
    async check(doc) {
      await compile(doc, 0);
    },
  };
}
