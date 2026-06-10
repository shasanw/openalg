import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { WorksheetView } from "./WorksheetView";
import { buildWorksheet } from "@/engine/worksheet";
import { QUADRATIC_FACTORING_ID } from "@/engine/generators/quadraticFactoring";

const sheet = () =>
  buildWorksheet({
    generatorId: QUADRATIC_FACTORING_ID,
    baseSeed: 7,
    count: 3,
  });

describe("WorksheetView curation controls", () => {
  it("shows no per-problem controls when curation is absent (print preview)", () => {
    render(<WorksheetView worksheet={sheet()} showAnswers={false} />);
    expect(screen.queryByLabelText("Re-roll problem")).not.toBeInTheDocument();
  });

  it("routes re-roll and remove to the right index", () => {
    const curation = {
      onReroll: vi.fn(),
      onReorder: vi.fn(),
      onRemove: vi.fn(),
    };
    render(
      <WorksheetView worksheet={sheet()} showAnswers={false} curation={curation} />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);

    within(items[1]).getByLabelText("Re-roll problem").click();
    expect(curation.onReroll).toHaveBeenCalledWith(1);

    within(items[1]).getByLabelText("Remove problem").click();
    expect(curation.onRemove).toHaveBeenCalledWith(1);
  });

  it("reorders via drag-and-drop, reporting (from, to) on drop", () => {
    const curation = { onReroll: vi.fn(), onReorder: vi.fn(), onRemove: vi.fn() };
    render(
      <WorksheetView worksheet={sheet()} showAnswers={false} curation={curation} />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items.every((li) => li.getAttribute("draggable") === "true")).toBe(
      true,
    );

    fireEvent.dragStart(items[0]);
    fireEvent.dragEnter(items[2]);
    fireEvent.dragOver(items[2]);
    fireEvent.drop(items[2]);
    expect(curation.onReorder).toHaveBeenCalledWith(0, 2);
  });

  it("does not fire onReorder when dropped on its own slot", () => {
    const curation = { onReroll: vi.fn(), onReorder: vi.fn(), onRemove: vi.fn() };
    render(
      <WorksheetView worksheet={sheet()} showAnswers={false} curation={curation} />,
    );
    const items = screen.getAllByRole("listitem");
    fireEvent.dragStart(items[1]);
    fireEvent.drop(items[1]);
    expect(curation.onReorder).not.toHaveBeenCalled();
  });
});
