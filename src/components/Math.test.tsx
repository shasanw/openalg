import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Math } from "./Math";

describe("Math", () => {
  it("renders KaTeX markup for a LaTeX string", () => {
    const { container } = render(<Math tex="x^2 - 5x + 6 = 0" />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("does not throw on invalid LaTeX (throwOnError: false)", () => {
    expect(() => render(<Math tex="\\frac{" />)).not.toThrow();
  });
});
