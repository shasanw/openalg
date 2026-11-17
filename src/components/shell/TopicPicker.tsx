// The Add Section picker (#31): a three-pane browser. Units of the chosen
// Course on the left, matching Topics grouped by Unit in the middle, and a
// preview of the highlighted Topic (sample Problems, Topic Options, default
// Directions) on the right. Course tabs show only when more than one Course
// has Topics.
//
// It works with the keyboard alone. Focus starts in the search box, a
// combobox that owns the Topic list: type to search, up/down to move, Enter to
// add, Escape to close. Tab moves into the Units list (up/down picks a Unit;
// Enter, right arrow or typing goes back to the search), then Cancel and Add.

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { Search, X } from "lucide-react";
import { coursesOf, LISTINGS, type Listing } from "@/engine/courses";
import { sectionLetter } from "@/engine/worksheet";
import { Math as TeX } from "@/components/Math";
import { Button } from "@/components/ui/button";
import { GroupLabel, Kbd } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { browseTopics, sectionsByTopic, topicSample, usedLabel } from "./topicBrowser";

export function TopicPicker({
  open,
  onOpenChange,
  onPick,
  sections,
  listings = LISTINGS,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen listing; the Section starts from its Topic Options. */
  onPick: (listing: Listing) => void;
  /** The generatorId of each Section on the Worksheet, in outline order. */
  sections: readonly string[];
  /** The listings to offer (every Course Outline; tests pass their own). */
  listings?: readonly Listing[];
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Search first, even though the Course tabs come earlier.
            e.preventDefault();
            searchRef.current?.focus();
          }}
          className="bg-popover text-popover-foreground border-border-strong data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] fixed top-1/2 left-1/2 z-50 flex h-[min(560px,calc(100vh-32px))] w-[min(960px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border shadow-[var(--shadow-pop)] outline-none"
        >
          <PickerBody
            onPick={onPick}
            sections={sections}
            listings={listings}
            searchRef={searchRef}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PickerBody({
  onPick,
  sections,
  listings,
  searchRef,
}: {
  onPick: (listing: Listing) => void;
  sections: readonly string[];
  listings: readonly Listing[];
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const courses = useMemo(() => coursesOf(listings), [listings]);
  const [course, setCourse] = useState(courses[0] ?? "");
  const [query, setQuery] = useState("");
  const [unit, setUnit] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const listId = useId();
  const unitsId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const unitsRef = useRef<HTMLDivElement>(null);

  const view = useMemo(
    () => browseTopics({ listings, course, unit, query }),
    [listings, course, unit, query],
  );
  const used = useMemo(() => sectionsByTopic(sections), [sections]);
  const { flat } = view;
  // The highlight follows a Topic, not a row number, so changing the Unit
  // keeps it when the Topic is still listed; otherwise the first Topic.
  const found = flat.findIndex((l) => l.key === activeId);
  const active = found >= 0 ? found : 0;
  const activeTopic = flat[active];
  const nextLetter = sectionLetter(sections.length);
  const optionId = (i: number) => `${listId}-option-${i}`;

  // Unit choices for the Units list: All Units, then each Unit with matches.
  const unitChoices: { name: string | null; label: string; count: number }[] = [
    { name: null, label: "All Units", count: view.total },
    ...view.units.map((u) => ({ name: u.name, label: u.name, count: u.count })),
  ];
  const unitIndex = unitChoices.findIndex((c) => c.name === view.unit);
  const unitOptionId = (i: number) => `${unitsId}-unit-${i}`;

  // Keep the highlighted Topic and the chosen Unit in view.
  useLayoutEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active, flat]);
  useLayoutEffect(() => {
    unitsRef.current
      ?.querySelector<HTMLElement>(`[data-unit-index="${unitIndex}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [unitIndex]);

  function pick(l: Listing | undefined) {
    if (l) onPick(l);
  }

  function chooseUnit(name: string | null) {
    setUnit(name);
  }

  function chooseCourse(next: string) {
    setCourse(next);
    setUnit(null);
    setActiveId(null);
    // A click hands the keyboard back to the search; arrow keys on the tabs
    // move focus to the next tab right after this, so they keep working.
    searchRef.current?.focus();
  }

  function onSearchKeyDown(e: React.KeyboardEvent) {
    const last = flat.length - 1;
    const go = (i: number) => {
      e.preventDefault();
      if (flat[i]) setActiveId(flat[i].key);
    };
    if (e.key === "ArrowDown") go(active >= last ? 0 : active + 1);
    else if (e.key === "ArrowUp") go(active <= 0 ? last : active - 1);
    else if (e.key === "Home" && flat.length > 0) go(0);
    else if (e.key === "End" && flat.length > 0) go(last);
    else if (e.key === "Enter") {
      e.preventDefault();
      pick(activeTopic);
    }
  }

  function onUnitsKeyDown(e: React.KeyboardEvent) {
    const last = unitChoices.length - 1;
    const go = (i: number) => {
      e.preventDefault();
      chooseUnit(unitChoices[i].name);
    };
    if (e.key === "ArrowDown") go(Math.min(last, unitIndex + 1));
    else if (e.key === "ArrowUp") go(Math.max(0, unitIndex - 1));
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(last);
    else if (e.key === "Enter" || e.key === "ArrowRight") {
      e.preventDefault();
      searchRef.current?.focus();
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Typing always searches: hand the keystroke to the search box.
      searchRef.current?.focus();
    }
  }

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b pr-2.5 pl-4">
        <Dialog.Title className="text-[14px] font-semibold">Add Section</Dialog.Title>
        {courses.length > 1 && (
          <Segmented
            size="sm"
            label="Course"
            value={course}
            options={courses.map((c) => ({ value: c, label: c }))}
            onChange={chooseCourse}
          />
        )}
        <Dialog.Close asChild>
          <Button variant="quiet" size="icon-sm" className="ml-auto" aria-label="Close">
            <X />
          </Button>
        </Dialog.Close>
      </header>

      <div className="shrink-0 border-b p-3">
        <div className="border-input bg-panel focus-within:border-ring flex h-9 items-center gap-2.5 rounded-md border px-3 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_24%,transparent)]">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <input
            ref={searchRef}
            data-bare
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label="Search Topics"
            aria-activedescendant={activeTopic ? optionId(active) : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setActiveId(null);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Search Topics and Units…"
            className="placeholder:text-subtle-foreground min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
          />
          <span className="text-muted-foreground shrink-0 text-[12px] tabular-nums" aria-live="polite">
            {view.total} Topic{view.total === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[156px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] min-[880px]:grid-cols-[176px_minmax(0,1fr)_minmax(260px,300px)] min-[880px]:grid-rows-1">
        {/* Units */}
        <div className="bg-panel-2 flex min-h-0 flex-col border-r">
          <GroupLabel className="px-4 pt-3 pb-1.5">
            <span id={`${unitsId}-label`}>Units</span>
          </GroupLabel>
          <div
            ref={unitsRef}
            role="listbox"
            tabIndex={0}
            aria-labelledby={`${unitsId}-label`}
            aria-activedescendant={unitOptionId(unitIndex)}
            onKeyDown={onUnitsKeyDown}
            className="min-h-0 flex-1 overflow-y-auto rounded-md px-2 pb-2 focus-visible:outline-offset-[-2px]"
          >
            {unitChoices.map((c, i) => {
              const on = i === unitIndex;
              return (
                <div
                  key={c.label}
                  id={unitOptionId(i)}
                  role="option"
                  aria-selected={on}
                  data-unit-index={i}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => chooseUnit(c.name)}
                  className={cn(
                    "mb-px flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2 py-1.5",
                    on
                      ? "border-selected-border bg-selected text-selected-foreground font-medium"
                      : "hover:bg-hover border-transparent",
                  )}
                >
                  <span className="truncate">{c.label}</span>
                  <span
                    className={cn(
                      "shrink-0 text-[12px] tabular-nums",
                      on ? "text-selected-muted" : "text-muted-foreground",
                    )}
                  >
                    {c.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Topics, grouped by Unit */}
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Topics"
          className="min-h-0 overflow-y-auto p-2"
        >
          {flat.length === 0 && (
            <div className="text-muted-foreground px-2 py-8 text-center">
              No Topics match “{query}”.
            </div>
          )}
          {view.groups.map((group) => (
            <div key={group.name} role="group" aria-labelledby={`${listId}-${group.name}`} className="mb-2">
              <GroupLabel className="px-2 pt-1.5 pb-1">
                <span id={`${listId}-${group.name}`}>{group.name}</span>
              </GroupLabel>
              {group.listings.map((l) => {
                const index = flat.indexOf(l);
                const on = index === active;
                const letters = used.get(l.topic.id);
                return (
                  <div
                    key={l.key}
                    id={optionId(index)}
                    role="option"
                    aria-selected={on}
                    data-index={index}
                    // Keep focus in the search box so the keyboard keeps working.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveId(l.key)}
                    onDoubleClick={() => pick(l)}
                    className={cn(
                      "mb-px cursor-pointer rounded-md border px-2.5 py-1.5",
                      on
                        ? "border-selected-border bg-selected text-selected-foreground"
                        : "hover:bg-hover border-transparent",
                    )}
                  >
                    <div className="truncate font-medium">{l.topic.title}</div>
                    {letters && (
                      <div
                        className={cn(
                          "truncate text-[12px]",
                          on ? "text-selected-muted" : "text-muted-foreground",
                        )}
                      >
                        {usedLabel(letters)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Preview of the highlighted Topic */}
        <TopicPreview listing={activeTopic} />
      </div>

      <footer className="flex h-14 shrink-0 items-center gap-4 border-t px-4">
        <div className="text-subtle-foreground hidden items-center gap-4 text-[12px] min-[640px]:flex">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span className="ml-0.5">move</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> add
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd> close
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Dialog.Close asChild>
            <Button variant="secondary">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" disabled={!activeTopic} onClick={() => pick(activeTopic)}>
            Add as Section {nextLetter}
          </Button>
        </div>
      </footer>
    </>
  );
}

function TopicPreview({ listing }: { listing: Listing | undefined }) {
  const topic = listing?.topic;
  // Cached per Topic and Topic Options, so moving the highlight never regenerates Problems.
  const sample = listing ? topicSample(listing.topic, listing.options) : undefined;
  // Fade the bottom edge while more of the preview is below it: with macOS's
  // hidden scrollbars, a cut-off line otherwise looks like a layout bug.
  const pane = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = pane.current;
    if (el) setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);
  useLayoutEffect(() => {
    measure();
    const el = pane.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, topic]);
  return (
    <section
      ref={pane}
      onScroll={measure}
      data-more-below={more || undefined}
      aria-label={topic ? `Preview of ${topic.title}` : "Topic preview"}
      className="data-[more-below]:[mask-image:linear-gradient(to_bottom,black_calc(100%-40px),transparent)] col-span-2 max-h-[176px] min-h-0 overflow-y-auto border-t p-4 min-[880px]:col-span-1 min-[880px]:max-h-none min-[880px]:border-t-0 min-[880px]:border-l"
    >
      {!sample ? (
        <p className="text-muted-foreground">Pick a Topic to see sample Problems.</p>
      ) : (
        <div className="grid gap-x-6 gap-y-4 max-[879px]:grid-cols-2">
          <div>
            <GroupLabel className="mb-2">Sample Problems</GroupLabel>
            {/* One paper card: the sample Problems, then the graph printed
                with each Problem (if any) as a small thumbnail under them, so
                the equations keep the card's full width. */}
            <div className="rounded-md bg-white px-3 py-2.5 text-[#16181d] shadow-[var(--shadow-page)]">
              <ol className="font-paper space-y-1.5 text-[15px] whitespace-nowrap">
                {sample.problems.map((tex, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0">{i + 1})</span>
                    <TeX tex={tex} />
                  </li>
                ))}
              </ol>
              {sample.graph && (
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sample.graph)}`}
                  alt="The graph printed with each Problem"
                  className="mt-2 w-[96px]"
                />
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <GroupLabel className="mb-1.5">Topic Options you can set</GroupLabel>
              {sample.options.length === 0 ? (
                <p className="text-muted-foreground">None</p>
              ) : (
                <ul className="space-y-1 leading-snug">
                  {sample.options.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <GroupLabel className="mb-1.5">Directions</GroupLabel>
              <p className="text-muted-foreground leading-snug">{sample.directions}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
