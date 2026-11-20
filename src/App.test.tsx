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
    deleteLibrary: async (id: string) => {
      library.delete(id);
    },
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

/** Open a Topic's template from the home screen, showing every template first if it is folded away. */
async function openTemplate(name: RegExp) {
  const more = screen.queryByRole("button", { name: /^All Topics/ });
  if (more) await userEvent.click(more);
  await userEvent.click(screen.getByRole("button", { name }));
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
    await addSection("solving factoring");
    await addSection("quadratic formula");
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

// Throwaway Worksheets: opening something and leaving without making it real
// must not leave an entry in Recent.
describe("App: throwaway Worksheets stay out of the Library", () => {
  function renderApp() {
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
  }
  /** Wait past the autosave debounce, then go back to the home screen. */
  async function leave() {
    await new Promise((r) => setTimeout(r, 900));
    await userEvent.click(screen.getByRole("button", { name: "Library" }));
    await screen.findByRole("button", { name: /New Worksheet/ });
  }

  it("a template opened and left untouched is not saved", async () => {
    renderApp();
    await openTemplate(/Solving one-step equations/);
    await leave();
    expect(library.size).toBe(0);
  });

  it("a template that the teacher changes is saved", async () => {
    renderApp();
    await openTemplate(/Solving one-step equations/);
    await addSection("quadratic formula");
    await leave();
    expect(stored()).toHaveLength(1);
    expect(stored()[0].sections).toHaveLength(2);
  });

  it("a blank Worksheet with a Section added and then deleted is removed on leaving", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: /New Worksheet/ }));
    await addSection("solving factoring");
    await waitFor(() => expect(library.size).toBe(1), { timeout: 3000 });
    await userEvent.click(screen.getByRole("button", { name: "Section A actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Delete Section/ }));
    await leave();
    expect(library.size).toBe(0);
    expect(screen.queryByText(/Untitled worksheet/)).toBeNull();
  });

  it("an empty Worksheet the teacher named is kept", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: /New Worksheet/ }));
    await addSection("solving factoring");
    const title = screen.getByRole("textbox", { name: "Worksheet title" });
    await userEvent.clear(title);
    await userEvent.type(title, "Unit 4 Quiz");
    await userEvent.click(screen.getByRole("button", { name: "Section A actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Delete Section/ }));
    await leave();
    expect(stored().map((w) => w.title)).toEqual(["Unit 4 Quiz"]);
  });
});
