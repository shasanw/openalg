// The left pane: the topic navigator. In Worksheet mode this is the chapter-
// grouped topic tree (one topic per worksheet). Test mode will swap in a section
// outline here (staged follow-up).

import { TopicTree } from "@/components/shell/TopicTree";

export function Navigator({
  generatorId,
  onSelect,
}: {
  generatorId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="bg-sidebar flex min-h-0 flex-col overflow-hidden rounded-xl border shadow-sm">
      <div className="text-muted-foreground flex h-9 shrink-0 items-center border-b px-3.5 text-[11px] font-bold tracking-wide uppercase">
        Topics
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <TopicTree selectedId={generatorId} onSelect={onSelect} />
      </div>
    </aside>
  );
}
