import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopicTree } from "./TopicTree";
import { groupByChapter } from "@/engine/registry";

/** Matches a chapter header button exactly, so it doesn't also match topics
 *  whose titles happen to contain the chapter name. */
function chapterHeader(name: string) {
  return screen.getByRole("button", { name: new RegExp(`^${name}$`, "i") });
}

describe("TopicTree", () => {
  it("renders every registered chapter and topic", () => {
    render(<TopicTree selectedId="" onSelect={() => {}} />);
    for (const chapter of groupByChapter()) {
      expect(chapterHeader(chapter.name)).toBeInTheDocument();
      for (const g of chapter.generators) {
        expect(
          screen.getByRole("button", { name: g.title }),
        ).toBeInTheDocument();
      }
    }
  });

  it("marks the selected topic as current", () => {
    const first = groupByChapter()[0].generators[0];
    render(<TopicTree selectedId={first.id} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: first.title })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("calls onSelect with the topic id when a topic is clicked", async () => {
    const onSelect = vi.fn();
    const first = groupByChapter()[0].generators[0];
    render(<TopicTree selectedId="" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: first.title }));
    expect(onSelect).toHaveBeenCalledWith(first.id);
  });

  it("collapses and expands a chapter", async () => {
    const chapter = groupByChapter()[0];
    const topic = chapter.generators[0];
    render(<TopicTree selectedId="" onSelect={() => {}} />);
    const header = chapterHeader(chapter.name);
    expect(header).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: topic.title }),
    ).not.toBeInTheDocument();
  });
});
