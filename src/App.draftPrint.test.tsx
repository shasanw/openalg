// On a first visit the Preview shows a KaTeX draft while the Typst compiler
// downloads (#29). Print and Export PDF must never use it: they ask the
// platform for a Typst compile of every Version and wait for it.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TypstDocument } from "@/engine/typst";
import type { RenderPreviewOptions } from "@/platform/types";
import { ToastProvider } from "@/components/ui/toast";
import App from "./App";

const calls = vi.hoisted(() => ({
  preview: [] as { doc: TypstDocument; options?: RenderPreviewOptions }[],
  pdf: [] as TypstDocument[],
}));

vi.mock("@/platform", () => ({
  platform: {
    // The compiler is still downloading, and never finishes in this test.
    onRendererStatus: (handler: (s: unknown) => void) => {
      handler({ state: "loading", loaded: 1_000_000, total: 9_000_000 });
      return () => {};
    },
    renderPreview: (doc: TypstDocument, options?: RenderPreviewOptions) => {
      calls.preview.push({ doc, options });
      return new Promise(() => {});
    },
    exportPdf: (doc: TypstDocument) => {
      calls.pdf.push(doc);
      return new Promise(() => {});
    },
    storagePersistence: async () => "persistent",
    requestPersistentStorage: async () => "persistent",
    takeLaunchWorksheet: async () => null,
    onOpenWorksheet: async () => () => {},
    autosaveWorksheet: async () => {},
    listLibrary: async () => [],
    loadLibrary: async () => null,
  },
}));

describe("Print and Export PDF during the draft", () => {
  it("wait for the Typst compile instead of using the draft", async () => {
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /New Worksheet/ }));
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await userEvent.type(screen.getByRole("combobox", { name: "Search Topics" }), "factoring");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(document.querySelector("[data-preview-draft]")).not.toBeNull());
    await waitFor(() => expect(calls.preview.some((c) => c.options?.latestWins)).toBe(true));
    const previewCalls = calls.preview.length;

    await userEvent.click(screen.getByRole("button", { name: "Print" }));
    await waitFor(() => expect(calls.preview.length).toBe(previewCalls + 1));
    const print = calls.preview.at(-1)!;
    // A full Typst document (every Version), not the live Preview request.
    expect(print.options?.latestWins).toBeFalsy();
    expect(print.doc.source).toContain("#set page");
    // No print iframe yet: it waits for the compile.
    expect(document.querySelector("iframe")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));
    await waitFor(() => expect(calls.pdf).toHaveLength(1));
    expect(calls.pdf[0].source).toContain("#set page");
  });
});
