mod pdf;

use rfd::FileDialog;
use std::fs;

/// Save a worksheet (JSON) to a user-chosen file. Returns false if cancelled.
#[tauri::command]
fn save_worksheet(json: String, suggested_name: String) -> Result<bool, String> {
    let path = FileDialog::new()
        .set_file_name(&suggested_name)
        .add_filter("OpenAlg worksheet", &["json"])
        .save_file();
    match path {
        Some(p) => {
            fs::write(&p, json).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Open a worksheet (JSON) the user picks. Returns None if cancelled.
#[tauri::command]
fn open_worksheet() -> Result<Option<String>, String> {
    let path = FileDialog::new()
        .add_filter("OpenAlg worksheet", &["json"])
        .pick_file();
    match path {
        Some(p) => Ok(Some(fs::read_to_string(&p).map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

/// Compile a Typst document (+ LaTeX math) to PDF and save it. False if cancelled.
#[tauri::command]
fn export_pdf(source: String, math: Vec<String>, suggested_name: String) -> Result<bool, String> {
    let path = FileDialog::new()
        .set_file_name(&suggested_name)
        .add_filter("PDF", &["pdf"])
        .save_file();
    match path {
        Some(p) => {
            let bytes = pdf::compile_pdf(&source, &math)?;
            fs::write(&p, bytes).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_worksheet,
            open_worksheet,
            export_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
