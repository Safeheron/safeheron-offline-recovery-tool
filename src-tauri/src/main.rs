#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use std::fs;
use std::io::{Read, Seek, SeekFrom, Write, BufWriter};
use std::path::PathBuf;
use std::sync::Mutex;
use std::collections::HashSet;
use tauri::{Menu, MenuEntry, MenuItem, Submenu, AboutMetadata};

/// Global set of allowed paths (user-selected files + temp files created by us).
/// Only paths in this set (or under the temp dir) can be accessed by file I/O commands.
static ALLOWED_PATHS: once_cell::sync::Lazy<Mutex<HashSet<PathBuf>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashSet::new()));

/// Check whether the given path is allowed for file I/O.
/// Allowed paths: paths explicitly registered via dialog selection or get_temp_path,
/// and any path under the system temp directory.
fn is_path_allowed(path: &str) -> Result<(), String> {
    let canonical = fs::canonicalize(path)
        .or_else(|_| {
            // File may not exist yet (e.g. write_file_chunk creating new file).
            // In that case, canonicalize the parent and append the filename.
            let p = PathBuf::from(path);
            if let (Some(parent), Some(name)) = (p.parent(), p.file_name()) {
                fs::canonicalize(parent).map(|cp| cp.join(name))
            } else {
                Err(std::io::Error::new(std::io::ErrorKind::NotFound, "invalid path"))
            }
        })
        .map_err(|e| format!("Path validation failed: {}", e))?;

    // Allow anything under the system temp directory
    let temp_dir = std::env::temp_dir();
    if let Ok(canonical_temp) = fs::canonicalize(&temp_dir) {
        if canonical.starts_with(&canonical_temp) {
            return Ok(());
        }
    }

    // Allow explicitly registered paths
    let allowed = ALLOWED_PATHS.lock().map_err(|e| format!("Lock error: {}", e))?;
    if allowed.contains(&canonical) {
        return Ok(());
    }

    Err(format!("Access denied: path not in allowed set: {}", path))
}

/// Register a path as allowed (called when user selects a file via dialog).
/// Handles files that don't exist yet by canonicalizing the parent directory.
fn allow_path(path: &str) {
    let canonical = fs::canonicalize(path).or_else(|_| {
        let p = PathBuf::from(path);
        if let (Some(parent), Some(name)) = (p.parent(), p.file_name()) {
            fs::canonicalize(parent).map(|cp| cp.join(name))
        } else {
            Err(std::io::Error::new(std::io::ErrorKind::NotFound, "invalid path"))
        }
    });
    if let Ok(canonical) = canonical {
        if let Ok(mut set) = ALLOWED_PATHS.lock() {
            set.insert(canonical);
        }
    }
}

#[tauri::command]
fn register_selected_path(path: String) -> Result<(), String> {
    allow_path(&path);
    Ok(())
}

#[tauri::command]
fn get_file_size(path: String) -> Result<u64, String> {
    is_path_allowed(&path)?;
    fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| format!("Failed to get file size: {}", e))
}

/// Returns { text, bytesRead } so the caller can advance the offset correctly
/// when a multi-byte UTF-8 char is split at the chunk boundary.
#[tauri::command]
fn read_file_chunk(path: String, offset: u64, size: u64) -> Result<(String, u64), String> {
    is_path_allowed(&path)?;
    let mut file = fs::File::open(&path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("Failed to seek: {}", e))?;

    // Read up to `size` bytes, then scan for the last valid UTF-8 boundary.
    // If the boundary falls inside a multi-byte char, we truncate to before it;
    // the caller will re-read those trailing bytes on the next call.
    let mut buf = vec![0u8; size as usize];
    let bytes_read = file.read(&mut buf)
        .map_err(|e| format!("Failed to read: {}", e))?;
    buf.truncate(bytes_read);

    // Find the last complete UTF-8 character boundary.
    let valid_len = match std::str::from_utf8(&buf) {
        Ok(_) => buf.len(),
        Err(e) => e.valid_up_to(),
    };

    if valid_len == 0 && bytes_read > 0 {
        // Entire chunk is invalid UTF-8 (should not happen with well-formed CSV).
        // Advance past the invalid bytes so the caller doesn't loop forever.
        return Ok((String::new(), bytes_read as u64));
    }

    buf.truncate(valid_len);
    let text = String::from_utf8(buf)
        .map_err(|e| format!("Invalid UTF-8: {}", e))?;
    Ok((text, valid_len as u64))
}

#[tauri::command]
fn get_temp_path() -> Result<String, String> {
    let mut path = std::env::temp_dir();
    let random_suffix: u64 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0)
        ^ (std::process::id() as u64);
    path.push(format!("derived-recovery-{:x}.csv", random_suffix));
    let result = path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid temp path".to_string())?;
    // Temp paths are automatically allowed (under temp dir), no need to register
    Ok(result)
}

#[tauri::command]
fn copy_file(src: String, dst: String) -> Result<(), String> {
    is_path_allowed(&src)?;
    is_path_allowed(&dst)?;
    fs::copy(&src, &dst)
        .map(|_| ())
        .map_err(|e| format!("Failed to copy file: {}", e))
}

#[tauri::command]
fn write_file_chunk(path: String, content: String, append: bool) -> Result<(), String> {
    is_path_allowed(&path)?;
    let file = if append {
        fs::OpenOptions::new().append(true).open(&path)
    } else {
        fs::File::create(&path).map(|f| f)
    };

    let file = file.map_err(|e| format!("Failed to open file for writing: {}", e))?;
    let mut writer = BufWriter::new(file);
    writer.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write: {}", e))?;
    writer.flush()
        .map_err(|e| format!("Failed to flush: {}", e))
}

fn main() {
    let ctx = tauri::generate_context!();
    let name = &ctx.package_info().name;
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_file_size,
            read_file_chunk,
            write_file_chunk,
            get_temp_path,
            copy_file,
            register_selected_path
        ])
        .menu(Menu::with_items([
            #[cfg(target_os = "macos")]
            MenuEntry::Submenu(Submenu::new(
                "",
                Menu::with_items([
                    MenuItem::About(name.into(), AboutMetadata::default()).into(),
                    MenuItem::Quit.into()
                ]),
            )),
            MenuEntry::Submenu(Submenu::new(
                "Edit",
                Menu::with_items([
                    MenuItem::Undo.into(),
                    MenuItem::Redo.into(),
                    MenuItem::Separator.into(),
                    MenuItem::Cut.into(),
                    MenuItem::Copy.into(),
                    MenuItem::Paste.into(),
                    #[cfg(not(target_os = "macos"))]
                    MenuItem::Separator.into(),
                    MenuItem::SelectAll.into(),
                ]),
            )),
        ]))
        .run(ctx)
        .expect("error while running tauri application");
}
