import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

  it("renders a toolbar per problem and routes each action to the right index", () => {
    const curation = {
      onReroll: vi.fn(),
      onMove: vi.fn(),
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

    within(items[1]).getByLabelText("Move up").click();
    expect(curation.onMove).toHaveBeenCalledWith(1, -1);

    within(items[1]).getByLabelText("Move down").click();
    expect(curation.onMove).toHaveBeenCalledWith(1, 1);
  });

  it("disables Move up on the first problem and Move down on the last", () => {
    const curation = { onReroll: vi.fn(), onMove: vi.fn(), onRemove: vi.fn() };
    render(
      <WorksheetView worksheet={sheet()} showAnswers={false} curation={curation} />,
    );
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByLabelText("Move up")).toBeDisabled();
    expect(within(items[0]).getByLabelText("Move down")).toBeEnabled();
    expect(within(items[2]).getByLabelText("Move down")).toBeDisabled();
    expect(within(items[2]).getByLabelText("Move up")).toBeEnabled();
  });
});
