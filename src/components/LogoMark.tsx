// The OpenAlg mark: a downward parabola with a point on its axis of symmetry,
// which together read as the "A" of OpenAlg. Same geometry as the app icons
// and favicon in public/, drawn here on the theme's primary colour.

import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="16 16 224 224"
      aria-hidden="true"
      className={cn("text-primary size-7 shrink-0", className)}
    >
      <rect x="16" y="16" width="224" height="224" rx="56" fill="currentColor" />
      <path
        d="M66 177Q128 -27 190 177"
        fill="none"
        stroke="#fff"
        strokeWidth="34"
        strokeLinecap="round"
      />
      <circle cx="128" cy="135" r="17" fill="#fff" />
    </svg>
  );
}
