// Platform adapter — the seam that keeps a future web build cheap (PRD: "future
// web target"). The engine and UI talk ONLY to this interface; they must never
// import `@tauri-apps/*` directly. The desktop build provides `TauriPlatform`;
// a web build would later provide a `WebPlatform` (File System Access API +
// Typst-WASM) without touching the engine or UI.

import type { Worksheet } from "../engine/worksheet";
import type { TypstDocument } from "../engine/typst";

/** Metadata for one saved worksheet, used to render the home-screen recents. */
export interface LibraryEntry {
  id: string;
  title: string;
  generatorId: string;
  /** Number of problems on the sheet. */
  count: number;
  /** Last-edited time, ms since the Unix epoch (newest first). */
  updatedAt: number;
}

export interface Platform {
  /** Save a portable copy to a user-chosen file. Resolves false if cancelled. */
  saveWorksheet(worksheet: Worksheet, suggestedName: string): Promise<boolean>;
  /** Import a worksheet from a file the user picks; null if they cancel. */
  openWorksheet(): Promise<Worksheet | null>;
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
  /** Compile a Typst document to PDF and save it. False if cancelled. */
  exportPdf(doc: TypstDocument, suggestedName: string): Promise<boolean>;
  /**
   * Compile a Typst document to one self-contained SVG string per page. Drives
   * the paginated in-app preview and the native print path, so the screen and
   * the printout are the exact Typst layout (#7).
   */
  renderPreview(doc: TypstDocument): Promise<string[]>;
}
