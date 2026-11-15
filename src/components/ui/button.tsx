// The three button styles of the visual system (#30):
// - primary: the one main action on screen (Print), filled with the accent;
// - secondary: a bordered button for ordinary actions (Export PDF, Add Section);
// - quiet: no chrome until hovered, for low-emphasis actions (Open, menus).
// `danger` tints a quiet button's text for destructive actions.

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[15px]",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary:
          "border border-border-strong bg-panel text-foreground hover:bg-hover",
        quiet: "text-muted-foreground hover:bg-hover hover:text-foreground",
      },
      danger: {
        true: "text-destructive hover:text-destructive",
        false: "",
      },
      size: {
        md: "h-8 px-3 text-[13px]",
        sm: "h-7 px-2.5 text-[12px]",
        icon: "size-8",
        "icon-sm": "size-7",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
      danger: false,
    },
  },
);

function Button({
  className,
  variant,
  size,
  danger,
  asChild = false,
  type = "button",
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, danger, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
