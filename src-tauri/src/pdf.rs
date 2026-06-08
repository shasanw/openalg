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

use typst::foundations::Bytes;
use typst::text::Font;
use typst_as_lib::TypstEngine;
use typst_pdf::{pdf, PdfOptions};

/// Load Typst's default fonts (New Computer Modern, etc.) bundled via typst-assets.
fn load_fonts() -> Vec<Font> {
    typst_assets::fonts()
        .flat_map(|data| Font::iter(Bytes::new(data)))
        .collect()
}

/// Convert one LaTeX math snippet into a Typst inline-math string `$ ... $`.
/// On conversion failure we fall back to showing the raw LaTeX as text rather
/// than silently dropping content.
fn latex_to_typst(latex: &str) -> String {
    match mitex::convert_math(latex, None) {
        Ok(body) => format!("${}$", body),
        Err(_) => format!("#raw({:?})", latex),
    }
}

/// Replace every `@@M<i>@@` placeholder with its converted Typst math.
fn fill_math(source: &str, math: &[String]) -> String {
    let mut out = source.to_string();
    for (i, latex) in math.iter().enumerate() {
        out = out.replace(&format!("@@M{i}@@"), &latex_to_typst(latex));
    }
    out
}

/// Compile a worksheet's Typst source (+ its LaTeX math) to PDF bytes.
pub fn compile_pdf(source: &str, math: &[String]) -> Result<Vec<u8>, String> {
    let full = fill_math(source, math);

    let engine = TypstEngine::builder()
        .main_file(full)
        .fonts(load_fonts())
        .build();

    let doc = engine
        .compile()
        .output
        .map_err(|e| format!("Typst compile error: {e:?}"))?;

    pdf(&doc, &PdfOptions::default()).map_err(|e| format!("PDF export error: {e:?}"))
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
}
