import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LISTINGS, type Listing } from "@/engine/courses";
import { getGenerator } from "@/engine/registry";
import type { LibraryEntry } from "@/platform/types";
import { COURSE_KEY } from "@/lib/rememberedCourse";
import { stubMemoryStorage } from "@/test/memoryStorage";
import { HomeScreen } from "./HomeScreen";
import { recentTopics, rowTemplates, unitTemplates } from "./templates";

function listing(topicId: string, course: string, unit: string): Listing {
  const topic = getGenerator(topicId)!;
  return { key: `${course}/${topicId}`, course, unit, topic, options: { probe: course } };
}

/** An Algebra 1 with two Units (the real one has one so far), and the real Algebra 2. */
const ALGEBRA_1 = [
  listing("quadratic-factoring", "Algebra 1", "Factoring"),
  listing("quadratic-formula", "Algebra 1", "Quadratic Functions"),
  listing("completing-the-square", "Algebra 1", "Quadratic Functions"),
  listing("graphing-quadratics", "Algebra 1", "Quadratic Functions"),
];
const ALGEBRA_2 = LISTINGS.filter((l) => l.course === "Algebra 2");
const BOTH = [...ALGEBRA_1, ...ALGEBRA_2];

function recent(generatorId: string, updatedAt: number): LibraryEntry {
  return { id: `${generatorId}-${updatedAt}`, title: "Sheet", generatorId, count: 10, updatedAt };
}

function home(props: { listings?: readonly Listing[]; recents?: LibraryEntry[] } = {}) {
  const onOpenTemplate = vi.fn();
  render(
    <HomeScreen
      onNewWorksheet={() => {}}
      onOpenTemplate={onOpenTemplate}
      onOpen={() => {}}
      recents={props.recents ?? []}
      onOpenRecent={() => {}}
      onDeleteRecent={() => {}}
      theme="light"
      onThemeChange={() => {}}
      onBackupLibrary={() => {}}
      onRestoreLibrary={() => {}}
      storage="persistent"
      install={{ installed: false, canInstall: false, install: async () => {}, showAppleHint: false }}
      listings={props.listings ?? BOTH}
    />,
  );
  return { onOpenTemplate };
}

const tabs = () => screen.queryByRole("radiogroup", { name: "Course" });
const tiles = () => within(document.getElementById("start-new-tiles")!).getAllByRole("button");
/** Each tile's title, without its subtitle. */
const titles = () => tiles().map((t) => t.querySelector(".line-clamp-2")!.textContent);

beforeEach(() => {
  stubMemoryStorage();
  // Wide enough for six tiles a row (jsdom lays nothing out).
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("home screen templates", () => {
  it("hides the Course tabs while only one Course has Topics", () => {
    home({ listings: ALGEBRA_2 });
    expect(tabs()).toBeNull();
    expect(titles()).toEqual(["New Worksheet", ...ALGEBRA_2.slice(0, 5).map((l) => l.topic.title)]);
  });

  it("shows Course tabs in curriculum order that filter the row, and remembers the choice", async () => {
    home();
    const group = tabs()!;
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Algebra 1", "Algebra 2"]);
    expect(within(group).getByRole("radio", { name: "Algebra 1" })).toBeChecked();
    expect(titles()).toEqual(["New Worksheet", ...ALGEBRA_1.map((l) => l.topic.title)]);

    await userEvent.click(within(group).getByRole("radio", { name: "Algebra 2" }));
    expect(titles()).toEqual(["New Worksheet", ...ALGEBRA_2.slice(0, 5).map((l) => l.topic.title)]);
    expect(localStorage.getItem(COURSE_KEY)).toBe("Algebra 2");

    cleanup();
    home();
    expect(within(tabs()!).getByRole("radio", { name: "Algebra 2" })).toBeChecked();
  });

  it("opens on the Course the Add Section picker last used", () => {
    localStorage.setItem(COURSE_KEY, "Algebra 2");
    home();
    expect(within(tabs()!).getByRole("radio", { name: "Algebra 2" })).toBeChecked();
  });

  it("subtitles tiles with their Unit and opens the listing", async () => {
    const { onOpenTemplate } = home();
    const tile = tiles().find((t) => t.textContent?.startsWith("Solving quadratics by factoring"))!;
    expect(tile).toHaveTextContent(/factoringFactoring$/);
    await userEvent.click(tile);
    expect(onOpenTemplate).toHaveBeenCalledWith(ALGEBRA_1[0]);
    expect((onOpenTemplate.mock.lastCall![0] as Listing).options).toEqual({ probe: "Algebra 1" });
  });

  it("puts the Topics used most recently in the selected Course first", async () => {
    const recents = [
      recent("quadratic-formula", 100),
      recent("parabola-properties", 300), // not listed in this Algebra 1
      recent("graphing-quadratics", 200),
      recent("quadratic-formula", 50),
    ];
    home({ recents });
    expect(titles()).toEqual([
      "New Worksheet",
      "Graphing quadratics",
      "Solving quadratics by the quadratic formula",
      "Solving quadratics by factoring",
      "Solving quadratics by completing the square",
    ]);
    await userEvent.click(within(tabs()!).getByRole("radio", { name: "Algebra 2" }));
    expect(titles().slice(1, 4)).toEqual([
      "Properties of parabolas (vertex, axis, intercepts)",
      "Graphing quadratics",
      "Solving quadratics by the quadratic formula",
    ]);
  });

  it("expands to the selected Course's Units under headings, blank Worksheet first", async () => {
    // Three tiles a row, so not every Topic fits.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    home();
    expect(titles()).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: /All Topics \(4\)/ }));
    const band = document.getElementById("start-new-tiles")!;
    expect(within(band).getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "Factoring",
      "Quadratic Functions",
    ]);
    expect(titles()[0]).toBe("New Worksheet");
    const unit = (name: string) =>
      within(screen.getByRole("region", { name })).getAllByRole("button").map((b) => b.title);
    expect(unit("Factoring")).toEqual(["Solving quadratics by factoring"]);
    expect(unit("Quadratic Functions")).toEqual(ALGEBRA_1.slice(1).map((l) => l.topic.title));

    await userEvent.click(within(tabs()!).getByRole("radio", { name: "Algebra 2" }));
    expect(within(band).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Quadratics"]);
    expect(unit("Quadratics")).toHaveLength(ALGEBRA_2.length);
    expect(screen.getByRole("button", { name: /Fewer Topics/ })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("templates", () => {
  it("lists recently used Topics newest first, once each", () => {
    expect(recentTopics([recent("a", 1), recent("b", 3), recent("a", 2), recent("", 9)])).toEqual(["b", "a"]);
  });

  it("fills the row from recent Topics in the Course, then outline order", () => {
    const row = rowTemplates(BOTH, "Algebra 1", ["graphing-quadratics", "nope"], 3);
    expect(row.map((l) => l.topic.id)).toEqual(["graphing-quadratics", "quadratic-factoring", "quadratic-formula"]);
    expect(row.every((l) => l.course === "Algebra 1")).toBe(true);
    expect(rowTemplates(BOTH, "Algebra 1", [], 0)).toEqual([]);
  });

  it("groups a Course's listings by Unit in outline order", () => {
    expect(unitTemplates(BOTH, "Algebra 1").map((u) => [u.name, u.listings.length])).toEqual([
      ["Factoring", 1],
      ["Quadratic Functions", 3],
    ]);
  });
});
