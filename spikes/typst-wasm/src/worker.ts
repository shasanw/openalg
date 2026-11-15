/// <reference lib="webworker" />
// Typst-in-a-Web-Worker, the shape #24 would build. One long-lived compiler,
// fonts loaded once, the main file replaced per edit so Typst's comemo caches
// can reuse unchanged layout.
import {
  createTypstCompiler,
  createTypstRenderer,
  initOptions,
  loadFonts,
  MemoryAccessModel,
  type TypstCompiler,
  type TypstRenderer,
} from "@myriaddreamin/typst.ts";
import compilerWasmUrl from "@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url";
import rendererWasmUrl from "@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url";
import { MitexHost } from "./mitexHost";
import { resourceRows, type MathMode, type Req, type Res } from "./protocol";

const BASE = import.meta.env.BASE_URL;
const FONT_URLS = [
  "NewCM10-Regular.otf",
  "NewCM10-Bold.otf",
  "NewCM10-Italic.otf",
  "NewCMMath-Regular.otf",
].map((f) => `${BASE}vendor/fonts/${f}`);
const MITEX_TAR = `${BASE}vendor/mitex-0.2.7.tar.gz`;
const MITEX_WASM = `${BASE}vendor/mitex.wasm`;

// Capture every wasm instance's linear memory so we can report its size on any
// browser (iPad Safari has no performance.memory). The compiler's linear
// memory is the dominant cost; it only ever grows.
const memories: WebAssembly.Memory[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const grab = (r: any) => {
  const inst: WebAssembly.Instance = r instanceof WebAssembly.Instance ? r : r.instance;
  const mem = Object.values(inst.exports).find((e) => e instanceof WebAssembly.Memory);
  if (mem) memories.push(mem as WebAssembly.Memory);
  return r;
};
const wa = WebAssembly as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
for (const fn of ["instantiateStreaming", "instantiate"]) {
  const orig = wa[fn]?.bind(WebAssembly);
  if (orig) wa[fn] = async (...a: unknown[]) => grab(await orig(...a));
}
const wasmMemoryBytes = () => memories.reduce((s, m) => s + m.buffer.byteLength, 0);

let compiler: TypstCompiler;
let renderer: TypstRenderer;
let mathMode: MathMode = "package";
let mitex: MitexHost | undefined;

const post = (msg: Res, transfer: Transferable[] = []) => self.postMessage(msg, transfer);
const now = () => performance.now();

async function fetchBytes(url: string, cold: boolean): Promise<Uint8Array> {
  const res = await fetch(url, { cache: cold ? "no-store" : "default" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function init(mode: MathMode, cold: boolean) {
  mathMode = mode;
  const t0 = now();
  const timings = { wasmMs: 0, fontsMs: 0, mitexMs: 0, buildMs: 0, rendererMs: 0, totalMs: 0 };
  const timed = <T>(p: Promise<T>, key: keyof typeof timings) =>
    p.then((v) => ((timings[key] = now() - t0), v));

  // Kick off every download at once; they share the pipe.
  const fontsP = timed(Promise.all(FONT_URLS.map((u) => fetchBytes(u, cold))), "fontsMs");
  const mitexP = timed(fetchBytes(mode === "package" ? MITEX_TAR : MITEX_WASM, cold), "mitexMs");
  const rendererP = (async () => {
    renderer = createTypstRenderer();
    await renderer.init({ getModule: () => fetch(rendererWasmUrl, { cache: cold ? "no-store" : "default" }) });
    timings.rendererMs = now() - t0;
  })();

  compiler = createTypstCompiler();
  const access = new MemoryAccessModel();
  let mitexTar: Uint8Array | undefined;
  await compiler.init({
    getModule: () => fetch(compilerWasmUrl, { cache: cold ? "no-store" : "default" }),
    beforeBuild: [
      async () => {
        // runs after the compiler wasm is instantiated
        timings.wasmMs = now() - t0;
      },
      // Only our four fonts; `assets: false` stops typst.ts from pulling its
      // default text bundle from jsdelivr. The fetcher hands back the bytes
      // already downloading in parallel with the wasm.
      loadFonts(FONT_URLS, {
        assets: false,
        fetcher: (async (u: string) => {
          const all = await fontsP;
          return new Response(all[FONT_URLS.indexOf(u)] as BlobPart);
        }) as typeof fetch,
      }),
      initOptions.withAccessModel(access),
      initOptions.withPackageRegistry({
        // Synchronous by contract (the compiler calls it mid-compile), so the
        // tarball is prefetched in init and only untarred here, once.
        resolve(spec, ctx) {
          if (spec.namespace !== "preview" || spec.name !== "mitex" || spec.version !== "0.2.7") return undefined;
          const dir = `/@memory/packages/preview/mitex/0.2.7`;
          if (!access.getMTime(`${dir}/typst.toml`)) {
            if (!mitexTar) throw new Error("mitex not prefetched");
            ctx.untar(mitexTar, (path, data, mtime) => access.insertFile(`${dir}/${path}`, data, new Date(mtime)));
          }
          return dir;
        },
      }),
      async () => {
        const bytes = await mitexP;
        if (mode === "package") mitexTar = bytes;
        else mitex = await MitexHost.load(bytes);
      },
    ],
  });
  timings.buildMs = now() - t0;
  await rendererP;
  timings.totalMs = now() - t0;
  post({ type: "ready", timings, wasmMemoryBytes: wasmMemoryBytes() });
}

/** Typst string literal. */
const typstStr = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

// js mode: mitex output references a few names from mitex-scope (only
// `mitexsqrt` for this Topic); define them so the converted math evaluates in
// the standard scope. #24 must derive this list from mitex's spec, or use the
// package's mitex-scope.
const JS_PRELUDE = `#let mitexsqrt(..args) = if args.pos().len() == 1 { math.sqrt(args.pos().at(0)) } else { math.root(args.pos().at(0), args.pos().at(1)) }\n`;

// The spike sets the text font explicitly: the app's source relies on Typst's
// default (Libertinus Serif), which we deliberately do not ship.
const FONT_PRELUDE = `#set text(font: "New Computer Modern")\n`;

function fill(source: string, math: string[]): { main: string; mathMs: number } {
  const t = now();
  let prelude = FONT_PRELUDE;
  let body: string;
  if (mathMode === "package") {
    prelude += `#import "@preview/mitex:0.2.7": mi\n`;
    body = source.replace(/@@M(\d+)@@/g, (_, i) => `#mi(${typstStr(math[+i])})`);
  } else {
    prelude += JS_PRELUDE;
    body = source.replace(/@@M(\d+)@@/g, (_, i) => `$${mitex!.convertMath(math[+i])}$`);
  }
  return { main: prelude + body, mathMs: now() - t };
}

async function compile(id: number, source: string, math: string[], format: "svg" | "pdf") {
  const t0 = now();
  const { main, mathMs } = fill(source, math);
  compiler.addSource("/main.typ", main);
  const t1 = now();
  const res = await compiler.compile({
    mainFilePath: "/main.typ",
    format: format === "pdf" ? 1 : 0,
    diagnostics: "full",
  });
  const t2 = now();
  if (!res.result) {
    post({ type: "error", id, message: JSON.stringify(res.diagnostics) });
    return;
  }
  let svg: string | undefined;
  let pdf: Uint8Array | undefined;
  if (format === "svg") {
    svg = await renderer.renderSvg({ format: "vector", artifactContent: res.result });
  } else {
    pdf = res.result;
  }
  const t3 = now();
  post(
    {
      type: "compiled",
      id,
      format,
      timings: { mathMs, compileMs: t2 - t1, renderMs: t3 - t2, totalMs: t3 - t0 },
      svg,
      pdf,
      diagnostics: res.diagnostics,
      wasmMemoryBytes: wasmMemoryBytes(),
    },
    pdf ? [pdf.buffer] : [],
  );
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") await init(msg.mathMode, msg.cold);
    else if (msg.type === "stats")
      post({ type: "stats", id: msg.id, wasmMemoryBytes: wasmMemoryBytes(), resources: resourceRows(performance.getEntriesByType("resource")) });
    else await compile(msg.id, msg.source, msg.math, msg.format);
  } catch (err) {
    post({ type: "error", id: "id" in msg ? msg.id : undefined, message: String((err as Error)?.stack ?? err) });
  }
};
