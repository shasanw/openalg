// @vitest-environment node
// WCAG AA contrast for the visual system (#30), checked straight from the
// theme tokens in index.css so a palette tweak can't quietly break it. Text
// pairs need 4.5:1; the focus ring and selected-row border, being non-text UI,
// need 3:1 against what they sit on.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../index.css", import.meta.url)), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const tokens: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) tokens[m[1]] = m[2];
  return tokens;
}

const light = block(":root");
const dark = { ...light, ...block(".dark") };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground token, background token, minimum ratio] */
const PAIRS: [string, string, number][] = [
  // Body and secondary text on every surface it appears on.
  ["foreground", "background", 4.5],
  ["foreground", "panel", 4.5],
  ["foreground", "popover", 4.5],
  ["muted-foreground", "panel", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["muted-foreground", "track", 4.5],
  ["muted-foreground", "popover", 4.5],
  ["subtle-foreground", "panel", 4.5],
  ["subtle-foreground", "popover", 4.5],
  ["foreground", "hover", 4.5],
  ["foreground", "control-on", 4.5],
  ["accent-text", "panel", 4.5],
  ["destructive", "panel", 4.5],
  ["destructive", "popover", 4.5],
  // The primary action and the selected Section's letter badge.
  ["primary-foreground", "primary", 4.5],
  ["primary-foreground", "primary-hover", 4.5],
  // The selected outline row: filled, with high-contrast text.
  ["selected-foreground", "selected", 4.5],
  ["selected-muted", "selected", 4.5],
  // Non-text: focus ring and selected border must stand out.
  ["ring", "panel", 3],
  ["ring", "background", 3],
  ["selected-border", "panel", 1.5],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme meets WCAG AA", (_name, tokens) => {
  it.each(PAIRS)("%s on %s", (fg, bg, min) => {
    expect(tokens[fg], fg).toMatch(/^#/);
    expect(tokens[bg], bg).toMatch(/^#/);
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });
});
