//! Typst PDF compilation with LaTeX math bridged via mitex.
//!
//! The frontend (TypeScript) builds the Typst layout with `@@M<i>@@` placeholders
//! and ships the LaTeX snippets separately. Here we convert each snippet to Typst
//! math (mitex), substitute the placeholders, and compile to PDF with the bundled
//! Typst default fonts (so it works fully offline).
//!
//! FIRST-COMPILE NOTE: the exact typst-as-lib / typst / mitex APIs shift between
//! versions. If `cargo build` fails here, the breakage is almost certainly one of
//! the three call sites below (font loading, `compile()`, or `mitex::convert_math`);
//! they're isolated on purpose. Paste the error and we'll pin/adjust.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use typst::foundations::Bytes;
use typst::layout::PagedDocument;
use typst::text::Font;
use typst_as_lib::TypstEngine;
use typst_pdf::{pdf, PdfOptions};

/// Typst's default fonts (New Computer Modern, etc.), bundled via typst-assets
/// and decoded exactly once for the process lifetime. Decoding the full family
/// from bytes costs tens of ms; the live preview recompiles on every edit, so
/// re-decoding per compile was pure waste. `Font` is internally reference-counted,
/// so cloning this `Vec` per compile is cheap (just bumps refcounts).
static FONTS: LazyLock<Vec<Font>> = LazyLock::new(|| {
    typst_assets::fonts()
        .flat_map(|data| Font::iter(Bytes::new(data)))
        .collect()
});

/// How many compile generations a memoized Typst layout fragment survives without
/// being reused before comemo evicts it. typst-as-lib defaults this to `0`, which
/// wipes Typst's *global* incremental-layout cache after every compile — so a
/// one-character title edit re-lays-out every problem from scratch. A small,
/// bounded window keeps unchanged content cached across consecutive edits (the
/// common live-preview case) while still bounding memory.
const COMEMO_EVICT_MAX_AGE: usize = 16;

/// Cache of converted math, keyed by the raw LaTeX snippet. `mitex::convert_math`
/// is pure, so identical input always yields identical Typst. The preview
/// recompiles on every edit (title, spacing, margins…), but the problems' math
/// rarely changes between those edits — without this cache we'd re-run mitex over
/// every snippet on every keystroke.
static MATH_CACHE: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Convert one LaTeX math snippet into a Typst inline-math string `$ ... $`,
/// memoized by input. On conversion failure we fall back to showing the raw
/// LaTeX as text rather than silently dropping content.
fn latex_to_typst(latex: &str) -> String {
    if let Some(cached) = MATH_CACHE.lock().unwrap().get(latex) {
        return cached.clone();
    }
    let converted = match mitex::convert_math(latex, None) {
        Ok(body) => format!("${}$", body),
        Err(_) => format!("#raw({:?})", latex),
    };
    MATH_CACHE
        .lock()
        .unwrap()
        .insert(latex.to_string(), converted.clone());
    converted
}

/// Replace every `@@M<i>@@` placeholder with its converted Typst math.
fn fill_math(source: &str, math: &[String]) -> String {
    let mut out = source.to_string();
    for (i, latex) in math.iter().enumerate() {
        out = out.replace(&format!("@@M{i}@@"), &latex_to_typst(latex));
    }
    out
}

/// Compile a worksheet's Typst source (+ its LaTeX math) into a paged document.
/// Shared by the PDF export and the SVG live preview so both render from the
/// identical layout — the preview is print-truth (issue #7).
///
/// We rebuild a `TypstEngine` per call (it's cheap once `FONTS` is cached), but
/// raise comemo's eviction window so Typst's global memoization cache survives
/// between compiles — that's what makes incremental edits fast, not the engine
/// struct itself.
fn compile_document(source: &str, math: &[String]) -> Result<PagedDocument, String> {
    let full = fill_math(source, math);

    let mut builder = TypstEngine::builder();
    builder.comemo_evict_max_age(Some(COMEMO_EVICT_MAX_AGE));
    let engine = builder.main_file(full).fonts(FONTS.clone()).build();

    engine
        .compile()
        .output
        .map_err(|e| format!("Typst compile error: {e:?}"))
}

/// Compile a worksheet's Typst source (+ its LaTeX math) to PDF bytes.
pub fn compile_pdf(source: &str, math: &[String]) -> Result<Vec<u8>, String> {
    let doc = compile_document(source, math)?;
    pdf(&doc, &PdfOptions::default()).map_err(|e| format!("PDF export error: {e:?}"))
}

/// Compile a worksheet to one self-contained SVG string per page. Drives both
/// the in-app paginated preview and the print path (printed via the webview),
/// so the screen, the print dialog, and the exported PDF all render the exact
/// same Typst layout (#7). Glyphs are embedded as paths, so no font is needed
/// at display time.
pub fn compile_svg(source: &str, math: &[String]) -> Result<Vec<String>, String> {
    let doc = compile_document(source, math)?;
    Ok(doc.pages.iter().map(typst_svg::svg).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiles_a_nonempty_pdf_with_math() {
        let source = "#set page(width: 300pt, height: 300pt)\nProblem: @@M0@@";
        let bytes = compile_pdf(source, &["x^2 - 5x + 6 = 0".to_string()])
            .expect("worksheet should compile to a PDF");
        assert!(!bytes.is_empty(), "PDF must not be empty");
        assert_eq!(&bytes[0..4], b"%PDF", "output should be a PDF");
    }

    #[test]
    fn compiles_one_svg_per_page() {
        // Two forced pages -> two SVG strings, each real SVG markup.
        let source =
            "#set page(width: 300pt, height: 300pt)\n@@M0@@\n#pagebreak()\nKey";
        let pages = compile_svg(source, &["x^2 - 5x + 6 = 0".to_string()])
            .expect("worksheet should compile to SVG");
        assert_eq!(pages.len(), 2, "expected one SVG per page");
        for page in &pages {
            assert!(page.contains("<svg"), "each page should be SVG markup");
        }
    }
}
