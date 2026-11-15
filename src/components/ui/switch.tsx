// A labelled on/off switch, used instead of native checkboxes.

import { useId, type ReactNode } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onCheckedChange,
  label,
  hint,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <label htmlFor={id} className="min-w-0 cursor-pointer leading-snug">
        {label}
        {hint && <span className="text-muted-foreground block text-[12px]">{hint}</span>}
      </label>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className={cn(
          "relative mt-px h-[18px] w-8 shrink-0 cursor-pointer rounded-full transition-colors",
          checked ? "bg-primary" : "bg-input",
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "absolute top-[2px] block size-[14px] rounded-full bg-white shadow transition-[left]",
            checked ? "left-[16px]" : "left-[2px]",
          )}
        />
      </SwitchPrimitive.Root>
    </div>
  );
}
