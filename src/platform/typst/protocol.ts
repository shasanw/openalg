// Messages between the page (client.ts) and the Typst Web Worker (worker.ts).
// The client keeps at most one compile in flight, so the worker handles one
// request at a time and never needs its own queue.

import type { TypstDocument } from "../../engine/typst";

export type ToWorker =
  /** Start downloading the WASM, fonts and mitex and build the compiler. */
  | { type: "init" }
  | { type: "compile"; id: number; format: "svg" | "pdf"; doc: TypstDocument };

export type FromWorker =
  /** Bytes of compiler WASM, renderer WASM, fonts and mitex received so far. */
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready"; memoryBytes: number }
  | { type: "init-error"; message: string }
  | {
      type: "result";
      id: number;
      pages?: string[];
      pdf?: Uint8Array;
      warnings: string[];
      /** The size of every WASM linear memory in the worker, after this compile. */
      memoryBytes: number;
    }
  | { type: "error"; id: number; message: string; memoryBytes: number };
