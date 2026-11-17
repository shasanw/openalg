import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LISTINGS, type Listing } from "@/engine/courses";
import { GENERATORS, getGenerator } from "@/engine/registry";
import type { Generator } from "@/engine/types";
import { COURSE_KEY } from "@/lib/rememberedCourse";
import { stubBrokenStorage, stubMemoryStorage } from "@/test/memoryStorage";
import { TopicPicker } from "./TopicPicker";

beforeEach(stubMemoryStorage);
afterEach(() => vi.unstubAllGlobals());
import { topicSample } from "./topicBrowser";

function listing(topic: Generator, course: string, unit: string): Listing {
  return { key: `${course}/${topic.id}`, course, unit, topic, options: {} };
}

/** One Course (Algebra 2), whose Quadratics Unit lists every Topic in registration order. */
const ALGEBRA_2 = LISTINGS.filter((l) => l.course === "Algebra 2");

/** A fake Precalculus Topic, so the Course tabs have a second Course. */
const limits = listing({ ...GENERATORS[0], id: "evaluating-limits", title: "Evaluating limits" }, "Precalculus", "Limits");

/** The id of the Topic in the listing onPick was last called with. */
const pickedId = (onPick: ReturnType<typeof vi.fn>) => (onPick.mock.lastCall?.[0] as Listing | undefined)?.topic.id;

function open(props: { sections?: string[]; listings?: readonly Listing[] } = {}) {
  const onPick = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <TopicPicker
      open
      onOpenChange={onOpenChange}
      onPick={onPick}
      sections={props.sections ?? []}
      listings={props.listings ?? ALGEBRA_2}
    />,
  );
  return { onPick, onOpenChange };
}

const search = () => screen.getByRole("combobox", { name: "Search Topics" });
const topics = () => within(screen.getByRole("listbox", { name: "Topics" })).getAllByRole("option");
const units = () => within(screen.getByRole("listbox", { name: "Units" })).getAllByRole("option");
const active = () => document.getElementById(search().getAttribute("aria-activedescendant")!);
const preview = () => within(screen.getByRole("region", { name: /^Preview of / }));
const courseSelect = () => screen.getByRole("combobox", { name: "Course" });
/** The Topic groups' names: "Unit", or "Course Unit" during a search. */
const groups = () =>
  within(screen.getByRole("listbox", { name: "Topics" }))
    .getAllByRole("group")
    .map((g) =>
      g
        .getAttribute("aria-labelledby")!
        .split(" ")
        .map((id) => document.getElementById(id)!.textContent)
        .join(" "),
    );

describe("TopicPicker", () => {
  it("opens with focus in the search and lists the Units with Topics", () => {
    open();
    expect(screen.getByRole("dialog", { name: "Add Section" })).toBeInTheDocument();
    expect(search()).toHaveFocus();
    expect(units().map((u) => u.textContent)).toEqual([`All Units${ALGEBRA_2.length}`, `Quadratics${ALGEBRA_2.length}`]);
    expect(screen.getByText(`${ALGEBRA_2.length} Topics`)).toBeInTheDocument();
  });

  it("hides the Course dropdown while only one Course has Topics", () => {
    open();
    expect(screen.queryByRole("combobox", { name: "Course" })).toBeNull();
  });

  it("switches the Units and Topics with the Course dropdown", async () => {
    open({ listings: [...ALGEBRA_2, limits] });
    const course = courseSelect();
    expect(within(course).getAllByRole("option").map((o) => o.textContent)).toEqual(["Algebra 2", "Precalculus"]);
    expect(course).toHaveDisplayValue("Algebra 2");
    expect(topics().map((o) => o.textContent)).not.toContain("Evaluating limits");
    await userEvent.selectOptions(course, "Precalculus");
    expect(topics().map((o) => o.textContent)).toEqual(["Evaluating limits"]);
    expect(units().map((u) => u.textContent)).toEqual(["All Units1", "Limits1"]);
  });

  describe("Courses", () => {
    /** Every real listing plus a fake Precalculus Course. */
    const ALL = [...LISTINGS, limits];

    it("opens on the Course of the last Section", () => {
      open({ listings: ALL, sections: ["quadratic-factoring", "evaluating-limits"] });
      expect(courseSelect()).toHaveDisplayValue("Precalculus");
    });

    it("opens a Topic listed in several Courses on the remembered one if it lists it", () => {
      localStorage.setItem(COURSE_KEY, "Algebra 2");
      open({ listings: ALL, sections: ["quadratic-factoring"] });
      expect(courseSelect()).toHaveDisplayValue("Algebra 2");
    });

    it("else opens it on the Topic's first listing", () => {
      localStorage.setItem(COURSE_KEY, "Precalculus");
      open({ listings: ALL, sections: ["quadratic-factoring"] });
      expect(courseSelect()).toHaveDisplayValue("Algebra 1");
    });

    it("opens an empty Worksheet on the remembered Course, else the first", () => {
      localStorage.setItem(COURSE_KEY, "Precalculus");
      open({ listings: ALL });
      expect(courseSelect()).toHaveDisplayValue("Precalculus");
      cleanup();
      localStorage.setItem(COURSE_KEY, "Geometry");
      open({ listings: ALL });
      expect(courseSelect()).toHaveDisplayValue("Algebra 1");
    });

    it("still opens when storage is unavailable", () => {
      stubBrokenStorage();
      const { onPick } = open({ listings: ALL, sections: [] });
      expect(courseSelect()).toHaveDisplayValue("Algebra 1");
      fireEvent.keyDown(search(), { key: "Enter" });
      expect(onPick).toHaveBeenCalled();
    });

    it("remembers the Course a Topic is added from", async () => {
      const { onPick } = open({ listings: ALL });
      await userEvent.selectOptions(courseSelect(), "Algebra 2");
      await userEvent.click(search());
      await userEvent.keyboard("{Enter}");
      expect((onPick.mock.lastCall?.[0] as Listing).course).toBe("Algebra 2");
      expect(localStorage.getItem(COURSE_KEY)).toBe("Algebra 2");
    });

    it("searches every Course, the chosen Course first, and reads All Courses meanwhile", async () => {
      open({ listings: ALL });
      await userEvent.selectOptions(courseSelect(), "Algebra 2");
      await userEvent.click(search());
      await userEvent.keyboard("factoring");
      expect(courseSelect()).toHaveDisplayValue("All Courses");
      expect(groups()).toEqual(["Algebra 2 Quadratics", "Algebra 1 Quadratic Functions"]);
      await userEvent.keyboard("{Backspace>9/}");
      expect(courseSelect()).toHaveDisplayValue("Algebra 2");
      expect(groups()).toEqual(["Quadratics"]);
      expect(within(courseSelect()).queryByRole("option", { name: "All Courses" })).toBeNull();
    });

    it("finds a Topic outside the chosen Course", async () => {
      open({ listings: ALL });
      await userEvent.keyboard("limts");
      expect(topics().map((o) => o.textContent)).toEqual(["Evaluating limits"]);
    });

    it("narrows a search to Course words", async () => {
      open({ listings: ALL });
      await userEvent.keyboard("alg 2 factr");
      expect(groups()).toEqual(["Algebra 2 Quadratics"]);
    });

    it("badges both rows of a Topic listed in two Courses and adds the chosen row's listing", async () => {
      const { onPick } = open({ listings: ALL, sections: ["quadratic-factoring"] });
      await userEvent.keyboard("factoring");
      const rows = topics();
      expect(rows).toHaveLength(2);
      for (const r of rows) expect(r).toHaveTextContent("Used in Section A");
      await userEvent.keyboard("{ArrowDown}{Enter}");
      const picked = onPick.mock.lastCall?.[0] as Listing;
      expect(picked).toBe(LISTINGS.find((l) => l.key === "Algebra 2/quadratic-factoring"));
      expect(picked.options).toEqual(LISTINGS.find((l) => l.key === picked.key)!.options);
      expect(localStorage.getItem(COURSE_KEY)).toBe("Algebra 2");
    });

    it("lists each Course's matching Units during a search, and restores the Course's Unit after", async () => {
      const listings = [
        ...ALL,
        listing({ ...GENERATORS[1], id: "qform-eq", title: "Solving quadratic-form equations" }, "Algebra 2", "Polynomials"),
      ];
      open({ listings, sections: ["qform-eq"] });
      expect(courseSelect()).toHaveDisplayValue("Algebra 2");
      await userEvent.click(units()[2]);
      expect(units()[2]).toHaveTextContent("Polynomials");
      expect(units()[2]).toHaveAttribute("aria-selected", "true");

      await userEvent.click(search());
      await userEvent.keyboard("solving");
      // A search starts on All Units, across every Course.
      expect(units()[0]).toHaveAttribute("aria-selected", "true");
      const unitNames = units().map((u) => u.getAttribute("aria-label") ?? u.textContent);
      expect(unitNames[0]).toMatch(/^All Units/);
      expect(unitNames.slice(1).map((n) => n!.split(",")[0])).toEqual(["Algebra 2", "Algebra 2", "Algebra 1"]);
      expect(screen.getByRole("listbox", { name: "Units" })).toHaveTextContent(/Algebra 1Quadratic Functions/);
      // Choosing an Algebra 1 Unit narrows the results to it.
      await userEvent.click(units()[3]);
      expect(topics().length).toBeGreaterThan(0);
      expect(groups()).toEqual(["Algebra 1 Quadratic Functions"]);

      await userEvent.clear(search());
      expect(courseSelect()).toHaveDisplayValue("Algebra 2");
      expect(units().find((u) => u.getAttribute("aria-selected") === "true")).toHaveTextContent("Polynomials");
    });

    it("clears the search when a Course is chosen mid-search", async () => {
      open({ listings: ALL });
      await userEvent.keyboard("limits");
      await userEvent.selectOptions(courseSelect(), "Algebra 2");
      expect(search()).toHaveValue("");
      expect(courseSelect()).toHaveDisplayValue("Algebra 2");
    });

    it("tabs from the search to the Course dropdown, then the Units", async () => {
      open({ listings: ALL });
      expect(search()).toHaveFocus();
      await userEvent.tab();
      expect(courseSelect()).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole("listbox", { name: "Units" })).toHaveFocus();
      await userEvent.keyboard("{ArrowDown}{Enter}");
      expect(search()).toHaveFocus();
      await userEvent.keyboard("{Escape}");
    });
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
    expect(pickedId(onPick)).toBe(GENERATORS[2].id);
  });

  it("adds with the button", async () => {
    const { onPick } = open({ sections: ["quadratic-factoring"] });
    await userEvent.click(screen.getByRole("button", { name: "Add as Section B" }));
    expect(pickedId(onPick)).toBe(GENERATORS[0].id);
  });

  describe("keyboard only", () => {
    const twoUnits = () => [
      ...ALGEBRA_2,
      listing({ ...getGenerator("quadratic-formula")!, id: "qform-eq", title: "Solving quadratic-form equations" }, "Algebra 2", "Polynomials"),
    ];

    it("searches, moves and adds with Enter", async () => {
      const { onPick } = open();
      await userEvent.keyboard("square{ArrowDown}{ArrowUp}{Enter}");
      expect(pickedId(onPick)).toBe("completing-the-square");
    });

    it("reaches the Units with Tab, filters, and comes back to the search", async () => {
      const { onPick } = open({ listings: twoUnits() });
      expect(units().map((u) => u.textContent)).toEqual([
        `All Units${ALGEBRA_2.length + 1}`,
        `Quadratics${ALGEBRA_2.length}`,
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
      expect(pickedId(onPick)).toBe("qform-eq");
    });

    it("typing in the Units list goes to the search", async () => {
      open({ listings: twoUnits() });
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
