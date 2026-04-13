#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use std::fs;
use std::io::{Read, Seek, SeekFrom, Write, BufWriter};
use std::path::PathBuf;
use std::sync::Mutex;
use std::collections::HashSet;
use tauri::{Menu, MenuEntry, MenuItem, Submenu, AboutMetadata, WindowEvent};

/// Global set of allowed paths (user-selected files + temp files created by us).
/// Only paths in this set (or under the temp dir) can be accessed by file I/O commands.
static ALLOWED_PATHS: once_cell::sync::Lazy<Mutex<HashSet<PathBuf>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashSet::new()));

/// Prefix applied to every temp file we create. Intentionally includes the
/// vendor/app name so startup/window-close sweeps can never touch another
/// app's files. Keep in sync with `get_temp_path` and `cleanup_temp_files`.
const TEMP_FILE_PREFIX: &str = "safeheron-offline-recovery-";
const TEMP_FILE_SUFFIX: &str = ".csv";

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
    // Filename embeds our PID so cleanup sweeps can tell files belonging to
    // live sibling instances apart from stale files left by crashed ones.
    // Format: safeheron-offline-recovery-<pid>-<random-hex>.csv
    path.push(format!(
        "{}{}-{:x}{}",
        TEMP_FILE_PREFIX,
        std::process::id(),
        random_suffix,
        TEMP_FILE_SUFFIX
    ));
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
fn remove_temp_file(path: String) -> Result<(), String> {
    let canonical_temp = fs::canonicalize(std::env::temp_dir())
        .map_err(|e| format!("Failed to resolve temp dir: {}", e))?;

    // Resolve the path (or its parent, if the file doesn't exist) so we can
    // check whether it's within temp dir regardless of whether it exists.
    // This avoids leaking existence info for arbitrary filesystem paths:
    // every reply for something outside temp is "Access denied", not
    // "File does not exist" — otherwise callers could probe the filesystem.
    let resolved = fs::canonicalize(&path).or_else(|_| {
        let p = PathBuf::from(&path);
        match (p.parent(), p.file_name()) {
            (Some(parent), Some(name)) => fs::canonicalize(parent).map(|cp| cp.join(name)),
            _ => Err(std::io::Error::new(std::io::ErrorKind::NotFound, "invalid path")),
        }
    });

    // If neither the path nor its parent resolves we cannot verify scope.
    // Treat this indistinguishably from out-of-scope to preserve the invariant.
    let canonical_path = match resolved {
        Ok(p) => p,
        Err(_) => return Err("Access denied: can only remove files under temp directory".into()),
    };

    if !canonical_path.starts_with(&canonical_temp) {
        return Err("Access denied: can only remove files under temp directory".into());
    }

    // Mirror cleanup_temp_files: restrict deletion to files we created, so a
    // caller can't coax this command into deleting unrelated temp files like
    // another app's cache. Check existence AFTER the name check so non-matching
    // filenames can't leak "does this file exist" via differing error messages.
    let file_name_ok = canonical_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with(TEMP_FILE_PREFIX) && n.ends_with(TEMP_FILE_SUFFIX))
        .unwrap_or(false);
    if !file_name_ok {
        return Err("Access denied: can only remove files created by this app".into());
    }

    // Scope + name confirmed — now safe to distinguish missing from other errors.
    if !canonical_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    fs::remove_file(&canonical_path).map_err(|e| format!("Failed to remove temp file: {}", e))
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

/// Parse the PID segment out of a temp filename like
/// `safeheron-offline-recovery-<pid>-<random>.csv`. Returns None for files
/// written by an older build that didn't embed a PID — those should be
/// treated as stale and cleaned up unconditionally.
fn parse_temp_file_pid(name: &str) -> Option<u32> {
    let stripped = name.strip_prefix(TEMP_FILE_PREFIX)?.strip_suffix(TEMP_FILE_SUFFIX)?;
    // Format: "<pid>-<random_hex>"
    let (pid_str, _) = stripped.split_once('-')?;
    pid_str.parse().ok()
}

/// Whether a process with the given PID is currently alive. We shell out to
/// `kill -0` on Unix and `tasklist` on Windows to avoid adding a dep like
/// sysinfo — cleanup runs at most twice per session (startup + close) so the
/// process-spawn overhead is negligible.
///
/// Edge case: on Unix, `kill -0` also succeeds against a zombie (a process
/// that has exited but whose parent hasn't reaped it), so a crashed sibling
/// stuck as a zombie would appear "alive" here. The mtime fallback in
/// `cleanup_temp_files` catches this after 24h, which is enough for the
/// interactive workflow this app supports.
fn is_process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stderr(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(windows)]
    {
        // With `/NH /FO CSV`, tasklist emits a single CSV row on stdout when
        // the PID exists and writes the "INFO: No tasks..." line to stderr
        // otherwise. So stdout being non-empty is a clean match signal.
        std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/NH", "/FO", "CSV"])
            .stderr(std::process::Stdio::null())
            .output()
            .map(|o| !o.stdout.is_empty())
            .unwrap_or(false)
    }
    #[cfg(not(any(unix, windows)))]
    {
        // Unknown platform — be conservative and assume alive so we don't
        // delete another instance's active files.
        true
    }
}

/// Age threshold for the mtime fallback in `CleanupScope::All`. Any recovery
/// workflow completes in well under this window; a file older than this with
/// a "still alive" PID almost certainly means the PID was recycled after the
/// original owner died.
const STALE_MTIME_THRESHOLD: std::time::Duration = std::time::Duration::from_secs(24 * 60 * 60);

/// Which files `cleanup_temp_files` is allowed to touch.
#[derive(Clone, Copy)]
enum CleanupScope {
    /// Delete only files owned by the current process. Used on window close:
    /// we're about to exit, we own these files, but sibling instances — even
    /// ones with stale-looking mtimes — are not our problem to clean up here.
    OwnOnly,
    /// Delete own files AND sweep anything left behind by previous runs.
    /// Used on startup: only one natural moment to clean up after crashes.
    All,
}

/// Remove temp files based on the given scope. See `CleanupScope` for when
/// each variant applies.
///
/// Decision tree for `CleanupScope::All`:
///   1. Legacy filename (no PID segment)                → delete
///   2. PID == current process                          → delete (our own)
///   3. PID's process is not alive                      → delete (stale)
///   4. PID's process is alive AND mtime > 24h old      → delete (PID reuse)
///   5. PID's process is alive AND mtime fresh          → keep (sibling instance)
///
/// For `CleanupScope::OwnOnly`, only step 2 applies — siblings are left alone.
///
/// Step 4 is a safety net: `is_process_alive` can't tell a genuinely live
/// sibling apart from an unrelated process that inherited the PID after the
/// original owner crashed (or a zombie on Unix). Trade-off: a user who leaves
/// this app open idle for >24h across a workflow would lose their in-progress
/// temp file on the next startup — deemed acceptable for an interactive tool.
fn cleanup_temp_files(scope: CleanupScope) {
    let temp_dir = std::env::temp_dir();
    let entries = match fs::read_dir(&temp_dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    let own_pid = std::process::id();
    for entry in entries.flatten() {
        let name_os = entry.file_name();
        let name = match name_os.to_str() {
            Some(n) => n,
            None => continue,
        };
        if !(name.starts_with(TEMP_FILE_PREFIX) && name.ends_with(TEMP_FILE_SUFFIX)) {
            continue
        }
        let pid = parse_temp_file_pid(name);
        let should_delete = match scope {
            CleanupScope::OwnOnly => matches!(pid, Some(p) if p == own_pid),
            CleanupScope::All => match pid {
                None => true, // legacy filename without a PID segment
                Some(p) if p == own_pid => true,
                Some(p) if !is_process_alive(p) => true,
                // PID reports alive — guard against PID reuse via mtime.
                // If mtime can't be read, `is_older_than` returns false (keep).
                Some(_) => is_older_than(&entry.path(), STALE_MTIME_THRESHOLD),
            },
        };
        if should_delete {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Whether the file's last-modified time is older than `threshold` ago.
/// Returns false (i.e. "don't treat as old") if mtime can't be determined.
fn is_older_than(path: &std::path::Path, threshold: std::time::Duration) -> bool {
    let metadata = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return false,
    };
    let modified = match metadata.modified() {
        Ok(t) => t,
        Err(_) => return false,
    };
    match std::time::SystemTime::now().duration_since(modified) {
        Ok(age) => age > threshold,
        Err(_) => false, // mtime is in the future (clock skew) — don't delete
    }
}

fn main() {
    cleanup_temp_files(CleanupScope::All);
    let ctx = tauri::generate_context!();
    let name = &ctx.package_info().name;
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_file_size,
            read_file_chunk,
            write_file_chunk,
            get_temp_path,
            copy_file,
            remove_temp_file,
            register_selected_path
        ])
        .on_window_event(|event| {
            if let WindowEvent::CloseRequested { .. } = event.event() {
                cleanup_temp_files(CleanupScope::OwnOnly);
            }
        })
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
