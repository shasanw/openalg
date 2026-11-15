import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopicOptions } from "./TopicOptions";
import type { ParamSchema } from "@/engine/types";

const schema: ParamSchema = [
  { type: "int", key: "maxRoot", label: "Largest root magnitude", min: 1, max: 20, default: 9 },
  { type: "boolean", key: "allowEqualRoots", label: "Allow repeated roots", default: false },
  {
    type: "enum",
    key: "roots",
    label: "Roots",
    default: "rational",
    options: [
      { value: "rational", label: "Rational" },
      { value: "irrational", label: "Irrational (radicals)" },
    ],
  },
  {
    type: "enum",
    key: "find",
    label: "Properties to find",
    default: "all",
    options: [
      { value: "all", label: "Vertex, axis and intercepts" },
      { value: "intercepts", label: "Intercepts only" },
    ],
  },
];
const values = { maxRoot: 9, allowEqualRoots: false, roots: "rational", find: "all" };

function setup() {
  const onChange = vi.fn();
  render(<TopicOptions schema={schema} values={values} onChange={onChange} />);
  return onChange;
}

describe("TopicOptions", () => {
  it("renders a switch, a stepper with its limits, and choice controls", () => {
    setup();
    expect(screen.getByRole("switch", { name: "Allow repeated roots" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Largest root magnitude" })).toHaveValue(9);
    expect(screen.getByText("1 to 20")).toBeInTheDocument();
    // Short choices: a segmented control, with the aside dropped from the label.
    expect(screen.getByRole("radio", { name: "Irrational" })).toBeInTheDocument();
    // Long choices: a select.
    expect(screen.getByRole("combobox", { name: "Properties to find" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("emits merged values when a switch is toggled", async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole("switch", { name: "Allow repeated roots" }));
    expect(onChange).toHaveBeenCalledWith({ ...values, allowEqualRoots: true });
  });

  it("clamps a typed number to its max on commit", () => {
    const onChange = setup();
    const input = screen.getByRole("spinbutton", { name: "Largest root magnitude" });
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ ...values, maxRoot: 20 });
  });

  it("steps a number with its buttons", async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole("button", { name: "Increase Largest root magnitude" }));
    expect(onChange).toHaveBeenCalledWith({ ...values, maxRoot: 10 });
  });

  it("emits enum choices from both controls", async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Irrational" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...values, roots: "irrational" });
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Properties to find" }),
      "intercepts",
    );
    expect(onChange).toHaveBeenLastCalledWith({ ...values, find: "intercepts" });
  });

  it("says so when a Topic has no options", () => {
    render(<TopicOptions schema={[]} values={{}} onChange={() => {}} />);
    expect(screen.getByText("This Topic has no options.")).toBeInTheDocument();
  });
});
