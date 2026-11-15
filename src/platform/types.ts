// Platform adapter: the seam between the app and the outside world (ADR 0001).
// The engine and UI talk ONLY to this interface and must never import
// `@tauri-apps/*` or browser storage APIs directly. The web build provides
// `webPlatform` (IndexedDB Library + downloaded Worksheet Files); the legacy
// desktop `tauriPlatform` remains until the Tauri shell is removed (#25).

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
  renderPreview(doc: TypstDocument): Promise<string[]>;
}
