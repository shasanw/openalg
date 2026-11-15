// Messages between the page and the Typst worker. This is a sketch of the
// worker API #24 needs (see RESULTS.md), trimmed to what the spike measures.
export type MathMode = "package" | "js";

export type Req =
  | { type: "init"; mathMode: MathMode; cold: boolean }
  | { type: "stats"; id: number }
  | { type: "compile"; id: number; source: string; math: string[]; format: "svg" | "pdf" };

export interface InitTimings {
  wasmMs: number; // fetch + instantiateStreaming of the compiler
  fontsMs: number; // parallel font fetches (overlapped with the wasm)
  mitexMs: number; // mitex tarball / plugin fetch (overlapped)
  buildMs: number; // compiler builder.build() incl. font parsing
  rendererMs: number; // renderer wasm (SVG output)
  totalMs: number;
}

export interface CompileTimings {
  mathMs: number; // LaTeX -> Typst conversion in JS (js mode only)
  compileMs: number; // typst compile to vector artifact (or PDF)
  renderMs: number; // vector -> SVG string
  totalMs: number;
}

export type Res =
  | { type: "ready"; timings: InitTimings; wasmMemoryBytes: number }
  | { type: "stats"; id: number; wasmMemoryBytes: number; resources: ResourceRow[] }
  | {
      type: "compiled";
      id: number;
      format: "svg" | "pdf";
      timings: CompileTimings;
      svg?: string;
      pdf?: Uint8Array;
      diagnostics?: unknown[];
      wasmMemoryBytes: number;
    }
  | { type: "error"; id?: number; message: string };

export interface ResourceRow {
  name: string;
  transfer: number; // bytes over the wire incl. headers (0 = served from cache)
  encoded: number; // compressed body
  decoded: number; // uncompressed body
  ms: number;
}

export function resourceRows(entries: PerformanceEntryList): ResourceRow[] {
  return entries
    .map((e) => e as PerformanceResourceTiming)
    .filter((e) => /wasm|otf|tar\.gz/.test(e.name))
    .map((e) => ({
      name: e.name.split("/").pop()!,
      transfer: e.transferSize,
      encoded: e.encodedBodySize,
      decoded: e.decodedBodySize,
      ms: Math.round(e.duration),
    }));
}
