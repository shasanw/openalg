import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inspector } from "./Inspector";
import { generator } from "@/engine/generators/quadraticFactoring";
import { resolveParams } from "@/engine/types";
import type { ResponseFormat } from "@/engine/worksheet";

function renderInspector(
  responseFormat: ResponseFormat | null,
  onResponseFormatChange = vi.fn(),
) {
  render(
    <Inspector
      generator={generator}
      params={resolveParams(generator.schema, {})}
      onParamsChange={() => {}}
      directions="Solve."
      onDirectionsChange={() => {}}
      responseFormat={responseFormat}
      onResponseFormatChange={onResponseFormatChange}
      count={10}
      onCountChange={() => {}}
      onGenerate={() => {}}
      onRegenerate={() => {}}
      canRegenerate
    />,
  );
  return onResponseFormatChange;
}

describe("Inspector answer format", () => {
  it("switches the whole sheet to multiple choice", async () => {
    const onChange = renderInspector({ mode: "free-response", choices: 4 });
    expect(screen.queryByText("Choices per problem")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Multiple choice" }));
    expect(onChange).toHaveBeenCalledWith({ mode: "multiple-choice", choices: 4 });
  });

  it("offers 2 to 5 choices in multiple-choice mode", async () => {
    const onChange = renderInspector({ mode: "multiple-choice", choices: 4 });
    expect(screen.getByText("Choices per problem")).toBeTruthy();
    for (const n of ["2", "3", "4", "5"]) {
      expect(screen.getByRole("button", { name: n })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "6" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    expect(onChange).toHaveBeenCalledWith({ mode: "multiple-choice", choices: 2 });
  });

  it("hides the control when no worksheet is open", () => {
    renderInspector(null);
    expect(screen.queryByText("Answer format")).toBeNull();
  });
});
