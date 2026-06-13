// Platform adapter — the seam that keeps a future web build cheap (PRD: "future
// web target"). The engine and UI talk ONLY to this interface; they must never
// import `@tauri-apps/*` directly. The desktop build provides `TauriPlatform`;
// a web build would later provide a `WebPlatform` (File System Access API +
// Typst-WASM) without touching the engine or UI.

import type { Worksheet } from "../engine/worksheet";
import type { TypstDocument } from "../engine/typst";

export interface Platform {
  /** Save a worksheet (baked problems + recipe). Resolves false if cancelled. */
  saveWorksheet(worksheet: Worksheet, suggestedName: string): Promise<boolean>;
  /** Load a worksheet the user picks; null if they cancel. */
  openWorksheet(): Promise<Worksheet | null>;
  /** Compile a Typst document to PDF and save it. False if cancelled. */
  exportPdf(doc: TypstDocument, suggestedName: string): Promise<boolean>;
  /**
   * Compile a Typst document to one self-contained SVG string per page. Drives
   * the paginated in-app preview and the native print path, so the screen and
   * the printout are the exact Typst layout (#7).
   */
  renderPreview(doc: TypstDocument): Promise<string[]>;
}
