# UI conventions — the OpenAlg shell

This document is the agreed UI direction. Mockups that established it live in
`mockups/` (open `mockups/index.html`). The chosen shell is the **converged**
mockup (`mockups/converged.html`); the launch screen is `mockups/home.html`.

## The decision, in one paragraph

OpenAlg opens to a **Word-style home screen** (templates + recent documents).
Opening or creating a document drops the user into a **canvas-and-inspector
workspace**: a left navigator, a center **canvas that shows the worksheet as a
real, full-size letter page**, and a right **contextual inspector**. A document
is either a single-topic **Worksheet** or a multi-section **Test**; a top-bar
mode toggle (and a default in Settings) switches between the simple classic
experience and the multi-section one.

Visual language: **Soft Modern** — off-white surfaces, rounded cards, a calm
sage accent, the *Onest* UI sans paired with the *Fraunces* display serif for
worksheet/document titles. (Mockups A/B in `mockups/` are alternative palettes,
kept only for reference; Soft Modern is the chosen theme.)

---

## 1. Home screen (launch)

Shown when no document is open (`mockups/home.html`).

- **Top bar:** brand, a worksheet search, Settings.
- **Start new (top section):** a row of cards — **Blank worksheet** (one
  topic), **Blank test** (multiple sections), then **templates** (each a
  mini-page thumbnail: "Factoring Quadratics", "Quadratics Unit Test", …).
  "Browse all templates →" leads to the full gallery.
- **Recent (below):** the user's saved documents (most-recent first), as a
  list (default) or grid. Each row: page thumbnail, name, a type pill
  (Worksheet / Test), question count / versions, and last-modified time. Empty
  state when there are no documents yet.
- Recents come from the local filesystem via the `Platform` layer — no
  database, no accounts (consistent with the offline/local-files premise).

---

## 2. Document workspace (the converged shell)

`mockups/converged.html`. A **top bar** over three regions: **navigator │
canvas │ inspector**.

```
┌ OpenAlg │ «Title» │ [Worksheet|Test] ……  Open Save ⚙  Export PDF ┐
├──────────────┬───────────────────────────┬─────────────────────────┤
│  NAVIGATOR   │   CANVAS                   │   INSPECTOR             │
│              │   (zoomable surface)       │   (contextual)          │
│  Worksheet:  │   ┌──────────────────┐     │   selection decides     │
│   topic tree │   │  full LETTER page│     │   what shows here:      │
│  Test:       │   │  header          │     │   • nothing → document  │
│   sections   │   │  Part A …        │     │   • problem → re-roll / │
│   outline +  │   │  Part B …        │     │     remove / edit       │
│   Add section│   │  (white space)   │     │   • section → section   │
│              │   └──────────────────┘     │     options             │
│              │   ◀ zoom · page x/y ▶      │                         │
└──────────────┴───────────────────────────┴─────────────────────────┘
```

### Top bar
Brand · editable document **title** · **mode toggle** `[Worksheet | Test]` ·
spacer · **Open**, **Save**, **Settings** · **Export PDF** (primary). Dialogs
for breadth (Print config #7, Versions #11) open from here.

### Navigator (left)
- **Worksheet mode:** the chapter-grouped **topic tree** (filterable) — pick the
  single topic the worksheet generates.
- **Test mode:** the **sections outline** — an ordered, drag-reorderable list of
  sections (Part A, Part B, …), each showing its topic + count, plus
  **＋ Add section** (opens the topic picker). Footer shows section/question/page
  totals.

### Canvas (center) — **the page is always full letter size**
- The worksheet renders as a **real US-Letter page (8.5 × 11), at a fixed
  aspect ratio that never scales to fit the content.** Short content leaves
  honest white space at the bottom of the page; long content flows onto a
  second letter page. This is a hard rule — the preview must always read as a
  physical sheet of paper, exactly what will print.
- **Zoom scales the *view*, not the page proportions.** A floating zoom control
  (−/＋, %, Fit width) and page indicator (`Page x of y`) sit at the bottom.
- The canvas sits on a soft dotted surface so the page edges read clearly.
- Problems and sections are **selectable** directly on the page (hover affordance
  → click selects), which drives the inspector.

### Inspector (right) — **contextual, selection-driven**
What shows depends on the current selection (this is the core of the S1 model):
- **Nothing selected →** document-level generation options (topic params for a
  worksheet; or document defaults) + Generate / Regenerate.
- **A problem selected →** that problem's equation + **Re-roll**, **Remove**,
  **Edit coefficients…** (Tier-2, #8). Per-problem curation (#4) lives here.
- **A section selected (Test mode) →** that section's options (topic, roots,
  count, …) + **Re-roll section** / **Remove section**.
- A breadcrumb (`Part A › Problem 4`) shows the selection context.

---

## 3. Worksheet vs Test (the sections toggle)

Two document shapes, one engine:

| | **Worksheet** (classic / "Kuta mode") | **Test** (our multi-section) |
|---|---|---|
| Composition | One topic, one recipe | Many **sections**, each its own topic + params + seed |
| Navigator | Topic tree | Sections outline (+ Add section) |
| Page | Single directions + numbered problems | Per-section directions (Part A, B…), continuous numbering |
| Use | Daily practice / homework | Unit tests pulling from several modules |

- The toggle is in the top bar per-document; the **default** is a Setting
  ("New documents are Worksheets / Tests"). This lets a teacher keep the simple
  classic flow or opt into the richer multi-section one.
- **Data-model note (for the engine):** a Test worksheet is `sections: [{ topic,
  params, seed, count }]` rather than the MVP's single `{ generatorId, params,
  baseSeed, count }`. A Worksheet is the one-section case. Saving still stores
  baked problems + per-section recipes (byte-identical reopen + re-roll). This
  is a deliberate extension of the MVP "one topic per worksheet" model — call it
  out when scoping the persistence (#3) and curation (#4) slices.

---

## 4. Where each control belongs

| Control scope | Home | Examples |
|---|---|---|
| Open document / launch | **Home screen** | Blank worksheet/test, templates, recents |
| Global document actions | **Top bar** | Title, mode toggle, Open, Save, Export, Settings; Print config (#7) & Versions (#11) as **dialogs** |
| Pick what to generate | **Navigator** | Topic (worksheet) / sections (test) |
| Shape the whole document | **Inspector, nothing selected** | Topic params, key format (#6), MC toggle (#5), spacing (#7) |
| Act on one problem | **Inspector, problem selected** | Re-roll, remove, edit coefficients (#4, #8) |
| Act on one section | **Inspector, section selected** | Section topic/params, re-roll/remove section |
| Change what the canvas shows | **Canvas floating controls / top bar** | Zoom, page nav, answer-key visibility |
| Multi-field / modal config | **Dialog from the top bar** | Print config (#7), Versions (#11), Settings |

Rules of thumb (unchanged from the engine's intent):
- **Schema-driven options.** Per-topic options always come from the generator's
  declared `schema` via the generic options component — never hand-coded.
- **One scope, one home.** Whole-document vs section vs single-problem controls
  never bleed into each other; the inspector disambiguates by selection.
- **The preview is print-truth.** The canvas page is the PDF — same letter
  dimensions, margins, and pagination.

---

## 5. Design system

- Tokens in `src/index.css` (light/dark). Chosen theme = **Soft Modern**: bg
  `#f1f3ef`, surfaces `#fbfcfa`/`#fff`, ink `#232a26`, accent sage `#4f7a64`
  (soft `#e9f1ec`, deep `#3c6450`), lines `#e7ebe6`.
- Type: **Onest** (UI) + **Fraunces** (display/worksheet titles). Bundle offline
  via `@fontsource` (don't rely on a network CDN in the Tauri build).
- Primitives in `src/components/ui/` (`button`, `input`, `label`, `separator`,
  …) following the existing `data-slot` + `cn(...)` style; icons from
  `lucide-react`. Rounded corners (~11–14px), soft shadows, toggle-style
  switches for booleans, segmented controls for small enums.
- Shell parts live in `src/components/shell/` (navigator/topic tree, sections
  outline, canvas/page, inspector, home screen).
