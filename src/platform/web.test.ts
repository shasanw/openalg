import { describe, it, expect, vi, afterEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createWebPlatform } from "./web";
import { serializeWorksheet } from "../engine/persist";
import { buildSection, buildWorksheet, type Worksheet } from "../engine/worksheet";
import { QUADRATIC_FACTORING_ID } from "../engine/generators/quadraticFactoring";
import { QUADRATIC_FORMULA_ID } from "../engine/generators/quadraticFormula";

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
