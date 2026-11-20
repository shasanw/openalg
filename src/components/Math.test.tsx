import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Math } from "./Math";
import { prose } from "@/engine/format";

describe("Math", () => {
  it("renders KaTeX markup for a LaTeX string", () => {
    const { container } = render(<Math tex="x^2 - 5x + 6 = 0" />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("does not throw on invalid LaTeX (throwOnError: false)", () => {
    expect(() => render(<Math tex="\\frac{" />)).not.toThrow();
  });

  it("sets a word problem's prose as plain text that wraps, with its math in KaTeX", () => {
    const { container } = render(<Math tex={`${prose("Expand <this> & that")} (x + 2)^{3}`} />);
    const text = container.querySelector<HTMLElement>("span > span:not(.katex)")!;
    expect(text.textContent).toBe("Expand <this> & that");
    expect(text.style.whiteSpace).toBe("normal");
    expect(container.querySelectorAll(".katex")).toHaveLength(1);
  });
});
