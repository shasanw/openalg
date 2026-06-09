// The left pane: a tree of topics grouped by chapter. Driven entirely by the
// generator registry — registering a generator adds it here with no UI change.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { groupByChapter } from "@/engine/registry";
import { cn } from "@/lib/utils";

export function TopicTree({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const chapters = groupByChapter();
  return (
    <nav aria-label="Topics" className="space-y-3">
      {chapters.map((chapter) => (
        <ChapterGroup
          key={chapter.name}
          name={chapter.name}
          topics={chapter.generators.map((g) => ({ id: g.id, title: g.title }))}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}

function ChapterGroup({
  name,
  topics,
  selectedId,
  onSelect,
}: {
  name: string;
  topics: { id: string; title: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 px-1 text-xs font-semibold tracking-wide uppercase"
      >
        <Chevron className="size-3.5" />
        {name}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5">
          {topics.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                aria-current={t.id === selectedId}
                onClick={() => onSelect(t.id)}
                className={cn(
                  "w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                  t.id === selectedId
                    ? "bg-primary/10 text-primary font-semibold"
                    : "hover:bg-accent",
                )}
              >
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
