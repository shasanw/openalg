import { describe, it, expect, vi, afterEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createWebPlatform } from "./web";
import { TypstClient, type WorkerPort } from "./typst/client";
import type { FromWorker, ToWorker } from "./typst/protocol";
import { serializeWorksheet } from "../engine/persist";
import { buildSection, buildWorksheet, type Worksheet } from "../engine/worksheet";
import { QUADRATIC_FACTORING_ID } from "../engine/generators/quadratics/quadraticFactoring";
import { QUADRATIC_FORMULA_ID } from "../engine/generators/quadratics/quadraticFormula";

function sampleWorksheet(title = "My Sheet", count = 8, baseSeed = 42): Worksheet {
  return buildWorksheet({
    generatorId: QUADRATIC_FACTORING_ID,
    baseSeed,
    count,
    title,
    directions: "Solve each.",
  });
}

/** A fresh, isolated Library with a controllable clock. */
function freshPlatform() {
  let t = 1000;
  const factory = new IDBFactory();
  const platform = createWebPlatform({ indexedDB: factory, now: () => t });
  return {
    platform,
    factory,
    setNow: (ms: number) => {
      t = ms;
    },
  };
}

/** jsdom's Blob has no .text(), so read it the old way. */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** Write a raw record straight into the Library store. */
function putRaw(factory: IDBFactory, record: { id: string; json: string; updatedAt: number }) {
  return new Promise<void>((resolve, reject) => {
    const req = factory.open("openalg", 1);
    req.onsuccess = () => {
      const tx = req.result.transaction("worksheets", "readwrite");
      tx.objectStore("worksheets").put(record);
      tx.oncomplete = () => {
        req.result.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

/** The version 1 (desktop-era) JSON for a single-Section Worksheet. */
function asV1Json(ws: Worksheet, { print = true } = {}): string {
  const [s] = ws.sections;
  const v1: Record<string, unknown> = {
    version: 1,
    title: ws.title,
    generatorId: s.generatorId,
    params: s.params,
    directions: s.directions,
    baseSeed: s.baseSeed,
    count: s.count,
    problems: s.problems,
  };
  if (print) v1.print = ws.print;
  return JSON.stringify(v1, null, 2);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("web Library", () => {
  it("round-trips: auto-save then load yields an equivalent worksheet", async () => {
    const { platform } = freshPlatform();
    const ws = sampleWorksheet();
    await platform.autosaveWorksheet("a", ws);
    expect(await platform.loadLibrary("a")).toEqual(ws);
  });

  it("stores the same bytes as a Worksheet File", async () => {
    const { platform } = freshPlatform();
    const ws = sampleWorksheet();
    await platform.autosaveWorksheet("a", ws);
    const loaded = await platform.loadLibrary("a");
    expect(serializeWorksheet(loaded!)).toBe(serializeWorksheet(ws));
  });

  it("auto-save overwrites in place under the same id", async () => {
    const { platform, setNow } = freshPlatform();
    await platform.autosaveWorksheet("a", sampleWorksheet("First"));
    setNow(2000);
    await platform.autosaveWorksheet("a", sampleWorksheet("Second", 3));
    const list = await platform.listLibrary();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "a", title: "Second", count: 3, updatedAt: 2000 });
    expect((await platform.loadLibrary("a"))!.title).toBe("Second");
  });

  it("lists Library entries newest-edited first with their metadata", async () => {
    const { platform, setNow } = freshPlatform();
    setNow(100);
    await platform.autosaveWorksheet("old", sampleWorksheet("Old", 4));
    setNow(300);
    await platform.autosaveWorksheet("new", sampleWorksheet("New", 6));
    setNow(200);
    await platform.autosaveWorksheet("mid", sampleWorksheet("Mid", 5));

    const list = await platform.listLibrary();
    expect(list.map((e) => e.id)).toEqual(["new", "mid", "old"]);
    expect(list[0]).toEqual({
      id: "new",
      title: "New",
      generatorId: QUADRATIC_FACTORING_ID,
      count: 6,
      updatedAt: 300,
    });
  });

  it("lists a multi-Section Worksheet by its first Topic and total Problems", async () => {
    const { platform } = freshPlatform();
    const ws = sampleWorksheet("Mixed", 4);
    const second = buildSection({
      generatorId: QUADRATIC_FORMULA_ID,
      baseSeed: 3,
      count: 2,
      directions: "Use the quadratic formula.",
    });
    const mixed: Worksheet = { ...ws, sections: [...ws.sections, second] };
    await platform.autosaveWorksheet("m", mixed);
    expect((await platform.listLibrary())[0]).toMatchObject({
      title: "Mixed",
      generatorId: QUADRATIC_FACTORING_ID,
      count: 6,
    });
    expect(await platform.loadLibrary("m")).toEqual(mixed);
  });

  it("lists and loads a version 1 record (upgraded to one Section)", async () => {
    const { platform, factory } = freshPlatform();
    const ws = sampleWorksheet("Old", 5);
    await platform.autosaveWorksheet("seed-db", sampleWorksheet());
    await putRaw(factory, { id: "v1", json: asV1Json(ws), updatedAt: 9999 });
    expect((await platform.listLibrary())[0]).toEqual({
      id: "v1",
      title: "Old",
      generatorId: QUADRATIC_FACTORING_ID,
      count: 5,
      updatedAt: 9999,
    });
    expect(await platform.loadLibrary("v1")).toEqual(ws);
  });

  it("an empty Library lists nothing", async () => {
    const { platform } = freshPlatform();
    expect(await platform.listLibrary()).toEqual([]);
  });

  it("loadLibrary returns null for a missing id", async () => {
    const { platform } = freshPlatform();
    expect(await platform.loadLibrary("nope")).toBeNull();
  });

  it("loadLibrary returns null and listLibrary skips an unparseable record", async () => {
    const { platform, factory } = freshPlatform();
    await platform.autosaveWorksheet("good", sampleWorksheet());
    // Corrupt a record directly in the store.
    await putRaw(factory, { id: "bad", json: "{not json", updatedAt: 5 });
    expect(await platform.loadLibrary("bad")).toBeNull();
    expect((await platform.listLibrary()).map((e) => e.id)).toEqual(["good"]);
  });

  it("deleteLibrary removes a worksheet; deleting a missing id is not an error", async () => {
    const { platform } = freshPlatform();
    await platform.autosaveWorksheet("a", sampleWorksheet());
    await platform.autosaveWorksheet("b", sampleWorksheet());
    await platform.deleteLibrary("a");
    await expect(platform.deleteLibrary("missing")).resolves.toBeUndefined();
    expect(await platform.loadLibrary("a")).toBeNull();
    expect((await platform.listLibrary()).map((e) => e.id)).toEqual(["b"]);
  });

  it("persists across platform instances sharing one database", async () => {
    const factory = new IDBFactory();
    const ws = sampleWorksheet();
    await createWebPlatform({ indexedDB: factory }).autosaveWorksheet("a", ws);
    expect(await createWebPlatform({ indexedDB: factory }).loadLibrary("a")).toEqual(ws);
  });
});

describe("web Worksheet Files", () => {
  it("saveWorksheet downloads <title>.oalg holding the serialized worksheet", async () => {
    const { platform } = freshPlatform();
    const ws = sampleWorksheet();
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return "blob:test";
    });
    URL.revokeObjectURL = vi.fn();
    let downloaded = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloaded = this.download;
    });

    expect(await platform.saveWorksheet(ws, "My Sheet.oalg")).toBe(true);
    expect(downloaded).toBe("My Sheet.oalg");
    expect(await blobText(blob!)).toBe(serializeWorksheet(ws));

    await platform.saveWorksheet(ws, "Bare name");
    expect(downloaded).toBe("Bare name.oalg");
  });

  /** Stub the hidden file input: hand it `file`, or cancel if null. */
  function stubPicker(file: File | null) {
    let accept = "";
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      accept = this.accept;
      if (file) {
        Object.defineProperty(this, "files", { value: [file] });
        this.dispatchEvent(new Event("change"));
      } else {
        this.dispatchEvent(new Event("cancel"));
      }
    });
    return () => accept;
  }

  it("openWorksheet reopens a downloaded Worksheet File identically", async () => {
    const { platform } = freshPlatform();
    const ws = sampleWorksheet();
    const accept = stubPicker(new File([serializeWorksheet(ws)], "My Sheet.oalg"));
    const opened = await platform.openWorksheet();
    expect(opened).toEqual(ws);
    expect(serializeWorksheet(opened!)).toBe(serializeWorksheet(ws));
    expect(accept()).toContain(".oalg");
    expect(accept()).toContain(".json");
  });

  it("openWorksheet imports a legacy desktop .json file (v1, upgraded and normalized)", async () => {
    const { platform } = freshPlatform();
    const ws = sampleWorksheet();
    // Desktop-era files are version 1 and may predate the print block.
    stubPicker(new File([asV1Json(ws, { print: false })], "old.json"));
    expect(await platform.openWorksheet()).toEqual(ws);
  });

  it("openWorksheet resolves null when the picker is cancelled", async () => {
    const { platform } = freshPlatform();
    stubPicker(null);
    expect(await platform.openWorksheet()).toBeNull();
  });

  it("openWorksheet rejects a file that isn't a worksheet", async () => {
    const { platform } = freshPlatform();
    stubPicker(new File(["hello"], "x.oalg"));
    await expect(platform.openWorksheet()).rejects.toThrow(/Not a valid worksheet file/);
  });
});

describe("web desktop-only hooks", () => {
  it("has no launch worksheet and open-with is a no-op", async () => {
    const { platform } = freshPlatform();
    expect(await platform.takeLaunchWorksheet()).toBeNull();
    const unsubscribe = await platform.onOpenWorksheet(() => {
      throw new Error("never called");
    });
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe("web Library Backup", () => {
  /** Capture what the next download writes. */
  function captureDownload() {
    const out = { name: "", blob: undefined as Blob | undefined };
    URL.createObjectURL = vi.fn((b: Blob) => {
      out.blob = b;
      return "blob:test";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      out.name = this.download;
    });
    return out;
  }

  /** Stub the hidden file input with `file` (null = cancel); returns the accept list. */
  function stubPicker(file: File | null) {
    let accept = "";
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      accept = this.accept;
      if (file) {
        Object.defineProperty(this, "files", { value: [file] });
        this.dispatchEvent(new Event("change"));
      } else {
        this.dispatchEvent(new Event("cancel"));
      }
    });
    return () => accept;
  }

  async function backupText(platform: ReturnType<typeof freshPlatform>["platform"]) {
    const dl = captureDownload();
    const result = await platform.backupLibrary();
    return { result, name: dl.name, text: await blobText(dl.blob!) };
  }

  it("backup, then restore into an empty Library, gives back every Worksheet identically", async () => {
    const { platform, setNow } = freshPlatform();
    const sheets: Record<string, Worksheet> = {
      a: sampleWorksheet("Alpha", 4, 1),
      b: sampleWorksheet("Beta", 7, 2),
      c: sampleWorksheet("Gamma", 1, 3),
    };
    let t = 100;
    for (const [id, ws] of Object.entries(sheets)) {
      setNow(t += 100);
      await platform.autosaveWorksheet(id, ws);
    }
    const listBefore = await platform.listLibrary();

    const { result, name, text } = await backupText(platform);
    expect(result).toEqual({ saved: 3, skipped: 0 });
    expect(name).toMatch(/^OpenAlg Library Backup \d{4}-\d{2}-\d{2}\.oalgbackup$/);
    const envelope = JSON.parse(text);
    expect(envelope).toMatchObject({ kind: "openalg-library-backup", version: 1 });
    expect(envelope.worksheets).toHaveLength(3);

    // "Clear site data": a brand-new, empty database.
    const fresh = freshPlatform().platform;
    const accept = stubPicker(new File([text], name));
    expect(await fresh.restoreLibrary()).toEqual({
      restored: 3,
      overwritten: 0,
      skipped: 0,
      failed: [],
    });
    expect(accept()).toContain(".oalgbackup");
    expect(accept()).toContain(".json");
    expect(await fresh.listLibrary()).toEqual(listBefore);
    for (const [id, ws] of Object.entries(sheets)) {
      const restored = await fresh.loadLibrary(id);
      expect(restored).toEqual(ws);
      expect(serializeWorksheet(restored!)).toBe(serializeWorksheet(ws));
    }
  });

  it("restores the valid entries and reports an invalid one", async () => {
    const { platform } = freshPlatform();
    await platform.autosaveWorksheet("good1", sampleWorksheet("One"));
    await platform.autosaveWorksheet("good2", sampleWorksheet("Two"));
    const envelope = JSON.parse((await backupText(platform)).text);
    envelope.worksheets.splice(1, 0, {
      id: "broken",
      updatedAt: 5,
      worksheet: { title: "not really a worksheet" },
    });

    const fresh = freshPlatform().platform;
    stubPicker(new File([JSON.stringify(envelope)], "b.oalgbackup"));
    const summary = await fresh.restoreLibrary();
    expect(summary).toMatchObject({ restored: 2, overwritten: 0, skipped: 0 });
    expect(summary!.failed).toHaveLength(1);
    expect(summary!.failed[0]).toMatchObject({ index: 1, id: "broken" });
    expect(summary!.failed[0].reason).toMatch(/Not a valid worksheet file/);
    expect((await fresh.listLibrary()).map((e) => e.id).sort()).toEqual(["good1", "good2"]);
  });

  it("an id already in the Library is overwritten only by a newer backup copy", async () => {
    const { platform, setNow } = freshPlatform();
    setNow(1000);
    await platform.autosaveWorksheet("older-here", sampleWorksheet("Backup A"));
    await platform.autosaveWorksheet("newer-here", sampleWorksheet("Backup B"));
    const { text } = await backupText(platform);

    setNow(500);
    await platform.autosaveWorksheet("older-here", sampleWorksheet("Library A"));
    setNow(2000);
    await platform.autosaveWorksheet("newer-here", sampleWorksheet("Library B"));

    stubPicker(new File([text], "b.oalgbackup"));
    expect(await platform.restoreLibrary()).toEqual({
      restored: 0,
      overwritten: 1,
      skipped: 1,
      failed: [],
    });
    expect((await platform.loadLibrary("older-here"))!.title).toBe("Backup A");
    expect((await platform.loadLibrary("newer-here"))!.title).toBe("Library B");
  });

  it("backup leaves out unreadable records and counts them", async () => {
    const { platform, factory } = freshPlatform();
    await platform.autosaveWorksheet("good", sampleWorksheet());
    await new Promise<void>((resolve, reject) => {
      const req = factory.open("openalg", 1);
      req.onsuccess = () => {
        const tx = req.result.transaction("worksheets", "readwrite");
        tx.objectStore("worksheets").put({ id: "bad", json: "{nope", updatedAt: 5 });
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    const { result, text } = await backupText(platform);
    expect(result).toEqual({ saved: 1, skipped: 1 });
    expect(JSON.parse(text).worksheets.map((w: { id: string }) => w.id)).toEqual(["good"]);
  });

  it("restoring a file that isn't a Library Backup fails clearly and changes nothing", async () => {
    const { platform } = freshPlatform();
    await platform.autosaveWorksheet("a", sampleWorksheet());
    const before = await platform.listLibrary();

    // A single Worksheet File is not a Library Backup.
    stubPicker(new File([serializeWorksheet(sampleWorksheet())], "x.oalg"));
    await expect(platform.restoreLibrary()).rejects.toThrow(/Not a Library Backup file/);

    stubPicker(new File(["hello"], "x.oalgbackup"));
    await expect(platform.restoreLibrary()).rejects.toThrow(/Not a Library Backup file/);

    stubPicker(
      new File([JSON.stringify({ kind: "openalg-library-backup", version: 99, worksheets: [] })], "x"),
    );
    await expect(platform.restoreLibrary()).rejects.toThrow(/unsupported version/);

    expect(await platform.listLibrary()).toEqual(before);
  });

  it("restore resolves null when the picker is cancelled", async () => {
    const { platform } = freshPlatform();
    stubPicker(null);
    expect(await platform.restoreLibrary()).toBeNull();
  });
});

describe("web persistent storage", () => {
  it("reports and requests persistence through the storage manager", async () => {
    let granted = false;
    const storage = {
      persisted: vi.fn(async () => granted),
      persist: vi.fn(async () => (granted = true)),
    };
    const platform = createWebPlatform({ indexedDB: new IDBFactory(), storage });
    expect(await platform.storagePersistence()).toBe("best-effort");
    expect(await platform.requestPersistentStorage()).toBe("persistent");
    expect(await platform.storagePersistence()).toBe("persistent");
  });

  it("a refused request stays best-effort", async () => {
    const storage = { persisted: async () => false, persist: async () => false };
    const platform = createWebPlatform({ indexedDB: new IDBFactory(), storage });
    expect(await platform.requestPersistentStorage()).toBe("best-effort");
  });

  it("is unsupported when the browser has no storage manager", async () => {
    const platform = createWebPlatform({
      indexedDB: new IDBFactory(),
      storage: {} as never,
    });
    expect(await platform.storagePersistence()).toBe("unsupported");
    expect(await platform.requestPersistentStorage()).toBe("unsupported");
  });
});

describe("web Preview and PDF", () => {
  /** A Typst client whose worker answers every compile at once. */
  function platformWithTypst() {
    const sent: ToWorker[] = [];
    let port: WorkerPort;
    const typst = new TypstClient({
      createWorker: () => {
        port = {
          onmessage: null,
          onerror: null,
          terminate() {},
          postMessage(msg) {
            sent.push(msg);
            const reply = (data: FromWorker) => queueMicrotask(() => port.onmessage?.({ data }));
            if (msg.type === "init") reply({ type: "ready", memoryBytes: 0 });
            else
              reply({
                type: "result",
                id: msg.id,
                pages: msg.format === "svg" ? ["<svg>1</svg>", "<svg>2</svg>"] : undefined,
                pdf: msg.format === "pdf" ? new TextEncoder().encode("%PDF-1.7") : undefined,
                warnings: [],
                memoryBytes: 0,
              });
          },
        };
        return port;
      },
    });
    const platform = createWebPlatform({ indexedDB: new IDBFactory(), typst: () => typst });
    return { platform, sent };
  }

  it("renderPreview returns one SVG per page from the Typst worker", async () => {
    const { platform, sent } = platformWithTypst();
    const doc = { source: "Hi @@M0@@", math: ["x"] };
    expect(await platform.renderPreview(doc, { latestWins: true })).toEqual([
      "<svg>1</svg>",
      "<svg>2</svg>",
    ]);
    expect(sent).toEqual([
      { type: "init" },
      { type: "compile", id: 1, format: "svg", doc },
    ]);
  });

  it("exportPdf downloads <name>.pdf", async () => {
    const { platform } = platformWithTypst();
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return "blob:test";
    });
    URL.revokeObjectURL = vi.fn();
    let downloaded = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloaded = this.download;
    });

    expect(await platform.exportPdf({ source: "x", math: [] }, "Quiz 3.pdf")).toBe(true);
    expect(downloaded).toBe("Quiz 3.pdf");
    expect(blob!.type).toBe("application/pdf");
    expect(await blobText(blob!)).toBe("%PDF-1.7");

    await platform.exportPdf({ source: "x", math: [] }, "Quiz 4");
    expect(downloaded).toBe("Quiz 4.pdf");
  });

  it("reports the renderer as ready once the worker has loaded", async () => {
    const { platform } = platformWithTypst();
    const seen: string[] = [];
    platform.onRendererStatus((s) => seen.push(s.state));
    platform.prepareRenderer();
    await new Promise((r) => setTimeout(r, 0));
    expect(seen.at(-1)).toBe("ready");
  });
});
