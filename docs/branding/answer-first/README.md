# OpenAlg Answer First

The detached corner represents the answer used to build the problem. The custom OpenAlg lettering is drawn directly as vector paths and requires no fonts.

## Choose a lockup

| Use | File | Minimum width |
| --- | --- | --- |
| App header, website, or wide layout | `horizontal.svg` | 144 px or 38 mm |
| Centered layout or cover | `stacked.svg` | 112 px or 30 mm |
| Very narrow layout | `symbol.svg` | 24 px or 6 mm |
| Browser tab | `web/favicon.svg` | 16 px |
| Text-only placement | `wordmark.svg` | 100 px or 26 mm |

Use the default artwork on white or light backgrounds, the `-dark` lockups on deep ink, `-black` for one-color printing, and `-white` for reverse printing. Use `symbol-small.svg` where a 16–23 px symbol is needed outside the browser tab. The minimums refer to the full SVG canvas.

Keep clear space around the visible artwork equal to at least one gap beside the detached corner. For the wordmark alone, use the width of the lowercase l stem. Keep the SVG proportions and preserve both gaps beside the corner.

## Palette

| Color | sRGB hex | Use |
| --- | --- | --- |
| Green | `#17784A` | Primary symbol on light surfaces |
| Deep ink | `#11291F` | Wordmark on light surfaces and app-icon background |
| Mint | `#B5F58A` | Symbol on deep ink |

## Web assets

The `web/` folder contains the SVG favicon, multi-size ICO, PNG favicon fallbacks, Apple Touch icon, app icons, and a full-bleed maskable icon. Keep the manifest and its PNGs in the same directory so the relative icon paths resolve. Set the manifest's start URL and scope to match the deployment path if OpenAlg is hosted under a subdirectory.
