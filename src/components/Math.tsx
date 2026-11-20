import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { proseSegments } from "@/engine/format";

const render = (tex: string, display: boolean) =>
  katex.renderToString(tex, { displayMode: display, throwOnError: false });

/**
 * Renders a LaTeX string with KaTeX. `display` for block (centered) math. A
 * word problem's prose (see `prose` in engine/format) is set as ordinary text
 * that wraps between words, as it prints, with the math around it in KaTeX.
 */
export function Math({
  tex,
  display = false,
  className,
}: {
  tex: string;
  display?: boolean;
  className?: string;
}) {
  const html = useMemo(() => {
    const segments = proseSegments(tex);
    if (segments.length === 1 && segments[0].kind === "math") return render(tex, display);
    return segments
      .map((s) =>
        s.kind === "prose"
          ? `<span style="white-space:normal">${escapeHtml(s.text)}</span>`
          : s.latex.trim() === ""
            ? s.latex
            : `${/^\s/.test(s.latex) ? " " : ""}${render(s.latex.trim(), false)}${/\s$/.test(s.latex) ? " " : ""}`,
      )
      .join("");
  }, [tex, display]);
  return (
    <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
