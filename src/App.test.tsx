// End to end through the App with an in-memory Library that stores Worksheets
// exactly as the real one does (serialized Worksheet Files), so a multi-Section
// Worksheet must survive autosave and reopen intact.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deserializeWorksheet, serializeWorksheet } from "@/engine/persist";
import type { Worksheet } from "@/engine/worksheet";
import { ToastProvider } from "@/components/ui/toast";
import App from "./App";

const library = new Map<string, { json: string; updatedAt: number }>();

vi.mock("@/platform", () => ({
  platform: {
    onRendererStatus: () => () => {},
    renderPreview: async () => ["<svg></svg>"],
    storagePersistence: async () => "persistent",
    requestPersistentStorage: async () => "persistent",
    takeLaunchWorksheet: async () => null,
    onOpenWorksheet: async () => () => {},
    autosaveWorksheet: async (id: string, ws: Worksheet) => {
      library.set(id, { json: serializeWorksheet(ws), updatedAt: Date.now() });
    },
    listLibrary: async () =>
      [...library].map(([id, { json, updatedAt }]) => {
        const ws = deserializeWorksheet(json);
        return {
          id,
          title: ws.title,
          generatorId: ws.sections[0]?.generatorId ?? "",
          count: ws.sections.reduce((n, s) => n + s.problems.length, 0),
          updatedAt,
        };
      }),
    loadLibrary: async (id: string) => {
      const entry = library.get(id);
      return entry ? deserializeWorksheet(entry.json) : null;
    },
  },
}));

beforeEach(() => {
  library.clear();
});

function stored(): Worksheet[] {
  return [...library.values()].map((e) => deserializeWorksheet(e.json));
}

async function addSection(search: string) {
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  await userEvent.type(screen.getByRole("combobox", { name: "Search Topics" }), search);
  await userEvent.keyboard("{Enter}");
}

describe("App", () => {
  it("builds a multi-Section Worksheet that autosaves to the Library and reopens", async () => {
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /New Worksheet/ }));

    // A new Worksheet isn't saved until it has a Section, and says nothing yet.
    expect(screen.getByText("Add your first Section")).toBeInTheDocument();
    expect(screen.queryByText("Saved to Library")).toBeNull();
    expect(screen.getByRole("button", { name: /Print/ })).toBeDisabled();

    const title = screen.getByRole("textbox", { name: "Worksheet title" });
    await userEvent.clear(title);
    await userEvent.type(title, "Unit 3 Test");
    await addSection("factoring");
    await addSection("formula");
    await addSection("parabolas");

    await waitFor(() => expect(screen.getByText("Saved to Library")).toBeInTheDocument(), {
      timeout: 3000,
    });
    await waitFor(() => expect(stored()[0]?.sections).toHaveLength(3), { timeout: 3000 });
    const [saved] = stored();
    expect(saved.title).toBe("Unit 3 Test");
    expect(saved.sections.map((s) => s.generatorId)).toEqual([
      "quadratic-factoring",
      "quadratic-formula",
      "parabola-properties",
    ]);

    // Back to the Library and open it again.
    await userEvent.click(screen.getByRole("button", { name: "Library" }));
    await userEvent.click(await screen.findByRole("button", { name: /Unit 3 Test/ }));
    const outline = within(await screen.findByRole("complementary", { name: "Sections" }));
    expect(outline.getByText("30 problems")).toBeInTheDocument();
    expect(outline.getByText(/Problems 21–30/)).toBeInTheDocument();
  });

  it("has no Worksheet/Test toggle or Print Settings dialog", async () => {
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /New Worksheet/ }));
    expect(screen.queryByRole("button", { name: "Test" })).toBeNull();
    expect(screen.queryByTitle("Print & layout")).toBeNull();
    expect(screen.getByRole("tab", { name: "Print" })).toBeInTheDocument();
  });
});
