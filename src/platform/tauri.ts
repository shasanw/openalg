// The desktop implementation of the Platform interface. This is the ONLY file in
// the frontend permitted to import `@tauri-apps/*`. All file dialogs, file I/O,
// and Typst PDF compilation happen in the Rust core via these commands.

import { invoke } from "@tauri-apps/api/core";
import type { Worksheet } from "../engine/worksheet";
import type { Platform } from "./types";

export const tauriPlatform: Platform = {
  async saveWorksheet(worksheet, suggestedName) {
    return await invoke<boolean>("save_worksheet", {
      json: JSON.stringify(worksheet, null, 2),
      suggestedName,
    });
  },

  async openWorksheet() {
    const json = await invoke<string | null>("open_worksheet");
    return json ? (JSON.parse(json) as Worksheet) : null;
  },

  async exportPdf(doc, suggestedName) {
    return await invoke<boolean>("export_pdf", {
      source: doc.source,
      math: doc.math,
      suggestedName,
    });
  },

  async renderPreview(doc) {
    return await invoke<string[]>("render_preview", {
      source: doc.source,
      math: doc.math,
    });
  },
};
