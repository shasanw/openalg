// Form layout pieces shared by the Inspector tabs.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A labelled control. Stacked by default (label above, hint below); `inline`
 * puts the label and hint on the left and the control on the right.
 */
export function Field({
  label,
  htmlFor,
  hint,
  inline,
  children,
  className,
}: {
  label: ReactNode;
  /** Id of the control, so clicking the label focuses it. */
  htmlFor?: string;
  hint?: ReactNode;
  inline?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const Label = htmlFor ? "label" : "div";
  if (inline) {
    return (
      <div className={cn("flex items-center justify-between gap-3", className)}>
        <div className="min-w-0">
          <Label htmlFor={htmlFor} className="block font-medium">
            {label}
          </Label>
          {hint && <div className="text-muted-foreground text-[12px]">{hint}</div>}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="font-medium">
        {label}
      </Label>
      {children}
      {hint && <div className="text-muted-foreground text-[12px] leading-snug">{hint}</div>}
    </div>
  );
}

/** A small uppercase heading for a group of controls or a pane. */
export function GroupLabel({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <div className="text-subtle-foreground text-[11px] font-semibold tracking-[0.06em] uppercase">
        {children}
      </div>
      {right}
    </div>
  );
}

/** A multi-line text field whose focus shows on its own border. */
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "border-input bg-panel placeholder:text-subtle-foreground w-full resize-y rounded-md border px-2.5 py-2 leading-snug transition-colors",
        className,
      )}
      {...props}
    />
  );
}

/** A keyboard shortcut hint. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "border-border-strong text-muted-foreground rounded border px-1.5 font-sans text-[10.5px] leading-[1.6] font-medium",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
