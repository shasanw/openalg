// The Add Section picker: a centered command palette listing every Topic,
// grouped by Unit and filtered as the teacher types. It works with the
// keyboard alone: type to search, arrow keys to move, Enter to add, Escape to
// close. The search box is a combobox that owns the list, so focus never
// leaves it while moving through Topics.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { Search } from "lucide-react";
import { GENERATORS, groupByChapter } from "@/engine/registry";
import type { Generator } from "@/engine/types";
import { Kbd } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Topics matching every word of the query, by Topic title or Unit name. */
export function filterTopics(query: string, topics: readonly Generator[] = GENERATORS) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = topics.filter((g) => {
    const haystack = `${g.title} ${g.chapter}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
  return groupByChapter(matches);
}

export function TopicPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (generatorId: string) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="bg-popover text-popover-foreground border-border-strong data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] fixed top-[18vh] left-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border shadow-[var(--shadow-pop)] outline-none"
        >
          <Dialog.Title className="sr-only">Add a Section</Dialog.Title>
          <PickerBody onPick={onPick} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PickerBody({ onPick }: { onPick: (generatorId: string) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const units = useMemo(() => filterTopics(query), [query]);
  const flat = units.flatMap((u) => u.generators);
  const optionId = (i: number) => `${listId}-option-${i}`;

  // Keep the highlighted Topic in view as the arrow keys move it.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    const last = flat.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a >= last ? 0 : a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? last : a - 1));
    } else if (e.key === "Home" && flat.length > 0) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && flat.length > 0) {
      e.preventDefault();
      setActive(last);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[active]) onPick(flat[active].id);
    }
  }

  return (
    <>
      <div className="focus-within:border-ring flex items-center gap-2.5 border-b px-3.5">
        <Search className="text-muted-foreground size-4 shrink-0" />
        <input
          data-bare
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search Topics"
          aria-activedescendant={flat[active] ? optionId(active) : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search Topics…"
          className="placeholder:text-subtle-foreground h-12 min-w-0 flex-1 bg-transparent text-[14px] outline-none"
        />
        <Kbd>esc</Kbd>
      </div>

      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Topics"
        className="max-h-[min(360px,50vh)] overflow-y-auto p-1.5"
      >
        {units.length === 0 && (
          <div className="text-muted-foreground px-2 py-8 text-center">
            No Topics match “{query}”.
          </div>
        )}
        {units.map((unit) => (
          <div key={unit.name} role="group" aria-labelledby={`${listId}-${unit.name}`} className="mb-1">
            <div
              id={`${listId}-${unit.name}`}
              className="text-subtle-foreground px-2 pt-2 pb-1 text-[11px] font-semibold tracking-[0.06em] uppercase"
            >
              {unit.name}
            </div>
            {unit.generators.map((g) => {
              const index = flat.indexOf(g);
              const on = index === active;
              const n = g.schema.length;
              return (
                <div
                  key={g.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={on}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => onPick(g.id)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2",
                    on && "bg-selected text-selected-foreground",
                  )}
                >
                  <span className="truncate font-medium">{g.title}</span>
                  <span
                    className={cn(
                      "shrink-0 text-[11.5px]",
                      on ? "text-selected-muted" : "text-subtle-foreground",
                    )}
                  >
                    {n === 0 ? "No options" : `${n} option${n === 1 ? "" : "s"}`}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="text-subtle-foreground flex items-center gap-4 border-t px-3.5 py-2 text-[11.5px]">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> to move
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> to add the Section
        </span>
      </div>
    </>
  );
}
