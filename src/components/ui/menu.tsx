// A dropdown menu (Radix): keyboard navigable, closes on Escape or outside
// click, and returns focus to its trigger.

import type { ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/utils";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({
  children,
  align = "end",
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={6}
        className={cn(
          "bg-popover text-popover-foreground border-border-strong z-50 min-w-[200px] rounded-lg border p-1 shadow-[var(--shadow-pop)]",
          className,
        )}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  disabled,
  danger,
  hint,
}: {
  children: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  hint?: ReactNode;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "data-[highlighted]:bg-hover flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
        danger ? "text-destructive" : "[&_svg]:text-muted-foreground",
      )}
    >
      <span className="flex flex-1 items-center gap-2">{children}</span>
      {hint && <span className="text-subtle-foreground text-[11px]">{hint}</span>}
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="bg-border my-1 h-px" />;
}
