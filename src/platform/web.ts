// The browser implementation of the Platform interface (ADR 0001: web-first,
// client-only). The Library lives in IndexedDB; Worksheet Files are downloaded
// and picked through ordinary browser file APIs. Every byte goes through
// `engine/persist`, so a Library record, a downloaded `.oalg` and a desktop-era
// file are all the same JSON.
//
// Preview and PDF compilation (Typst-WASM) are not part of this adapter yet;
// see issue #24.

import {
  serializeWorksheet,
  deserializeWorksheet,
} from "../engine/persist";
import {
  buildLibraryBackup,
  parseLibraryBackup,
  LIBRARY_BACKUP_EXTENSION,
  type LibraryBackupEntry,
} from "../engine/libraryBackup";
import type {
  LibraryEntry,
  LibraryRestoreSummary,
  Platform,
  StoragePersistence,
} from "./types";

const DB_NAME = "openalg";
const DB_VERSION = 1;
const STORE = "worksheets";

/** One Library record: the serialized Worksheet plus when it was last edited. */
interface LibraryRecord {
  id: string;
  json: string;
  updatedAt: number;
}

export interface WebPlatformOptions {
  /** IndexedDB factory; defaults to the browser's `indexedDB`. */
  indexedDB?: IDBFactory;
  /** Database name; defaults to "openalg". */
  dbName?: string;
  /** Clock for `updatedAt`; defaults to `Date.now`. */
  now?: () => number;
  /** Storage manager for persistence checks; defaults to `navigator.storage`. */
  storage?: Pick<StorageManager, "persist" | "persisted">;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      reject(new Error("The Library is open in another tab with an older version."));
  });
}

/**
 * Library metadata read straight from the stored JSON, mirroring the desktop
 * listing: unparseable records yield null and are skipped, missing fields fall
 * back to defaults. `generatorId` is the first Section's Topic and `count` is
 * the total Problems across Sections.
 */
function toEntry(record: LibraryRecord): LibraryEntry | null {
  let data: unknown;
  try {
    data = JSON.parse(record.json);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  // Version 2 keeps Topics and Problems on Sections; a version 1 record is one
  // Section's worth of fields at the top level.
  const sections = (Array.isArray(obj.sections) ? obj.sections : [obj]).filter(
    (s): s is Record<string, unknown> =>
      typeof s === "object" && s !== null && !Array.isArray(s),
  );
  const first = sections[0];
  return {
    id: record.id,
    title: typeof obj.title === "string" ? obj.title : "Untitled worksheet",
    generatorId: typeof first?.generatorId === "string" ? first.generatorId : "",
    count: sections.reduce(
      (n, s) => n + (Array.isArray(s.problems) ? s.problems.length : 0),
      0,
    ),
    updatedAt: record.updatedAt,
  };
}

function withExtension(name: string): string {
  return name.toLowerCase().endsWith(".oalg") ? name : `${name}.oalg`;
}

/** Trigger a browser download of `text` as `filename`. */
function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    // Revoke on the next tick so the browser has started the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Let the user pick one file; resolves null if they cancel. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** "OpenAlg Library Backup 2026-11-14.oalgbackup" (local date). */
function backupFilename(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `OpenAlg Library Backup ${day}${LIBRARY_BACKUP_EXTENSION}`;
}

const notYetSupported = (what: string) =>
  new Error(`${what} is not yet supported in the web build.`);

export function createWebPlatform(options: WebPlatformOptions = {}): Platform {
  const dbName = options.dbName ?? DB_NAME;
  const now = options.now ?? Date.now;
  let dbPromise: Promise<IDBDatabase> | null = null;

  function db(): Promise<IDBDatabase> {
    if (!dbPromise) {
      const factory = options.indexedDB ?? globalThis.indexedDB;
      if (!factory) {
        return Promise.reject(new Error("IndexedDB is not available in this browser."));
      }
      dbPromise = openDatabase(factory, dbName).catch((e) => {
        dbPromise = null; // allow a retry on the next call
        throw e;
      });
    }
    return dbPromise;
  }

  async function getRecord(id: string): Promise<LibraryRecord | undefined> {
    const tx = (await db()).transaction(STORE, "readonly");
    return await requestToPromise<LibraryRecord | undefined>(
      tx.objectStore(STORE).get(id),
    );
  }

  return {
    async saveWorksheet(worksheet, suggestedName) {
      downloadText(serializeWorksheet(worksheet), withExtension(suggestedName));
      return true;
    },

    async openWorksheet() {
      const file = await pickFile(".oalg,.json,application/json");
      if (!file) return null;
      return deserializeWorksheet(await readFileText(file));
    },

    // Launch files and "Open with" are desktop-only; the web has neither.
    async takeLaunchWorksheet() {
      return null;
    },

    async onOpenWorksheet() {
      return () => {};
    },

    async autosaveWorksheet(id, worksheet) {
      const record: LibraryRecord = {
        id,
        json: serializeWorksheet(worksheet),
        updatedAt: now(),
      };
      const tx = (await db()).transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      await transactionDone(tx);
    },

    async listLibrary() {
      const tx = (await db()).transaction(STORE, "readonly");
      const records = await requestToPromise<LibraryRecord[]>(
        tx.objectStore(STORE).getAll(),
      );
      return records
        .map(toEntry)
        .filter((e): e is LibraryEntry => e !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async loadLibrary(id) {
      const record = await getRecord(id);
      if (!record) return null;
      try {
        return deserializeWorksheet(record.json);
      } catch {
        // Unparseable record: treat as "not found", like the desktop adapter.
        return null;
      }
    },

    async deleteLibrary(id) {
      const tx = (await db()).transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      await transactionDone(tx);
    },

    async backupLibrary() {
      const tx = (await db()).transaction(STORE, "readonly");
      const records = await requestToPromise<LibraryRecord[]>(
        tx.objectStore(STORE).getAll(),
      );
      const entries: LibraryBackupEntry[] = [];
      let skipped = 0;
      for (const r of records) {
        try {
          entries.push({ id: r.id, updatedAt: r.updatedAt, worksheet: deserializeWorksheet(r.json) });
        } catch {
          skipped++; // unreadable record: it can't be restored anyway
        }
      }
      entries.sort((a, b) => b.updatedAt - a.updatedAt);
      const at = new Date(now());
      downloadText(buildLibraryBackup(entries, at), backupFilename(at));
      return { saved: entries.length, skipped };
    },

    async restoreLibrary() {
      const file = await pickFile(`${LIBRARY_BACKUP_EXTENSION},.json,application/json`);
      if (!file) return null;
      // Throws for a file that isn't a Library Backup; per-entry problems come
      // back in `failed` and don't stop the rest.
      const { entries, failed } = parseLibraryBackup(await readFileText(file));

      const database = await db();
      const existing = new Map<string, number>();
      {
        const tx = database.transaction(STORE, "readonly");
        const records = await requestToPromise<LibraryRecord[]>(
          tx.objectStore(STORE).getAll(),
        );
        for (const r of records) existing.set(r.id, r.updatedAt);
      }

      // Rule: a new id is restored; an id already in the Library is replaced
      // only by a strictly newer backup copy, so restoring never loses edits
      // made since the backup. The backup's updatedAt is kept as-is.
      const summary: LibraryRestoreSummary = { restored: 0, overwritten: 0, skipped: 0, failed };
      const writes: LibraryRecord[] = [];
      for (const e of entries) {
        const current = existing.get(e.id);
        if (current !== undefined && current >= e.updatedAt) {
          summary.skipped++;
          continue;
        }
        if (current === undefined) summary.restored++;
        else summary.overwritten++;
        existing.set(e.id, e.updatedAt);
        writes.push({ id: e.id, json: serializeWorksheet(e.worksheet), updatedAt: e.updatedAt });
      }
      if (writes.length > 0) {
        const tx = database.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        for (const w of writes) store.put(w);
        await transactionDone(tx);
      }
      return summary;
    },

    async storagePersistence(): Promise<StoragePersistence> {
      const storage = options.storage ?? globalThis.navigator?.storage;
      if (typeof storage?.persisted !== "function") return "unsupported";
      try {
        return (await storage.persisted()) ? "persistent" : "best-effort";
      } catch {
        return "unsupported";
      }
    },

    async requestPersistentStorage(): Promise<StoragePersistence> {
      const storage = options.storage ?? globalThis.navigator?.storage;
      if (typeof storage?.persist !== "function") return "unsupported";
      try {
        return (await storage.persist()) ? "persistent" : "best-effort";
      } catch {
        return "best-effort";
      }
    },

    async exportPdf() {
      throw notYetSupported("PDF export");
    },

    async renderPreview() {
      throw notYetSupported("Preview");
    },
  };
}

export const webPlatform: Platform = createWebPlatform();
