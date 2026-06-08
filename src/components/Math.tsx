import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/** Renders a LaTeX string with KaTeX. `display` for block (centered) math. */
export function Math({
  tex,
  display = false,
  className,
}: {
  tex: string;
  display?: boolean;
  className?: string;
}) {
  const html = useMemo(
    () =>
      katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
      }),
    [tex, display],
  );
  return (
    <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
