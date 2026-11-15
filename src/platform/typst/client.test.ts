import { describe, expect, it } from "vitest";
import { TypstClient, type WorkerPort } from "./client";
import type { FromWorker, ToWorker } from "./protocol";
import { RenderSupersededError, type RendererStatus } from "../types";

/** A scripted stand-in for the Typst worker. */
class FakeWorker implements WorkerPort {
  onmessage: ((event: { data: FromWorker }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: ToWorker[] = [];
  terminated = false;

  postMessage(msg: ToWorker) {
    this.sent.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  emit(msg: FromWorker) {
    this.onmessage?.({ data: msg });
  }
  compiles() {
    return this.sent.filter((m): m is Extract<ToWorker, { type: "compile" }> => m.type === "compile");
  }
  /** Answer the most recent compile with pages naming its document. */
  finishLast(memoryBytes = 1) {
    const job = this.compiles().at(-1)!;
    this.emit({
      type: "result",
      id: job.id,
      pages: [job.doc.source],
      pdf: job.format === "pdf" ? new Uint8Array([37, 80, 68, 70]) : undefined,
      warnings: [],
      memoryBytes,
    });
  }
}

function setup(memoryLimitBytes?: number) {
  const workers: FakeWorker[] = [];
  const client = new TypstClient({
    createWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    memoryLimitBytes,
  });
  return { client, workers, current: () => workers.at(-1)! };
}

const doc = (source: string) => ({ source, math: [] });

/** Settle a promise into a tagged result so tests can assert either way. */
const settle = <T,>(p: Promise<T>) =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("TypstClient", () => {
  it("starts the worker on start() and sends init once", () => {
    const { client, workers } = setup();
    client.start();
    client.start();
    expect(workers).toHaveLength(1);
    expect(workers[0].sent).toEqual([{ type: "init" }]);
  });

  it("holds requests until the compiler is ready", async () => {
    const { client, current } = setup();
    const p = client.svgPages(doc("a"));
    expect(current().compiles()).toHaveLength(0);
    current().emit({ type: "ready", memoryBytes: 0 });
    expect(current().compiles()).toHaveLength(1);
    current().finishLast();
    expect(await p).toEqual(["a"]);
  });

  it("latest wins: a burst during loading compiles only the last edit", async () => {
    const { client, current } = setup();
    const a = settle(client.svgPages(doc("a"), true));
    const b = settle(client.svgPages(doc("b"), true));
    const c = client.svgPages(doc("c"), true);
    current().emit({ type: "ready", memoryBytes: 0 });
    expect(current().compiles().map((m) => m.doc.source)).toEqual(["c"]);
    current().finishLast();
    expect(await c).toEqual(["c"]);
    for (const r of [await a, await b]) {
      expect(r.ok).toBe(false);
      expect((r as { error: unknown }).error).toBeInstanceOf(RenderSupersededError);
    }
  });

  it("keeps one compile in flight and replaces only the queued one", async () => {
    const { client, current } = setup();
    client.start();
    current().emit({ type: "ready", memoryBytes: 0 });
    const a = settle(client.svgPages(doc("a"), true)); // in flight
    const b = settle(client.svgPages(doc("b"), true)); // queued, then replaced
    const c = client.svgPages(doc("c"), true); // queued
    expect(current().compiles().map((m) => m.doc.source)).toEqual(["a"]);
    expect((await Promise.race([b, flush().then(() => "pending")])) as unknown).not.toBe("pending");

    current().finishLast(); // "a" comes back, but "c" is newer: dropped
    const ra = await a;
    expect(ra.ok).toBe(false);
    expect((ra as { error: unknown }).error).toBeInstanceOf(RenderSupersededError);
    expect(current().compiles().map((m) => m.doc.source)).toEqual(["a", "c"]);
    current().finishLast();
    expect(await c).toEqual(["c"]);
    expect((await b).ok).toBe(false);
  });

  it("never drops Print or PDF requests for a newer Preview", async () => {
    const { client, current } = setup();
    const print = client.svgPages(doc("print"));
    const preview1 = settle(client.svgPages(doc("p1"), true));
    const pdf = client.pdf(doc("pdf"));
    const preview2 = client.svgPages(doc("p2"), true);
    current().emit({ type: "ready", memoryBytes: 0 });
    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      order.push(current().compiles().at(-1)!.doc.source);
      current().finishLast();
      await flush();
    }
    expect(order).toEqual(["print", "pdf", "p2"]);
    expect(await print).toEqual(["print"]);
    expect(await pdf).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(await preview2).toEqual(["p2"]);
    expect((await preview1).ok).toBe(false);
  });

  it("rejects with the compile error message", async () => {
    const { client, current } = setup();
    client.start();
    current().emit({ type: "ready", memoryBytes: 0 });
    const p = client.svgPages(doc("bad"));
    const job = current().compiles()[0];
    current().emit({ type: "error", id: job.id, message: "unclosed delimiter", memoryBytes: 0 });
    await expect(p).rejects.toThrow("unclosed delimiter");
  });

  it("reports loading progress, then ready", () => {
    const { client, current } = setup();
    const seen: RendererStatus[] = [];
    client.onStatus((s) => seen.push(s));
    client.start();
    current().emit({ type: "progress", loaded: 5, total: 10 });
    current().emit({ type: "ready", memoryBytes: 0 });
    expect(seen).toEqual([
      { state: "loading", loaded: 0, total: 0 },
      { state: "loading", loaded: 0, total: 0 },
      { state: "loading", loaded: 5, total: 10 },
      { state: "ready" },
    ]);
  });

  it("on a failed load, rejects waiting requests and retries on the next one", async () => {
    const { client, workers, current } = setup();
    const statuses: RendererStatus[] = [];
    client.onStatus((s) => statuses.push(s));
    const p = client.svgPages(doc("a"));
    current().emit({ type: "init-error", message: "offline" });
    await expect(p).rejects.toThrow("offline");
    expect(statuses.at(-1)).toEqual({ state: "error", message: "offline" });
    expect(workers[0].terminated).toBe(true);

    const q = client.svgPages(doc("b"));
    expect(workers).toHaveLength(2);
    current().emit({ type: "ready", memoryBytes: 0 });
    current().finishLast();
    expect(await q).toEqual(["b"]);
  });

  it("recycles the worker past the memory limit, between compiles", async () => {
    const { client, workers, current } = setup(100);
    client.start();
    current().emit({ type: "ready", memoryBytes: 10 });
    const a = client.svgPages(doc("a"));
    current().finishLast(150); // now over the limit
    expect(await a).toEqual(["a"]);
    expect(workers).toHaveLength(1); // idle: nothing to restart for yet

    const statuses: RendererStatus[] = [];
    client.onStatus((s) => statuses.push(s));
    const b = client.svgPages(doc("b"));
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(client.restarts).toBe(1);
    current().emit({ type: "ready", memoryBytes: 10 });
    current().finishLast(20);
    expect(await b).toEqual(["b"]);
    // The restart is silent: no loading state once the compiler has loaded.
    expect(statuses).toEqual([{ state: "ready" }]);
  });

  it("restarts after a crash and fails only the compile that was running", async () => {
    const { client, workers, current } = setup();
    client.start();
    current().emit({ type: "ready", memoryBytes: 0 });
    const a = client.svgPages(doc("a"));
    const b = client.svgPages(doc("b"));
    current().onerror?.({ message: "out of memory" });
    await expect(a).rejects.toThrow("out of memory");
    expect(workers).toHaveLength(2);
    current().emit({ type: "ready", memoryBytes: 0 });
    current().finishLast();
    expect(await b).toEqual(["b"]);
  });

  it("ignores messages from a worker it has replaced", async () => {
    const { client, workers, current } = setup(100);
    client.start();
    current().emit({ type: "ready", memoryBytes: 500 });
    const p = client.svgPages(doc("a")); // over the limit: restarts first
    expect(workers).toHaveLength(2);
    workers[0].emit({ type: "result", id: 1, pages: ["stale"], warnings: [], memoryBytes: 0 });
    current().emit({ type: "ready", memoryBytes: 0 });
    current().finishLast();
    expect(await p).toEqual(["a"]);
  });
});
