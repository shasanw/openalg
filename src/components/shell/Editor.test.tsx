import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  addSection,
  buildSection,
  emptyWorksheet,
  type Worksheet,
} from "@/engine/worksheet";
import { ToastProvider } from "@/components/ui/toast";
import { Editor } from "./Editor";

const renderPreview = vi.fn(async (..._args: unknown[]) => ["<svg></svg>"]);

vi.mock("@/platform", () => ({
  platform: {
    onRendererStatus: () => () => {},
    renderPreview: (...args: unknown[]) => renderPreview(...args),
  },
}));

beforeEach(() => {
  renderPreview.mockClear();
});

function sheet(...topics: [string, number][]): Worksheet {
  return topics.reduce(
    (ws, [generatorId, count], i) => addSection(ws, buildSection({ generatorId, baseSeed: i + 1, count })),
    emptyWorksheet({ title: "Unit 3 Test" }),
  );
}

/** Mount the Editor around real Worksheet state, exposing the latest value. */
function mount(initial: Worksheet) {
  const latest: { ws: Worksheet } = { ws: initial };
  function Harness() {
    const [ws, setWs] = useState(initial);
    latest.ws = ws;
    return (
      <Editor
        worksheet={ws}
        onChange={(fn) => setWs((w) => fn(w))}
        topBar={<div>top bar</div>}
      />
    );
  }
  render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
  return latest;
}

const outline = () => within(screen.getByRole("complementary", { name: "Sections" }));
const rows = () => outline().getAllByRole("button").filter((b) => b.textContent?.includes("Section "));
const rowText = () => rows().map((r) => r.textContent);
const topicOptions = () => within(screen.getByRole("listbox", { name: "Topics" })).getAllByRole("option");

describe("Editor: empty Worksheet", () => {
  it("invites the teacher to add a Section and opens the centered picker", async () => {
    mount(emptyWorksheet());
    expect(screen.getByText("Add your first Section")).toBeInTheDocument();
    expect(outline().getByText(/No Sections yet/)).toBeInTheDocument();
    const preview = within(screen.getByRole("main", { name: "Preview" }));
    await userEvent.click(preview.getByRole("button", { name: /Add Section/ }));
    expect(screen.getByRole("dialog", { name: "Add Section" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Search Topics" })).toHaveFocus();
  });
});

describe("Editor: Topic picker", () => {
  it("opens with Cmd/Ctrl+K and adds a Section with the keyboard alone", async () => {
    const latest = mount(emptyWorksheet());
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const search = screen.getByRole("combobox", { name: "Search Topics" });
    await userEvent.type(search, "formula");
    // Found in both Courses that list it, the opening Course (the first) first.
    const options = topicOptions();
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining("quadratic formula"),
      expect.stringContaining("quadratic formula"),
    ]);
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(latest.ws.sections.map((s) => s.generatorId)).toEqual(["quadratic-formula"]);
    expect(latest.ws.sections[0].problems).toHaveLength(10);
    expect(rowText()).toEqual([expect.stringMatching(/Problems 1–10 · Quadratic Functions/)]);
  });

  it("moves the highlight with the arrow keys and wraps", async () => {
    mount(emptyWorksheet());
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const search = screen.getByRole("combobox", { name: "Search Topics" });
    const active = () => document.getElementById(search.getAttribute("aria-activedescendant")!);
    const all = topicOptions();
    expect(active()).toBe(all[0]);
    await userEvent.keyboard("{ArrowDown}");
    expect(active()).toBe(all[1]);
    expect(all[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(active()).toBe(all.at(-1));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says when nothing matches", async () => {
    mount(emptyWorksheet());
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await userEvent.type(screen.getByRole("combobox", { name: "Search Topics" }), "zzz");
    expect(screen.getByText(/No Topics match/)).toBeInTheDocument();
  });
});

describe("Editor: Section outline", () => {
  const three = () =>
    sheet(["quadratic-factoring", 8], ["quadratic-formula", 6], ["parabola-properties", 4]);

  it("lists each Section with its letter, Topic, continuous range and Unit", () => {
    mount(three());
    expect(rowText()).toEqual([
      expect.stringMatching(/^ASection A: Solving quadratics by factoringProblems 1–8 · Quadratic Functions$/),
      expect.stringMatching(/Problems 9–14 · Quadratic Functions/),
      expect.stringMatching(/Problems 15–18 · Quadratic Functions/),
    ]);
    expect(outline().getByText("18 problems")).toBeInTheDocument();
    expect(rows()[0]).toHaveAttribute("aria-current", "true");
  });

  it("selects a row and shows that Section in the Inspector", async () => {
    mount(three());
    await userEvent.click(rows()[1]);
    expect(rows()[1]).toHaveAttribute("aria-current", "true");
    expect(rows()[0]).not.toHaveAttribute("aria-current");
    const inspector = within(screen.getByRole("complementary", { name: "Inspector" }));
    expect(inspector.getByText(/^Section B/)).toBeInTheDocument();
    expect(inspector.getByText("Problems 9–14")).toBeInTheDocument();
  });

  it("moves the focused Section with Alt+Arrow, keeping numbering continuous", async () => {
    const latest = mount(three());
    rows()[0].focus();
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(latest.ws.sections.map((s) => s.generatorId)).toEqual([
      "quadratic-formula",
      "quadratic-factoring",
      "parabola-properties",
    ]);
    expect(rowText()[0]).toMatch(/Problems 1–6/);
    expect(rowText()[1]).toMatch(/Problems 7–14/);
    expect(rows()[1]).toHaveAttribute("aria-current", "true");
  });

  it("moves the selection with plain arrow keys", async () => {
    mount(three());
    rows()[0].focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(rows()[1]).toHaveAttribute("aria-current", "true");
  });
});

describe("Editor: Section tab", () => {
  it("changes only the selected Section's count, clamped to its limits", async () => {
    const latest = mount(sheet(["quadratic-factoring", 3], ["quadratic-formula", 2]));
    await userEvent.click(rows()[1]);
    const before = latest.ws.sections[0];
    await userEvent.click(screen.getByRole("button", { name: "Increase Problems in this Section" }));
    expect(latest.ws.sections[1].problems).toHaveLength(3);
    expect(latest.ws.sections[0]).toBe(before);
    expect(rowText()[1]).toMatch(/Problems 4–6/);
    const input = screen.getByRole("spinbutton", { name: "Problems in this Section" });
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.blur(input);
    expect(latest.ws.sections[1].count).toBe(50);
    expect(screen.getByText("1 to 50")).toBeInTheDocument();
  });

  it("edits Directions and Topic Options of the selected Section only", async () => {
    const latest = mount(sheet(["quadratic-factoring", 3], ["quadratic-factoring", 3]));
    await userEvent.click(rows()[1]);
    const directions = screen.getByLabelText("Directions");
    await userEvent.clear(directions);
    await userEvent.type(directions, "Factor.");
    expect(latest.ws.sections[1].directions).toBe("Factor.");
    expect(latest.ws.sections[0].directions).not.toBe("Factor.");
    await userEvent.click(screen.getByRole("switch", { name: /repeated roots/ }));
    expect(latest.ws.sections[1].params.allowEqualRoots).toBe(true);
    expect(latest.ws.sections[0].params.allowEqualRoots).toBeUndefined();
  });

  it("gives one Section new problems without touching the others", async () => {
    const latest = mount(sheet(["quadratic-factoring", 4], ["quadratic-formula", 4]));
    const [a, b] = latest.ws.sections;
    await userEvent.click(screen.getByRole("button", { name: /New problems for this Section/ }));
    expect(latest.ws.sections[0].baseSeed).not.toBe(a.baseSeed);
    expect(latest.ws.sections[1]).toBe(b);
  });

  it("duplicates, moves and deletes through the Section menu, with Undo", async () => {
    const latest = mount(sheet(["quadratic-factoring", 2], ["quadratic-formula", 3]));
    const topics = () => latest.ws.sections.map((s) => s.generatorId);
    const menu = async (item: string) => {
      const trigger = screen.getByRole("button", { name: /Section [A-Z] actions/ });
      trigger.focus();
      await userEvent.keyboard("{Enter}");
      await userEvent.click(await screen.findByRole("menuitem", { name: new RegExp(item) }));
    };

    await menu("Duplicate");
    expect(topics()).toEqual(["quadratic-factoring", "quadratic-factoring", "quadratic-formula"]);
    expect(rows()[1]).toHaveAttribute("aria-current", "true");

    await menu("Move down");
    expect(topics()).toEqual(["quadratic-factoring", "quadratic-formula", "quadratic-factoring"]);
    expect(rows()[2]).toHaveAttribute("aria-current", "true");
    expect(rowText()[2]).toMatch(/Problems 6–7/);

    await menu("Move up");
    expect(topics()).toEqual(["quadratic-factoring", "quadratic-factoring", "quadratic-formula"]);

    await menu("Delete Section");
    expect(topics()).toEqual(["quadratic-factoring", "quadratic-formula"]);
    expect(rowText()[1]).toMatch(/Problems 3–5/);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(topics()).toEqual(["quadratic-factoring", "quadratic-factoring", "quadratic-formula"]);
  });

  it("disables Move up on the first Section", async () => {
    mount(sheet(["quadratic-factoring", 2], ["quadratic-formula", 3]));
    screen.getByRole("button", { name: "Section A actions" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("menuitem", { name: /Move up/ })).toHaveAttribute("data-disabled");
  });
});

describe("Editor: Worksheet and Print tabs", () => {
  it("keeps Section, Worksheet and Print settings on separate tabs", async () => {
    mount(sheet(["quadratic-factoring", 2]));
    expect(screen.getByRole("tab", { name: "Section", selected: true })).toBeInTheDocument();
    expect(screen.queryByText("Question type")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Worksheet" }));
    expect(screen.getByText("Question type")).toBeInTheDocument();
    expect(screen.queryByText("Topic Options")).toBeNull();
    expect(screen.queryByText("Paper")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Print" }));
    expect(screen.getByText("Paper")).toBeInTheDocument();
    expect(screen.queryByText("Question type")).toBeNull();
  });

  it("switches the whole sheet to multiple choice with 2 to 5 choices", async () => {
    const latest = mount(sheet(["quadratic-factoring", 2]));
    await userEvent.click(screen.getByRole("tab", { name: "Worksheet" }));
    expect(screen.queryByText("Choices per problem")).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "Multiple choice" }));
    expect(latest.ws.responseFormat.mode).toBe("multiple-choice");
    const choices = within(screen.getByRole("radiogroup", { name: "Choices per problem" }));
    expect(choices.getAllByRole("radio").map((r) => r.textContent)).toEqual(["2", "3", "4", "5"]);
    await userEvent.click(choices.getByRole("radio", { name: "3" }));
    expect(latest.ws.responseFormat.choices).toBe(3);
  });

  it("picks the Answer Key format and describes it", async () => {
    const latest = mount(sheet(["quadratic-factoring", 2]));
    await userEvent.click(screen.getByRole("tab", { name: "Worksheet" }));
    await userEvent.selectOptions(screen.getByLabelText("Answer Key"), "odds");
    expect(latest.ws.answerKeyFormat).toBe("odds");
    expect(screen.getByText("Answers to odd-numbered Problems only.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Answer Key · Odd-numbered" })).toBeInTheDocument();
  });

  it("edits Print Settings with selects, a segmented control and switches", async () => {
    const latest = mount(sheet(["quadratic-factoring", 2]));
    await userEvent.click(screen.getByRole("tab", { name: "Print" }));
    await userEvent.selectOptions(screen.getByLabelText("Paper"), "a4");
    await userEvent.click(screen.getByRole("radio", { name: "Roomy" }));
    await userEvent.click(screen.getByRole("switch", { name: "Page numbers" }));
    expect(latest.ws.print).toMatchObject({ paper: "a4", spacing: "roomy", pageNumbers: false });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("regenerates every Section from the footer", async () => {
    const latest = mount(sheet(["quadratic-factoring", 2], ["quadratic-formula", 2]));
    const seeds = latest.ws.sections.map((s) => s.baseSeed);
    await userEvent.click(screen.getByRole("button", { name: /Regenerate all Sections/ }));
    latest.ws.sections.forEach((s, i) => expect(s.baseSeed).not.toBe(seeds[i]));
  });
});

describe("Editor: Versions", () => {
  async function worksheetTab(ws: Worksheet) {
    const latest = mount(ws);
    await userEvent.click(screen.getByRole("tab", { name: "Worksheet" }));
    return latest;
  }
  const withVersions = (count: number, mode: Worksheet["versions"]["mode"], mc = false): Worksheet => ({
    ...sheet(["quadratic-factoring", 2]),
    versions: { count, mode },
    responseFormat: { mode: mc ? "multiple-choice" : "free-response", choices: 4 },
  });

  it("steps the Version count between 1 and 10", async () => {
    const latest = await worksheetTab(withVersions(1, "scramble-order"));
    expect(screen.getByRole("button", { name: "Decrease Versions" })).toBeDisabled();
    // A single Version needs no Scramble Mode.
    expect(screen.queryByLabelText("Versions differ by")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Increase Versions" }));
    expect(latest.ws.versions).toEqual({ count: 2, mode: "scramble-order" });
    expect(screen.getByLabelText("Versions differ by")).toBeInTheDocument();
  });

  it("stops at 10 Versions", async () => {
    await worksheetTab(withVersions(10, "scramble-order"));
    expect(screen.getByRole("button", { name: "Increase Versions" })).toBeDisabled();
  });

  it("picks the Scramble Mode", async () => {
    const latest = await worksheetTab(withVersions(3, "scramble-order"));
    await userEvent.selectOptions(screen.getByLabelText("Versions differ by"), "new-questions");
    expect(latest.ws.versions).toEqual({ count: 3, mode: "new-questions" });
  });

  it("explains that shuffled choices leave free-response Versions identical", async () => {
    await worksheetTab(withVersions(3, "scramble-choices"));
    expect(screen.getByRole("note").textContent).toMatch(/every Version will print the same/);
  });

  it("gives no such warning in multiple choice", async () => {
    await worksheetTab(withVersions(3, "scramble-choices", true));
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("previews one Version at a time with an A, B, C switcher", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mount(withVersions(3, "scramble-order"));
      const switcher = within(screen.getByRole("radiogroup", { name: "Previewed Version" }));
      expect(switcher.getAllByRole("radio").map((r) => r.textContent)).toEqual(["A", "B", "C"]);
      await userEvent.click(switcher.getByRole("radio", { name: "Version B" }));
      await act(() => vi.advanceTimersByTimeAsync(100));
      expect(JSON.stringify(renderPreview.mock.calls.at(-1)?.[0])).toMatch(/Version B/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows no Version switcher for a single Version", () => {
    mount(withVersions(1, "scramble-order"));
    expect(screen.queryByRole("radiogroup", { name: "Previewed Version" })).toBeNull();
  });
});

describe("Editor: Preview toolbar", () => {
  it("switches between the Student copy and the Answer Key", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mount(sheet(["quadratic-factoring", 2]));
      await act(() => vi.advanceTimersByTimeAsync(100));
      const lastSource = () => JSON.stringify(renderPreview.mock.calls.at(-1)?.[0]);
      expect(lastSource()).not.toMatch(/Answer Key/i);
      await userEvent.click(screen.getByRole("radio", { name: "Answer Key · Full" }));
      await act(() => vi.advanceTimersByTimeAsync(100));
      expect(lastSource()).toMatch(/Answer Key/i);
      expect(screen.queryByRole("checkbox")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("disables the Answer Key view when the Worksheet prints none", async () => {
    const ws = { ...sheet(["quadratic-factoring", 2]), answerKeyFormat: "none" as const };
    mount(ws);
    expect(screen.getByRole("radio", { name: "Answer Key · None" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Student copy" })).toHaveAttribute("aria-checked", "true");
  });

  it("zooms in steps and resets to 100%", async () => {
    mount(sheet(["quadratic-factoring", 2]));
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: /Zoom 125%/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Zoom 125%/ }));
    expect(screen.getByRole("button", { name: /Zoom 100%/ })).toBeInTheDocument();
  });
});
