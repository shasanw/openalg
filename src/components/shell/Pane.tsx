// A workspace column: a fixed header bar with a title (and optional actions),
// over a scrollable body. The three panes of the workspace are all Panes, so
// they share spacing, typography, and scroll behavior.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Pane({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex min-h-0 flex-col", className)}>
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {title}
        </h2>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto p-3", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
