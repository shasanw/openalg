import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OptionsPanel } from "./OptionsPanel";
import type { ParamSchema } from "@/engine/types";

const schema: ParamSchema = [
  {
    type: "int",
    key: "maxRoot",
    label: "Largest root magnitude",
    min: 1,
    max: 20,
    default: 9,
  },
  {
    type: "boolean",
    key: "allowEqualRoots",
    label: "Allow repeated roots",
    default: false,
  },
];

describe("OptionsPanel", () => {
  it("renders a control for each schema field", () => {
    render(
      <OptionsPanel
        schema={schema}
        values={{ maxRoot: 9, allowEqualRoots: false }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Largest root magnitude")).toBeInTheDocument();
    expect(screen.getByLabelText("Allow repeated roots")).toBeInTheDocument();
  });

  it("emits merged values when a boolean is toggled", () => {
    const onChange = vi.fn();
    render(
      <OptionsPanel
        schema={schema}
        values={{ maxRoot: 9, allowEqualRoots: false }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Allow repeated roots"));
    expect(onChange).toHaveBeenCalledWith({
      maxRoot: 9,
      allowEqualRoots: true,
    });
  });

  it("clamps an int field to its max", () => {
    const onChange = vi.fn();
    render(
      <OptionsPanel
        schema={schema}
        values={{ maxRoot: 9, allowEqualRoots: false }}
        onChange={onChange}
      />,
    );
    const input = screen.getByDisplayValue("9");
    fireEvent.change(input, { target: { value: "999" } });
    expect(onChange).toHaveBeenCalledWith({
      maxRoot: 20,
      allowEqualRoots: false,
    });
  });
});
