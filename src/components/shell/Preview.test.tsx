// The draft stands in for the exact Preview only while the Typst compiler is
// still downloading, and the exact pages replace it with no blank in between.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { addSection, buildSection, emptyWorksheet, type Worksheet } from "@/engine/worksheet";
import type { RendererStatus } from "@/platform/types";
import { Pages, previewStage } from "./Preview";

let status: RendererStatus = { state: "ready" };
const listeners = new Set<(s: RendererStatus) => void>();
let pending: { resolve: (pages: string[]) => void }[] = [];

function setStatus(next: RendererStatus) {
  status = next;
  for (const l of listeners) l(next);
}

vi.mock("@/platform", () => ({
  platform: {
    onRendererStatus: (handler: (s: RendererStatus) => void) => {
      listeners.add(handler);
      handler(status);
      return () => listeners.delete(handler);
    },
    renderPreview: () => new Promise<string[]>((resolve) => pending.push({ resolve })),
  },
}));

beforeEach(() => {
  status = { state: "ready" };
  listeners.clear();
  pending = [];
});

const ws: Worksheet = addSection(
  emptyWorksheet({ title: "Quiz" }),
  buildSection({ generatorId: "quadratic-factoring", baseSeed: 3, count: 4 }),
);

const draftShown = () => document.querySelector("[data-preview-draft]") !== null;
const exactShown = () => document.querySelector("svg.typst-doc") !== null;

/** Deliver the latest compile, as the worker would. */
async function finishCompile() {
  await waitFor(() => expect(pending.length).toBeGreaterThan(0));
  await act(async () => pending.at(-1)!.resolve(['<svg class="typst-doc"></svg>']));
}

describe("previewStage", () => {
  const base = { hasPages: false, hasError: false, draftStarted: false } as const;
  it("shows the draft only while the compiler loads, until the exact pages arrive", () => {
    expect(previewStage({ ...base, renderer: "loading" })).toBe("draft");
    expect(previewStage({ ...base, renderer: "ready", draftStarted: true })).toBe("draft");
    expect(previewStage({ ...base, renderer: "loading", hasPages: true })).toBe("exact");
    expect(previewStage({ ...base, renderer: "ready", draftStarted: true, hasPages: true })).toBe("exact");
  });
  it("never shows the draft once the compiler is ready", () => {
    expect(previewStage({ ...base, renderer: "ready" })).toBe("rendering");
  });
  it("shows an error over everything", () => {
    expect(previewStage({ ...base, renderer: "loading", hasError: true, draftStarted: true })).toBe("error");
  });
});

describe("Pages", () => {
  it("shows the draft while the compiler downloads, then swaps straight to the exact pages", async () => {
    status = { state: "loading", loaded: 1_000_000, total: 9_000_000 };
    const seen: string[] = [];
    const record = () => seen.push(exactShown() ? "exact" : draftShown() ? "draft" : "none");
    render(<Pages worksheet={ws} showAnswers={false} />);
    record();
    expect(draftShown()).toBe(true);
    expect(screen.getByText(/Preparing the exact preview/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "11");

    act(() => setStatus({ state: "loading", loaded: 4_500_000, total: 9_000_000 }));
    record();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

    // Ready, but the first compile hasn't come back: keep the draft up.
    act(() => setStatus({ state: "ready" }));
    record();
    expect(draftShown()).toBe(true);

    await finishCompile();
    record();
    expect(exactShown()).toBe(true);
    expect(draftShown()).toBe(false);
    expect(seen).not.toContain("none");
    expect(screen.queryByText(/Preparing the exact preview/)).toBeNull();
  });

  it("never shows the draft when the compiler is already loaded", async () => {
    status = { state: "ready" };
    render(<Pages worksheet={ws} showAnswers={false} />);
    expect(draftShown()).toBe(false);
    expect(screen.getByText("Rendering the Preview…")).toBeInTheDocument();
    await finishCompile();
    expect(exactShown()).toBe(true);
  });

  it("keeps the draft in step with the Worksheet and the Answer Key view", async () => {
    status = { state: "loading", loaded: 0, total: 0 };
    const { rerender } = render(<Pages worksheet={ws} showAnswers={false} />);
    expect(document.querySelectorAll("[data-draft-sheet]")).toHaveLength(1);
    rerender(<Pages worksheet={{ ...ws, title: "Retitled" }} showAnswers />);
    expect(document.querySelectorAll("[data-draft-sheet]")).toHaveLength(2);
    expect(screen.getAllByText("Retitled").length).toBeGreaterThan(0);
  });
});
