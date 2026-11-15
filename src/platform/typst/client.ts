// The main-thread side of the Typst worker. It owns the request schedule:
//
// - At most one compile is in flight. Others wait in a queue, so the worker
//   never piles up work behind a long compile.
// - Latest edit wins: a new latest-wins (Preview) request replaces any
//   latest-wins request still waiting, and a latest-wins result that arrives
//   after a newer one was requested is dropped. Both reject with
//   RenderSupersededError. Print and PDF requests are never dropped.
// - Requests made while the compiler is still downloading wait for it, so a
//   burst of edits during a cold start compiles once, for the last edit.
// - The Typst heap only grows (comemo keeps old revisions), so once the
//   worker's WASM memory passes a threshold it is replaced between compiles.
//   A restart is cheap once the files are cached (~0.1 s plus one cold compile).

import type { TypstDocument } from "../../engine/typst";
import { RenderSupersededError, type RendererStatus } from "../types";
import type { FromWorker, ToWorker } from "./protocol";

/** The part of a Worker the client uses (a fake in tests). */
export interface WorkerPort {
  postMessage(msg: ToWorker): void;
  terminate(): void;
  onmessage: ((event: { data: FromWorker }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface TypstClientOptions {
  createWorker: () => WorkerPort;
  /** Recycle the worker once its WASM memory exceeds this. Default 192 MB. */
  memoryLimitBytes?: number;
}

type Result = string[] | Uint8Array;

interface Job {
  id: number;
  format: "svg" | "pdf";
  doc: TypstDocument;
  latestWins: boolean;
  resolve: (value: Result) => void;
  reject: (reason: unknown) => void;
}

export const DEFAULT_MEMORY_LIMIT_BYTES = 192 * 1024 * 1024;

export class TypstClient {
  private readonly createWorker: () => WorkerPort;
  private readonly memoryLimit: number;
  private worker: WorkerPort | null = null;
  private ready = false;
  /** Whether a worker has ever finished loading (later restarts are silent). */
  private loadedOnce = false;
  private memoryBytes = 0;
  private queue: Job[] = [];
  private inFlight: Job | null = null;
  private nextId = 1;
  /** Id of the newest latest-wins request; older ones are stale. */
  private latestId = 0;
  private status: RendererStatus = { state: "loading", loaded: 0, total: 0 };
  private listeners = new Set<(status: RendererStatus) => void>();

  /** Worker restarts so far (for tests and diagnostics). */
  restarts = 0;

  constructor(options: TypstClientOptions) {
    this.createWorker = options.createWorker;
    this.memoryLimit = options.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES;
  }

  /** Start loading the compiler if it isn't already. */
  start(): void {
    if (!this.worker) this.spawn();
  }

  onStatus(handler: (status: RendererStatus) => void): () => void {
    this.listeners.add(handler);
    handler(this.status);
    return () => this.listeners.delete(handler);
  }

  svgPages(doc: TypstDocument, latestWins = false): Promise<string[]> {
    return this.submit("svg", doc, latestWins) as Promise<string[]>;
  }

  pdf(doc: TypstDocument): Promise<Uint8Array> {
    return this.submit("pdf", doc, false) as Promise<Uint8Array>;
  }

  private submit(format: Job["format"], doc: TypstDocument, latestWins: boolean): Promise<Result> {
    return new Promise<Result>((resolve, reject) => {
      const job: Job = { id: this.nextId++, format, doc, latestWins, resolve, reject };
      if (latestWins) {
        this.latestId = job.id;
        this.queue = this.queue.filter((queued) => {
          if (!queued.latestWins) return true;
          queued.reject(new RenderSupersededError());
          return false;
        });
      }
      this.queue.push(job);
      this.start();
      this.pump();
    });
  }

  private setStatus(status: RendererStatus) {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  private spawn() {
    const worker = this.createWorker();
    this.worker = worker;
    this.ready = false;
    this.memoryBytes = 0;
    worker.onmessage = (event) => {
      if (this.worker === worker) this.handle(event.data);
    };
    worker.onerror = (event) => {
      if (this.worker === worker) this.crashed(event);
    };
    if (!this.loadedOnce) this.setStatus({ state: "loading", loaded: 0, total: 0 });
    worker.postMessage({ type: "init" });
  }

  private handle(msg: FromWorker) {
    switch (msg.type) {
      case "progress":
        if (!this.loadedOnce) this.setStatus({ state: "loading", loaded: msg.loaded, total: msg.total });
        return;
      case "ready":
        this.ready = true;
        this.memoryBytes = msg.memoryBytes;
        if (!this.loadedOnce) {
          this.loadedOnce = true;
          this.setStatus({ state: "ready" });
        }
        this.pump();
        return;
      case "init-error":
        this.fail(new Error(msg.message));
        return;
      case "result":
      case "error": {
        const job = this.inFlight;
        if (!job || job.id !== msg.id) return;
        this.inFlight = null;
        this.memoryBytes = msg.memoryBytes;
        if (job.latestWins && job.id !== this.latestId) {
          job.reject(new RenderSupersededError());
        } else if (msg.type === "error") {
          job.reject(new Error(msg.message));
        } else {
          job.resolve(job.format === "pdf" ? msg.pdf! : msg.pages!);
        }
        this.pump();
        return;
      }
    }
  }

  /** The compiler couldn't load: reject everything; the next request retries. */
  private fail(error: Error) {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    const jobs = [...(this.inFlight ? [this.inFlight] : []), ...this.queue];
    this.inFlight = null;
    this.queue = [];
    for (const job of jobs) job.reject(error);
    if (!this.loadedOnce) this.setStatus({ state: "error", message: error.message });
  }

  /** The worker died (e.g. out of memory). */
  private crashed(event: unknown) {
    const message =
      (event as { message?: string } | null)?.message || "The Typst worker stopped unexpectedly.";
    if (!this.ready || !this.loadedOnce) {
      this.fail(new Error(message));
      return;
    }
    // A loaded worker crashed mid-session: fail the compile it was running and
    // start a fresh worker for whatever is still waiting.
    const job = this.inFlight;
    this.inFlight = null;
    job?.reject(new Error(message));
    this.worker?.terminate();
    this.restarts++;
    this.spawn();
  }

  private pump() {
    if (!this.worker || !this.ready || this.inFlight || this.queue.length === 0) return;
    if (this.memoryBytes > this.memoryLimit) {
      this.worker.terminate();
      this.restarts++;
      this.spawn();
      return;
    }
    const job = this.queue.shift()!;
    this.inFlight = job;
    this.worker.postMessage({ type: "compile", id: job.id, format: job.format, doc: job.doc });
  }
}
