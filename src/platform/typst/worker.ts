/// <reference lib="webworker" />
// The Typst Web Worker: hosts one long-lived compiler (engine.ts) so a compile
// never blocks the main thread. On "init" it starts every download at once
// (compiler WASM, renderer WASM, fonts, mitex), reporting bytes received so the
// Preview can show progress, then answers compile requests one at a time.

import { createTypstEngine, type TypstEngine } from "./engine";
import { TYPST_ASSET_BYTES, TYPST_ASSET_URLS } from "./assets";
import type { FromWorker, ToWorker } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

// Capture every WASM instance's linear memory so the client can recycle the
// worker as the Typst heap grows (it only ever grows; comemo keeps old
// revisions). Works on every browser, unlike performance.memory.
const memories: WebAssembly.Memory[] = [];
const wa = WebAssembly as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
for (const name of ["instantiateStreaming", "instantiate"]) {
  const original = wa[name]?.bind(WebAssembly);
  if (!original) continue;
  wa[name] = async (...args: unknown[]) => {
    const result = await original(...args);
    const instance =
      result instanceof WebAssembly.Instance
        ? result
        : (result as { instance?: WebAssembly.Instance }).instance;
    const memory = instance && Object.values(instance.exports).find((e) => e instanceof WebAssembly.Memory);
    if (memory) memories.push(memory as WebAssembly.Memory);
    return result;
  };
}
const memoryBytes = () => memories.reduce((sum, m) => sum + m.buffer.byteLength, 0);

const post = (msg: FromWorker, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

let loaded = 0;
let lastReport = 0;
function received(bytes: number) {
  loaded += bytes;
  const now = performance.now();
  if (now - lastReport > 100 || loaded >= TYPST_ASSET_BYTES) {
    lastReport = now;
    post({ type: "progress", loaded: Math.min(loaded, TYPST_ASSET_BYTES), total: TYPST_ASSET_BYTES });
  }
}

/** A body stream that reports bytes as they arrive. */
function counted(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received(chunk.byteLength);
        controller.enqueue(chunk);
      },
    }),
  );
}

async function get(url: string): Promise<Response> {
  // Low priority, so on an HTTP/2 host the page's own requests (the app's
  // fonts, the draft's KaTeX fonts) aren't queued behind ~9 MB of compiler.
  const res = await fetch(url, { priority: "low" });
  if (!res.ok || !res.body) throw new Error(`Couldn't download ${url} (${res.status}).`);
  return res;
}

/** A WASM response that still instantiates by streaming, with progress. */
async function wasm(url: string): Promise<Response> {
  const res = await get(url);
  return new Response(counted(res.body!), { headers: { "Content-Type": "application/wasm" } });
}

async function bytes(url: string): Promise<Uint8Array> {
  const res = await get(url);
  return new Uint8Array(await new Response(counted(res.body!)).arrayBuffer());
}

let engine: Promise<TypstEngine> | undefined;

function init(): Promise<TypstEngine> {
  // Every download starts now and shares the connection; the compiler WASM
  // is by far the largest.
  const compilerWasm = wasm(TYPST_ASSET_URLS.compilerWasm);
  const rendererWasm = wasm(TYPST_ASSET_URLS.rendererWasm);
  const fonts = Promise.all(TYPST_ASSET_URLS.fonts.map(bytes));
  const mitexPackage = bytes(TYPST_ASSET_URLS.mitexPackage);
  // Avoid unhandled-rejection noise if one fails before the engine awaits it.
  for (const p of [compilerWasm, rendererWasm, fonts, mitexPackage]) p.catch(() => {});
  return createTypstEngine({
    compilerWasm: () => compilerWasm,
    rendererWasm: () => rendererWasm,
    fonts,
    fontCount: TYPST_ASSET_URLS.fonts.length,
    mitexPackage,
  });
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === "init") {
    if (engine) return;
    engine = init();
    try {
      await engine;
      post({ type: "ready", memoryBytes: memoryBytes() });
    } catch (e) {
      post({ type: "init-error", message: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  try {
    if (!engine) throw new Error("The Typst worker was not initialised.");
    const typst = await engine;
    if (msg.format === "pdf") {
      let pdf = await typst.pdf(msg.doc);
      // Transfer only a buffer we own outright, never a view into WASM memory.
      if (pdf.byteOffset !== 0 || pdf.byteLength !== pdf.buffer.byteLength) pdf = pdf.slice();
      post(
        { type: "result", id: msg.id, pdf, warnings: typst.warnings, memoryBytes: memoryBytes() },
        [pdf.buffer],
      );
    } else {
      const pages = await typst.svgPages(msg.doc);
      post({ type: "result", id: msg.id, pages, warnings: typst.warnings, memoryBytes: memoryBytes() });
    }
  } catch (e) {
    post({
      type: "error",
      id: msg.id,
      message: e instanceof Error ? e.message : String(e),
      memoryBytes: memoryBytes(),
    });
  }
};
