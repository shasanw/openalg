// Platform adapter: the seam between the app and the outside world (ADR 0001).
// The engine and UI talk ONLY to this interface and must never use browser
// storage or file APIs directly. `webPlatform` (IndexedDB Library + downloaded
// Worksheet Files) is the only implementation today; the interface stays so a
// desktop app or Library sync could be added later without reshaping the app.

import type { Worksheet } from "../engine/worksheet";
import type { TypstDocument } from "../engine/typst";
import type { LibraryBackupFailure } from "../engine/libraryBackup";

/** Metadata for one saved worksheet, used to render the home-screen recents. */
export interface LibraryEntry {
  id: string;
  title: string;
  /** The first Section's Topic. */
  generatorId: string;
  /** Number of Problems on the sheet, across all Sections. */
  count: number;
  /** Last-edited time, ms since the Unix epoch (newest first). */
  updatedAt: number;
}

/** What downloading a Library Backup wrote. */
export interface LibraryBackupResult {
  /** Worksheets written to the backup. */
  saved: number;
  /** Library records that couldn't be read and were left out. */
  skipped: number;
}

/**
 * What restoring a Library Backup did. A backup entry whose id is already in
 * the Library replaces it only when the backup copy is newer (by `updatedAt`);
 * otherwise the Library copy is kept and the entry counts as skipped.
 */
export interface LibraryRestoreSummary {
  /** Worksheets added that weren't in the Library. */
  restored: number;
  /** Library Worksheets replaced by a newer backup copy. */
  overwritten: number;
  /** Backup entries ignored because the Library copy is the same age or newer. */
  skipped: number;
  /** Backup entries that couldn't be read; the rest were still restored. */
  failed: LibraryBackupFailure[];
}

/**
 * Whether the browser has agreed not to evict the Library under storage
 * pressure: "persistent" (protected), "best-effort" (may be cleared), or
 * "unsupported" (the browser can't tell us).
 */
export type StoragePersistence = "persistent" | "best-effort" | "unsupported";

/**
 * Whether the Preview compiler is usable yet. On a first visit it downloads
 * (~9 MB compressed) while the app opens, so the Preview shows `loading`
 * progress; `loaded`/`total` are uncompressed bytes.
 */
export type RendererStatus =
  | { state: "loading"; loaded: number; total: number }
  | { state: "ready" }
  | { state: "error"; message: string };

export interface RenderPreviewOptions {
  /**
   * The live Preview sets this: a newer latest-wins request replaces an older
   * one still waiting, and an older one's result is never delivered. Either
   * way the older promise rejects with a `RenderSupersededError`, which the
   * caller should ignore. Requests without it (Print) always run.
   */
  latestWins?: boolean;
}

/** A latest-wins render that a newer request replaced. Not a failure. */
export class RenderSupersededError extends Error {
  constructor() {
    super("Superseded by a newer render.");
    this.name = "RenderSupersededError";
  }
}

export interface Platform {
  /** Save a portable copy to a user-chosen file. Resolves false if cancelled. */
  saveWorksheet(worksheet: Worksheet, suggestedName: string): Promise<boolean>;
  /** Import a worksheet from a file the user picks; null if they cancel. */
  openWorksheet(): Promise<Worksheet | null>;
  /**
   * A worksheet file the app was asked to open at launch (double-click / "Open
   * with" while the app was closed); null if it wasn't launched that way.
   */
  takeLaunchWorksheet(): Promise<Worksheet | null>;
  /**
   * Subscribe to worksheet files opened while the app is already running
   * (double-click / "Open with"). Returns an unsubscribe function.
   */
  onOpenWorksheet(handler: (worksheet: Worksheet) => void): Promise<() => void>;
  /**
   * Silently persist a worksheet to the managed library under a stable id
   * (overwrites in place). This is the auto-save path — no dialog, no file
   * paths surfaced to the user.
   */
  autosaveWorksheet(id: string, worksheet: Worksheet): Promise<void>;
  /** List saved worksheets for the recents view, newest-edited first. */
  listLibrary(): Promise<LibraryEntry[]>;
  /** Load a library worksheet by id; null if it no longer exists / can't parse. */
  loadLibrary(id: string): Promise<Worksheet | null>;
  /** Remove a worksheet from the library. */
  deleteLibrary(id: string): Promise<void>;
  /** Download one Library Backup file holding every Worksheet in the Library. */
  backupLibrary(): Promise<LibraryBackupResult>;
  /**
   * Pick a Library Backup file and merge it into the Library; null if the
   * teacher cancels. Rejects if the file isn't a Library Backup at all.
   */
  restoreLibrary(): Promise<LibraryRestoreSummary | null>;
  /** Current storage persistence, without asking for anything. */
  storagePersistence(): Promise<StoragePersistence>;
  /** Ask the browser to keep the Library from being evicted. */
  requestPersistentStorage(): Promise<StoragePersistence>;
  /** Compile a Typst document to PDF and save it. False if cancelled. */
  exportPdf(doc: TypstDocument, suggestedName: string): Promise<boolean>;
  /**
   * Compile a Typst document to one self-contained SVG string per page. Drives
   * the paginated in-app preview and the native print path, so the screen and
   * the printout are the exact Typst layout (#7).
   */
  renderPreview(doc: TypstDocument, options?: RenderPreviewOptions): Promise<string[]>;
  /**
   * Start loading the Preview compiler now, so it is ready by the first
   * Generate. Called once when the app opens; repeat calls do nothing.
   */
  prepareRenderer(): void;
  /**
   * Subscribe to the Preview compiler's status. The handler is called right
   * away with the current status. Returns an unsubscribe function.
   */
  onRendererStatus(handler: (status: RendererStatus) => void): () => void;
}
