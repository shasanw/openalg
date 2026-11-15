import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { versionChoices } from "@/engine/versions";
import { choiceLetter } from "@/engine/mc";
import {
  addSection,
  buildSection,
  emptyWorksheet,
  type AnswerKeyFormat,
  type Worksheet,
} from "@/engine/worksheet";
import type { Problem } from "@/engine/types";
import { getGenerator } from "@/engine/registry";
import { GRAPHING_QUADRATICS_ID } from "@/engine/generators/graphingQuadratics";
import { QUADRATIC_INEQUALITIES_ID } from "@/engine/generators/quadraticInequalities";
import { DraftPages, hasUndrawableContent, sheetInches } from "./DraftPages";

function sheet(opts: Partial<Worksheet> = {}): Worksheet {
  const ws = [
    buildSection({ generatorId: "quadratic-factoring", baseSeed: 1, count: 3, directions: "Factor each." }),
    buildSection({ generatorId: "quadratic-formula", baseSeed: 2, count: 2, directions: "Use the formula." }),
  ].reduce((w, s) => addSection(w, s), emptyWorksheet({ title: "Unit 3 Quiz" }));
  return { ...ws, ...opts };
}

function draft(ws: Worksheet, showAnswers = false, version = 0) {
  const { container } = render(
    <DraftPages worksheet={ws} showAnswers={showAnswers} version={version} width={760} fit />,
  );
  const sheets = [...container.querySelectorAll<HTMLElement>("[data-draft-sheet]")];
  return { container, sheets };
}

/** The numbers printed on a sheet's numbered cells, in order. */
const numbers = (el: HTMLElement) =>
  [...el.querySelectorAll("[data-draft-problem]")].map((c) => Number(c.getAttribute("data-draft-problem")));

describe("DraftPages", () => {
  it("draws the title, each Section's Directions and Problems numbered across Sections", () => {
    const ws = sheet();
    const { sheets } = draft(ws);
    expect(sheets).toHaveLength(1);
    const page = sheets[0];
    expect(page).toHaveTextContent("Unit 3 Quiz");
    expect(page).toHaveTextContent("Name");
    const directions = [...page.querySelectorAll("section > p")].map((p) => p.textContent);
    expect(directions).toEqual(["Factor each.", "Use the formula."]);
    expect(numbers(page)).toEqual([1, 2, 3, 4, 5]);
    // Two columns, like the Typst grid.
    expect(page.querySelector(".grid-cols-2")).not.toBeNull();
    // Math goes through KaTeX.
    expect(page.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(5);
  });

  it("is marked as a draft on every sheet", () => {
    const { sheets } = draft(sheet({ answerKeyFormat: "full" }), true);
    expect(sheets).toHaveLength(2);
    for (const s of sheets) expect(s).toHaveTextContent(/Draft/);
  });

  it("shows lettered choices for multiple choice, in the Version's own order", () => {
    const ws = sheet({ responseFormat: { mode: "multiple-choice", choices: 3 } });
    const { sheets } = draft(ws);
    const first = sheets[0].querySelector('[data-draft-problem="1"]')!;
    expect(first).toHaveTextContent("(A)");
    expect(first).toHaveTextContent("(B)");
    expect(first).toHaveTextContent("(C)");
    expect(first).not.toHaveTextContent("(D)");
    const p = ws.sections[0].problems[0];
    const { choices } = versionChoices(p, 3, 0);
    expect(first.querySelectorAll(".katex")).toHaveLength(1 + choices.length);
  });

  it("hides the Answer Key on the Student copy", () => {
    const { sheets } = draft(sheet(), false);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).not.toHaveTextContent("Answer Key");
  });

  it.each<[AnswerKeyFormat, number[]]>([
    ["full", [1, 2, 3, 4, 5]],
    ["odds", [1, 3, 5]],
  ])("adds a %s Answer Key sheet after the copy in the key view", (format, expected) => {
    const { sheets } = draft(sheet({ answerKeyFormat: format }), true);
    expect(sheets).toHaveLength(2);
    expect(sheets[1]).toHaveTextContent("Answer Key");
    expect(numbers(sheets[1])).toEqual(expected);
    if (format === "odds") expect(sheets[1]).toHaveTextContent("(odd-numbered problems)");
  });

  it("prints each Answer under its Problem on the in-context key", () => {
    const { sheets } = draft(sheet({ answerKeyFormat: "in-context" }), true);
    expect(sheets).toHaveLength(2);
    expect(sheets[1]).toHaveTextContent("Answer Key");
    expect(sheets[1].textContent!.match(/Answer:/g)).toHaveLength(5);
    expect(sheets[0]).not.toHaveTextContent("Answer:");
  });

  it("gives the correct letter on a multiple-choice key", () => {
    const ws = sheet({ answerKeyFormat: "full", responseFormat: { mode: "multiple-choice", choices: 4 } });
    const { sheets } = draft(ws, true);
    const p = ws.sections[0].problems[0];
    const letter = choiceLetter(versionChoices(p, 4, 0).correctIndex);
    expect(sheets[1].querySelector('[data-draft-problem="1"]')).toHaveTextContent(`(${letter})`);
  });

  it("labels the Version it shows", () => {
    const ws = sheet({ versions: { count: 2, mode: "scramble-order" } });
    const { sheets } = draft(ws, false, 1);
    expect(sheets[0]).toHaveTextContent("Version B");
  });

  it("puts a neutral placeholder where a Problem has content it can't draw", () => {
    const ws = sheet();
    const graphing = getGenerator(GRAPHING_QUADRATICS_ID)!.generate({}, 1);
    const inequality = getGenerator(QUADRATIC_INEQUALITIES_ID)!.generate({}, 1);
    const graphed = { ...ws.sections[0].problems[0], graph: graphing.graph } as Problem;
    expect(hasUndrawableContent(graphed)).toBe(true);
    expect(hasUndrawableContent(ws.sections[0].problems[1])).toBe(false);
    // A number line only in the key: nothing extra on the student copy.
    expect(inequality.graph).toBeUndefined();
    expect(inequality.answerGraph).toBeDefined();
    expect(hasUndrawableContent(inequality)).toBe(false);
    expect(hasUndrawableContent(inequality, true)).toBe(true);
    const withGraph: Worksheet = {
      ...ws,
      sections: [{ ...ws.sections[0], problems: [graphed, ...ws.sections[0].problems.slice(1)] }, ws.sections[1]],
    };
    const { container } = draft(withGraph);
    expect(container.querySelectorAll("[data-draft-placeholder]")).toHaveLength(1);
    expect(screen.getByText("Shown in the exact preview")).toBeInTheDocument();
  });

  it("shapes the sheet like the paper", () => {
    expect(sheetInches({ ...sheet().print, paper: "us-letter" })).toEqual([8.5, 11]);
    expect(sheetInches({ ...sheet().print, paper: "legal", orientation: "landscape" })).toEqual([14, 8.5]);
  });
});
