// Splits the renderer's single multi-page SVG into one self-contained SVG per
// page. typst.ts 0.7.0 renders a whole document as one <svg> with the pages
// stacked vertically (`<g class="typst-page" transform="translate(0, y)">`)
// after shared <style> and glyph <defs>. Each page here gets its own root
// element sized to that page, the shared style, and only the glyph defs it
// uses, so the Preview can swap pages one at a time and Print can lay them out
// one per sheet.

const PAGE_OPEN = '<g class="typst-page"';

/** Attribute value from a single start tag, or undefined. */
function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

function setAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`(\\s${name}=")[^"]*(")`);
  return re.test(tag) ? tag.replace(re, `$1${value}$2`) : tag;
}

/**
 * Keep only the `<path id="…"/>` glyph definitions a page references. Falls
 * back to every definition when the defs hold anything but self-closing paths
 * (e.g. bitmap glyphs), since those can't be split safely with a regex.
 */
function filterGlyphDefs(defs: string, used: Set<string>): string {
  const open = /^<defs\b[^>]*>/.exec(defs)?.[0];
  if (!open || !defs.endsWith("</defs>")) return defs;
  const inner = defs.slice(open.length, -"</defs>".length);
  const items = inner.match(/<path\b[^>]*\/>/g) ?? [];
  if (items.join("") !== inner) return defs;
  const kept = items.filter((p) => {
    const id = attr(p, "id");
    return id === undefined || used.has(id);
  });
  return open + kept.join("") + "</defs>";
}

/** One SVG string per page, in page order. */
export function splitSvgPages(svg: string): string[] {
  const rootEnd = svg.indexOf(">");
  const firstPage = svg.indexOf(PAGE_OPEN);
  const close = svg.lastIndexOf("</svg>");
  if (rootEnd < 0 || firstPage < 0 || close < 0) return [svg];

  const root = svg.slice(0, rootEnd + 1);
  let head = svg.slice(rootEnd + 1, firstPage);
  // A trailing <script> (the renderer's interaction helpers) sits after the
  // last page; it never runs from innerHTML and isn't needed for display.
  let bodyEnd = close;
  const script = svg.lastIndexOf("<script", close);
  if (script > firstPage) bodyEnd = script;

  // The renderer's stylesheet has a bare `svg { fill: none }` rule. Inlined in
  // the app's DOM that would apply to every <svg> on the page (icons, logo),
  // so scope it to Typst's own documents.
  head = head.replace(/(^|[\s,}>])svg\s*\{/g, "$1svg.typst-doc {");

  const glyphDefs = /<defs class="glyph">[\s\S]*?<\/defs>/.exec(head)?.[0];

  const starts: number[] = [];
  for (let i = firstPage; i >= 0 && i < bodyEnd; i = svg.indexOf(PAGE_OPEN, i + 1)) {
    starts.push(i);
  }

  return starts.map((start, n) => {
    const end = n + 1 < starts.length ? starts[n + 1] : bodyEnd;
    let page = svg.slice(start, end);
    const pageTag = page.slice(0, page.indexOf(">") + 1);
    const w = attr(pageTag, "data-page-width") ?? attr(root, "width") ?? "0";
    const h = attr(pageTag, "data-page-height") ?? attr(root, "height") ?? "0";
    page = setAttr(pageTag, "transform", "translate(0, 0)") + page.slice(pageTag.length);

    let pageRoot = root;
    pageRoot = setAttr(pageRoot, "viewBox", `0 0 ${w} ${h}`);
    pageRoot = setAttr(pageRoot, "width", w);
    pageRoot = setAttr(pageRoot, "height", h);
    pageRoot = setAttr(pageRoot, "data-width", w);
    pageRoot = setAttr(pageRoot, "data-height", h);

    let pageHead = head;
    if (glyphDefs) {
      const used = new Set(
        [...page.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]),
      );
      const filtered = filterGlyphDefs(glyphDefs, used);
      pageHead = head.replace(glyphDefs, () => filtered);
    }
    return pageRoot + pageHead + page + "</svg>";
  });
}
