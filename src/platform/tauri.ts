// The desktop implementation of the Platform interface. This is the ONLY file in
// the frontend permitted to import `@tauri-apps/*`. All file dialogs, file I/O,
// and Typst PDF compilation happen in the Rust core via these commands.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  serializeWorksheet,
  deserializeWorksheet,
} from "../engine/persist";
import type { LibraryEntry, Platform } from "./types";

export const tauriPlatform: Platform = {
  async saveWorksheet(worksheet, suggestedName) {
    return await invoke<boolean>("save_worksheet", {
      json: serializeWorksheet(worksheet),
      suggestedName,
    });
  },

  async openWorksheet() {
    const json = await invoke<string | null>("open_worksheet");
    return json ? deserializeWorksheet(json) : null;
  },

  async takeLaunchWorksheet() {
    const json = await invoke<string | null>("take_launch_file");
    return json ? deserializeWorksheet(json) : null;
  },

  async onOpenWorksheet(handler) {
    return await listen<string>("open-file", (event) => {
      try {
        handler(deserializeWorksheet(event.payload));
      } catch (e) {
        // A malformed/foreign file double-clicked into the app: log and ignore
        // rather than crashing the listener.
        console.error(e);
      }
    });
  },

  async autosaveWorksheet(id, worksheet) {
    await invoke("library_save", { id, json: serializeWorksheet(worksheet) });
  },

  async listLibrary() {
    return await invoke<LibraryEntry[]>("library_list");
  },

  async loadLibrary(id) {
    try {
      const json = await invoke<string>("library_load", { id });
      return deserializeWorksheet(json);
    } catch {
      // Missing or unparseable file — treat as "not found" so the caller can
      // show a friendly message instead of a raw error.
      return null;
    }
  },

  async deleteLibrary(id) {
    await invoke("library_delete", { id });
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
