import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GENERATORS, getGenerator } from "@/engine/registry";
import type { Generator } from "@/engine/types";
import { TopicPicker } from "./TopicPicker";
import { topicSample } from "./topicBrowser";

/** A fake Precalculus Topic, so the Course tabs have a second Course. */
const limits: Generator = {
  ...GENERATORS[0],
  id: "evaluating-limits",
  course: "Precalculus",
  unit: "Limits",
  title: "Evaluating limits",
};

function open(props: { sections?: string[]; topics?: readonly Generator[] } = {}) {
  const onPick = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <TopicPicker
      open
      onOpenChange={onOpenChange}
      onPick={onPick}
      sections={props.sections ?? []}
      topics={props.topics}
    />,
  );
  return { onPick, onOpenChange };
}

const search = () => screen.getByRole("combobox", { name: "Search Topics" });
const topics = () => within(screen.getByRole("listbox", { name: "Topics" })).getAllByRole("option");
const units = () => within(screen.getByRole("listbox", { name: "Units" })).getAllByRole("option");
const active = () => document.getElementById(search().getAttribute("aria-activedescendant")!);
const preview = () => within(screen.getByRole("region", { name: /^Preview of / }));

describe("TopicPicker", () => {
  it("opens with focus in the search and lists the Units with Topics", () => {
    open();
    expect(screen.getByRole("dialog", { name: "Add Section" })).toBeInTheDocument();
    expect(search()).toHaveFocus();
    expect(units().map((u) => u.textContent)).toEqual([`All Units${GENERATORS.length}`, `Quadratics${GENERATORS.length}`]);
    expect(screen.getByText(`${GENERATORS.length} Topics`)).toBeInTheDocument();
  });

  it("hides the Course tabs while only one Course has Topics", () => {
    open();
    expect(screen.queryByRole("radiogroup", { name: "Course" })).toBeNull();
  });

  it("shows Course tabs with two Courses and switches the Units and Topics", async () => {
    open({ topics: [...GENERATORS, limits] });
    const tabs = screen.getByRole("radiogroup", { name: "Course" });
    expect(within(tabs).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Algebra 2", "Precalculus"]);
    expect(topics().map((o) => o.textContent)).not.toContain("Evaluating limits");
    await userEvent.click(within(tabs).getByRole("radio", { name: "Precalculus" }));
    expect(topics().map((o) => o.textContent)).toEqual(["Evaluating limits"]);
    expect(units().map((u) => u.textContent)).toEqual(["All Units1", "Limits1"]);
    expect(search()).toHaveFocus();
    // Arrow keys on the tabs still switch Course, with focus staying on them.
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    expect(within(tabs).getByRole("radio", { name: "Precalculus" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(within(tabs).getByRole("radio", { name: "Algebra 2" })).toHaveFocus();
    expect(topics().map((o) => o.textContent)).not.toContain("Evaluating limits");
  });

  it("badges Topics already on the Worksheet with their Section letters", () => {
    open({ sections: ["quadratic-factoring", "quadratic-formula", "quadratic-formula"] });
    const row = (title: RegExp) => topics().find((o) => title.test(o.textContent ?? ""))!;
    expect(row(/factoring/)).toHaveTextContent("Used in Section A");
    expect(row(/quadratic formula/)).toHaveTextContent("Used in Sections B and C");
    expect(row(/completing the square/)).not.toHaveTextContent("Used in");
  });

  it("names the next Section letter on the Add button", () => {
    open({ sections: ["quadratic-factoring", "quadratic-formula", "parabola-properties"] });
    expect(screen.getByRole("button", { name: "Add as Section D" })).toBeEnabled();
  });

  it("starts at Section A on an empty Worksheet and disables Add with no matches", async () => {
    open();
    const add = screen.getByRole("button", { name: "Add as Section A" });
    await userEvent.type(search(), "zzz");
    expect(add).toBeDisabled();
    expect(screen.getByText(/No Topics match/)).toBeInTheDocument();
    expect(screen.getByText("0 Topics")).toBeInTheDocument();
  });

  it("previews the highlighted Topic and follows the arrow keys", async () => {
    open();
    const first = GENERATORS[0];
    expect(preview().getByText(first.defaultDirections)).toBeInTheDocument();
    for (const f of first.schema) expect(preview().getByText(f.label)).toBeInTheDocument();
    // Two KaTeX-rendered sample Problems.
    expect(preview().getAllByRole("listitem").filter((li) => li.querySelector(".katex"))).toHaveLength(2);
    expect(preview().getAllByRole("listitem")[0]).toHaveTextContent(topicSample(first).problems[0].split(" ")[0]);

    await userEvent.keyboard("{ArrowDown}");
    const second = GENERATORS[1];
    expect(active()).toHaveTextContent(second.title);
    expect(screen.getByRole("region", { name: `Preview of ${second.title}` })).toBeInTheDocument();
    expect(preview().getByText(second.defaultDirections)).toBeInTheDocument();
  });

  it("clicking a Topic highlights it, keeps focus in the search, and double-click adds", async () => {
    const { onPick } = open();
    const target = topics()[2];
    await userEvent.click(target);
    expect(target).toHaveAttribute("aria-selected", "true");
    expect(search()).toHaveFocus();
    expect(onPick).not.toHaveBeenCalled();
    await userEvent.dblClick(target);
    expect(onPick).toHaveBeenCalledWith(GENERATORS[2].id);
  });

  it("adds with the button", async () => {
    const { onPick } = open({ sections: ["quadratic-factoring"] });
    await userEvent.click(screen.getByRole("button", { name: "Add as Section B" }));
    expect(onPick).toHaveBeenCalledWith(GENERATORS[0].id);
  });

  describe("keyboard only", () => {
    const twoUnits = () => [
      ...GENERATORS,
      { ...getGenerator("quadratic-formula")!, id: "qform-eq", unit: "Polynomials", title: "Solving quadratic-form equations" },
    ];

    it("searches, moves and adds with Enter", async () => {
      const { onPick } = open();
      await userEvent.keyboard("square{ArrowDown}{ArrowUp}{Enter}");
      expect(onPick).toHaveBeenCalledWith("completing-the-square");
    });

    it("reaches the Units with Tab, filters, and comes back to the search", async () => {
      const { onPick } = open({ topics: twoUnits() });
      expect(units().map((u) => u.textContent)).toEqual([
        `All Units${GENERATORS.length + 1}`,
        `Quadratics${GENERATORS.length}`,
        "Polynomials1",
      ]);
      await userEvent.tab();
      const unitList = screen.getByRole("listbox", { name: "Units" });
      expect(unitList).toHaveFocus();
      await userEvent.keyboard("{End}");
      expect(units()[2]).toHaveAttribute("aria-selected", "true");
      expect(topics().map((o) => o.textContent)).toEqual(["Solving quadratic-form equations"]);
      await userEvent.keyboard("{Enter}");
      expect(search()).toHaveFocus();
      await userEvent.keyboard("{Enter}");
      expect(onPick).toHaveBeenCalledWith("qform-eq");
    });

    it("typing in the Units list goes to the search", async () => {
      open({ topics: twoUnits() });
      await userEvent.tab();
      await userEvent.keyboard("{ArrowDown}");
      expect(units()[1]).toHaveAttribute("aria-selected", "true");
      await userEvent.keyboard("f");
      expect(search()).toHaveFocus();
    });

    it("closes with Escape", async () => {
      const { onOpenChange } = open();
      await userEvent.keyboard("{Escape}");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
