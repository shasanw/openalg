import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProblemList } from "./ProblemList";
import { buildWorksheet } from "@/engine/worksheet";
import { QUADRATIC_FACTORING_ID } from "@/engine/generators/quadraticFactoring";

function sheet() {
  return buildWorksheet({
    generatorId: QUADRATIC_FACTORING_ID,
    baseSeed: 1,
    count: 4,
  });
}

function handlers() {
  return { onReroll: vi.fn(), onRemove: vi.fn(), onReorder: vi.fn() };
}

describe("ProblemList", () => {
  it("renders a row per problem", () => {
    render(<ProblemList worksheet={sheet()} curation={handlers()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("re-rolls and removes the right index", () => {
    const c = handlers();
    render(<ProblemList worksheet={sheet()} curation={c} />);
    fireEvent.click(screen.getAllByLabelText("Re-roll problem")[2]);
    fireEvent.click(screen.getAllByLabelText("Remove problem")[0]);
    expect(c.onReroll).toHaveBeenCalledWith(2);
    expect(c.onRemove).toHaveBeenCalledWith(0);
  });

  it("reorders on drop, passing source and target indices", () => {
    const c = handlers();
    render(<ProblemList worksheet={sheet()} curation={c} />);
    const rows = screen.getAllByRole("listitem");
    fireEvent.dragStart(rows[0]);
    fireEvent.dragEnter(rows[3]);
    fireEvent.drop(rows[3]);
    expect(c.onReorder).toHaveBeenCalledWith(0, 3);
  });

  it("does not reorder when dropped on itself", () => {
    const c = handlers();
    render(<ProblemList worksheet={sheet()} curation={c} />);
    const rows = screen.getAllByRole("listitem");
    fireEvent.dragStart(rows[1]);
    fireEvent.drop(rows[1]);
    expect(c.onReorder).not.toHaveBeenCalled();
  });
});
