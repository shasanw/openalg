mod pdf;

use rfd::FileDialog;
use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use tauri::Manager;

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

// --- Managed worksheet library (issue #3 follow-up: silent auto-save) ---------
//
// Worksheets are auto-saved into an app-managed directory so the user never
// handles file paths. Each document is one `<id>.json` file under
// `app_data_dir/worksheets`; the directory IS the library and the recents list,
// so there's no separate index to corrupt — `library_list` derives metadata by
// scanning the files and uses each file's modified-time as "last edited".

/// Resolve (and create) the managed worksheets directory.
fn worksheets_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("worksheets");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Ids are frontend-generated UUIDs; restrict to a safe charset so an id can
/// never escape the worksheets directory (path traversal) or name a weird file.
fn is_safe_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Metadata for one saved worksheet, used to render the home-screen recents.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryEntry {
    id: String,
    title: String,
    generator_id: String,
    count: usize,
    /// File modified time, ms since the Unix epoch (newest = most recent).
    updated_at: u64,
}

/// Auto-save a worksheet into the library under its stable id (overwrites).
#[tauri::command]
fn library_save(app: tauri::AppHandle, id: String, json: String) -> Result<(), String> {
    if !is_safe_id(&id) {
        return Err("invalid worksheet id".into());
    }
    let path = worksheets_dir(&app)?.join(format!("{id}.json"));
    fs::write(path, json).map_err(|e| e.to_string())
}

/// List saved worksheets, newest-edited first. Unreadable/foreign files are
/// skipped rather than failing the whole listing.
#[tauri::command]
fn library_list(app: tauri::AppHandle) -> Result<Vec<LibraryEntry>, String> {
    let dir = worksheets_dir(&app)?;
    let mut entries = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()).map(str::to_string) else {
            continue;
        };
        let Ok(text) = fs::read_to_string(&path) else { continue };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        let title = value
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Untitled worksheet")
            .to_string();
        let generator_id = value
            .get("generatorId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let count = value
            .get("problems")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        let updated_at = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        entries.push(LibraryEntry {
            id,
            title,
            generator_id,
            count,
            updated_at,
        });
    }
    entries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(entries)
}

/// Load one worksheet's JSON from the library by id.
#[tauri::command]
fn library_load(app: tauri::AppHandle, id: String) -> Result<String, String> {
    if !is_safe_id(&id) {
        return Err("invalid worksheet id".into());
    }
    let path = worksheets_dir(&app)?.join(format!("{id}.json"));
    fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Remove a worksheet from the library. A missing file is not an error.
#[tauri::command]
fn library_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if !is_safe_id(&id) {
        return Err("invalid worksheet id".into());
    }
    let path = worksheets_dir(&app)?.join(format!("{id}.json"));
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
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

/// Compile a worksheet to one SVG string per page. Drives the in-app paginated
/// preview and the print path (both rendered by the webview), so screen, print
/// dialog, and exported PDF share the identical Typst layout (#7).
#[tauri::command]
fn render_preview(source: String, math: Vec<String>) -> Result<Vec<String>, String> {
    pdf::compile_svg(&source, &math)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_worksheet,
            open_worksheet,
            library_save,
            library_list,
            library_load,
            library_delete,
            export_pdf,
            render_preview
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
