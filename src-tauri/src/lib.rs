use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use walkdir::WalkDir;

use futures_util::StreamExt;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION};
use tauri::Emitter;
use tauri::Manager;

// ── File tree types ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ext: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

const HIDDEN_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    ".obsidian",
    ".svelte-kit",
    ".next",
    ".nuxt",
    ".vscode",
    ".idea",
    "__pycache__",
    ".DS_Store",
    "target",
    "dist",
    ".playwright-mcp",
    ".vault-pilot",
    "build",
];

fn should_skip(name: &str, show_hidden: bool) -> bool {
    if show_hidden {
        return false;
    }
    HIDDEN_DIRS.contains(&name) || name.starts_with('.')
}

fn build_tree(path: &Path, depth: usize, max_depth: usize, show_hidden: bool) -> Option<FileNode> {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    if should_skip(&name, show_hidden) {
        return None;
    }

    if path.is_dir() {
        if depth >= max_depth {
            return Some(FileNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                size: None,
                ext: None,
                children: Some(vec![]),
            });
        }

        let mut children: Vec<FileNode> = Vec::new();
        if let Ok(entries) = fs::read_dir(path) {
            let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
            entries.sort_by(|a, b| {
                let a_is_dir = a.path().is_dir();
                let b_is_dir = b.path().is_dir();
                match (a_is_dir, b_is_dir) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => a
                        .file_name()
                        .to_string_lossy()
                        .to_lowercase()
                        .cmp(&b.file_name().to_string_lossy().to_lowercase()),
                }
            });
            for entry in entries {
                if let Some(node) = build_tree(&entry.path(), depth + 1, max_depth, show_hidden) {
                    children.push(node);
                }
            }
        }

        Some(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir: true,
            size: None,
            ext: None,
            children: Some(children),
        })
    } else {
        let metadata = fs::metadata(path).ok();
        let size = metadata.map(|m| m.len());
        let ext = path.extension().map(|e| e.to_string_lossy().to_string());

        Some(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir: false,
            size,
            ext,
            children: None,
        })
    }
}

#[tauri::command]
fn read_directory_tree(path: String, show_hidden: bool) -> Result<FileNode, String> {
    let path = PathBuf::from(&path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }
    build_tree(&path, 0, 20, show_hidden)
        .ok_or_else(|| "Failed to build directory tree".to_string())
}

#[tauri::command]
fn read_directory_children(path: String, show_hidden: bool) -> Result<Vec<FileNode>, String> {
    let path = PathBuf::from(&path);
    if !path.is_dir() {
        return Err("Not a directory".to_string());
    }

    let mut children: Vec<FileNode> = Vec::new();
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
    entries.sort_by(|a, b| {
        let a_is_dir = a.path().is_dir();
        let b_is_dir = b.path().is_dir();
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a
                .file_name()
                .to_string_lossy()
                .to_lowercase()
                .cmp(&b.file_name().to_string_lossy().to_lowercase()),
        }
    });

    for entry in entries {
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip(&name, show_hidden) {
            continue;
        }
        let entry_path = entry.path();
        let is_dir = entry_path.is_dir();
        let metadata = fs::metadata(&entry_path).ok();
        let size = if !is_dir {
            metadata.map(|m| m.len())
        } else {
            None
        };
        let ext = entry_path
            .extension()
            .map(|e| e.to_string_lossy().to_string());

        children.push(FileNode {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir,
            size,
            ext,
            children: if is_dir { Some(vec![]) } else { None },
        });
    }

    Ok(children)
}

#[tauri::command]
fn read_file_text(path: String) -> Result<String, String> {
    let path = PathBuf::from(&path);
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }

    // Try UTF-8 first
    match fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(_) => {
            // Fall back to encoding detection
            let bytes = fs::read(&path).map_err(|e| e.to_string())?;
            let (decoded, _, _) = encoding_rs::UTF_8.decode(&bytes);
            Ok(decoded.to_string())
        }
    }
}

#[tauri::command]
fn read_file_binary(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file_text(path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_file(path: String, is_dir: bool) -> Result<(), String> {
    let path = PathBuf::from(&path);
    if path.exists() {
        return Err("Path already exists".to_string());
    }
    if is_dir {
        fs::create_dir_all(&path).map_err(|e| e.to_string())
    } else {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&path, "").map_err(|e| e.to_string())
    }
}

fn copy_path_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    if source.is_dir() {
        fs::create_dir_all(destination).map_err(|e| e.to_string())?;
        let entries = fs::read_dir(source).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let child_source = entry.path();
            let child_destination = destination.join(entry.file_name());
            copy_path_recursive(&child_source, &child_destination)?;
        }
        Ok(())
    } else {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::copy(source, destination).map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn remove_path_recursive(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

fn move_path_with_fallback(source: &Path, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    match fs::rename(source, destination) {
        Ok(_) => Ok(()),
        Err(_) => {
            copy_path_recursive(source, destination)?;
            remove_path_recursive(source)?;
            Ok(())
        }
    }
}

fn unique_destination_path(destination_dir: &Path, source: &Path) -> Result<PathBuf, String> {
    let name = source
        .file_name()
        .ok_or_else(|| format!("Invalid source path: {}", source.display()))?
        .to_string_lossy()
        .to_string();

    let mut candidate = destination_dir.join(&name);
    if !candidate.exists() {
        return Ok(candidate);
    }

    let is_dir = source.is_dir();
    let (stem, ext) = if is_dir {
        (name.clone(), None)
    } else {
        let p = Path::new(&name);
        (
            p.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or(name.clone()),
            p.extension().map(|e| e.to_string_lossy().to_string()),
        )
    };

    for index in 1..10_000 {
        let suffix = if index == 1 {
            " copy".to_string()
        } else {
            format!(" copy {}", index)
        };

        let new_name = match &ext {
            Some(extension) => format!("{}{}.{}", stem, suffix, extension),
            None => format!("{}{}", stem, suffix),
        };

        candidate = destination_dir.join(new_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("Unable to resolve non-conflicting destination path".to_string())
}

#[tauri::command]
fn import_paths(
    paths: Vec<String>,
    destination_dir: String,
    move_items: bool,
) -> Result<Vec<String>, String> {
    let destination = PathBuf::from(&destination_dir);
    if !destination.exists() || !destination.is_dir() {
        return Err(format!(
            "Destination is not a directory: {}",
            destination.display()
        ));
    }

    let mut imported_paths: Vec<String> = Vec::new();
    let destination_abs = fs::canonicalize(&destination)
        .map_err(|e| format!("Failed to resolve destination path: {}", e))?;

    for source_str in paths {
        let source = PathBuf::from(&source_str);
        if !source.exists() {
            return Err(format!("Source does not exist: {}", source.display()));
        }

        if source.is_dir() {
            let source_abs = fs::canonicalize(&source)
                .map_err(|e| format!("Failed to resolve source path: {}", e))?;
            if destination_abs.starts_with(&source_abs) {
                return Err(format!(
                    "Cannot import a folder into itself: {} -> {}",
                    source.display(),
                    destination.display()
                ));
            }
        }

        let target = unique_destination_path(&destination, &source)?;
        if move_items {
            move_path_with_fallback(&source, &target)?;
        } else {
            copy_path_recursive(&source, &target)?;
        }

        imported_paths.push(target.to_string_lossy().to_string());
    }

    Ok(imported_paths)
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub path: String,
    pub line_number: usize,
    pub line_content: String,
}

#[tauri::command]
async fn search_files(
    root: String,
    query: String,
    case_sensitive: bool,
    show_hidden: bool,
) -> Result<Vec<SearchResult>, String> {
    tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();
        let query_lower = if !case_sensitive {
            query.to_lowercase()
        } else {
            query.clone()
        };

        for entry in WalkDir::new(&root)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                !should_skip(&name, show_hidden)
            })
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_file() {
                let path = entry.path();
                // Skip binary files by extension
                let ext = path
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                if matches!(
                    ext.as_str(),
                    "png"
                        | "jpg"
                        | "jpeg"
                        | "gif"
                        | "svg"
                        | "ico"
                        | "webp"
                        | "mp4"
                        | "webm"
                        | "mov"
                        | "avi"
                        | "pdf"
                        | "zip"
                        | "tar"
                        | "gz"
                        | "exe"
                        | "dll"
                        | "so"
                        | "dylib"
                        | "woff"
                        | "woff2"
                        | "ttf"
                        | "eot"
                ) {
                    continue;
                }

                if let Ok(content) = fs::read_to_string(path) {
                    for (i, line) in content.lines().enumerate() {
                        let matches = if case_sensitive {
                            line.contains(&query)
                        } else {
                            line.to_lowercase().contains(&query_lower)
                        };
                        if matches {
                            results.push(SearchResult {
                                path: path.to_string_lossy().to_string(),
                                line_number: i + 1,
                                line_content: line.to_string(),
                            });
                            if results.len() >= 500 {
                                return results;
                            }
                        }
                    }
                }
            }
        }

        results
    })
    .await
    .map_err(|e| format!("Search task failed: {}", e))
}

#[derive(Debug, Serialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub ext: Option<String>,
    pub modified: Option<u64>,
}

#[tauri::command]
fn get_file_info(path: String) -> Result<FileInfo, String> {
    let path = PathBuf::from(&path);
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let ext = path.extension().map(|e| e.to_string_lossy().to_string());
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());

    Ok(FileInfo {
        name,
        path: path.to_string_lossy().to_string(),
        size: metadata.len(),
        is_dir: metadata.is_dir(),
        ext,
        modified,
    })
}

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub ext: Option<String>,
}

#[tauri::command]
fn list_all_files(root: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    let root_path = PathBuf::from(&root);
    let mut files = Vec::new();

    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !should_skip(&name, show_hidden)
        })
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            let path = entry.path();
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let relative_path = path
                .strip_prefix(&root_path)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();
            let ext = path.extension().map(|e| e.to_string_lossy().to_string());

            files.push(FileEntry {
                name,
                path: path.to_string_lossy().to_string(),
                relative_path,
                ext,
            });
        }
    }

    Ok(files)
}

// ── PTY Terminal Backend ─────────────────────────────────────────────

struct PtySession {
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send>,
    writer: Box<dyn Write + Send>,
    // Flag to signal the reader thread to stop
    alive: Arc<Mutex<bool>>,
}

#[derive(Default)]
struct TerminalState {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

#[derive(Clone, Serialize)]
struct TerminalOutputPayload {
    id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct TerminalClosedPayload {
    id: String,
    exit_code: Option<u32>,
}

#[tauri::command]
fn spawn_terminal(
    id: String,
    cwd: String,
    rows: u16,
    cols: u16,
    shell: String,
    state: tauri::State<'_, TerminalState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Check if this terminal ID already has an active session — don't overwrite it
    {
        let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        if sessions.contains_key(&id) {
            return Err(format!("Terminal session already exists: {}", id));
        }
    }

    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // Determine shell
    let shell_trimmed = shell.trim();
    let mut cmd = if shell_trimmed.is_empty() || shell_trimmed.eq_ignore_ascii_case("auto") {
        // Default behavior: powershell on Windows, $SHELL on Unix
        if cfg!(target_os = "windows") {
            CommandBuilder::new("powershell.exe")
        } else {
            let default_shell =
                std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
            CommandBuilder::new(default_shell)
        }
    } else if shell_trimmed.eq_ignore_ascii_case("powershell") {
        CommandBuilder::new("powershell.exe")
    } else if shell_trimmed.eq_ignore_ascii_case("bash") {
        if cfg!(target_os = "windows") {
            CommandBuilder::new("bash.exe")
        } else {
            CommandBuilder::new("bash")
        }
    } else if shell_trimmed.eq_ignore_ascii_case("cmd") {
        CommandBuilder::new("cmd.exe")
    } else {
        // Treat as a direct executable path
        CommandBuilder::new(shell_trimmed)
    };

    // Set working directory
    let cwd_path = PathBuf::from(&cwd);
    if cwd_path.exists() && cwd_path.is_dir() {
        cmd.cwd(cwd_path);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // Get a reader from the master for output
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

    // Get a writer for input
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

    let alive = Arc::new(Mutex::new(true));
    let alive_clone = Arc::clone(&alive);

    let session = PtySession {
        master: pair.master,
        child,
        writer,
        alive,
    };

    // Store the session
    {
        let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(id.clone(), session);
    }

    // Spawn a reader thread that emits terminal-output events
    let reader_id = id.clone();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            // Check if we should stop
            {
                let is_alive = alive_clone.lock().unwrap_or_else(|e| e.into_inner());
                if !*is_alive {
                    break;
                }
            }

            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF — process exited
                    let _ = app_handle.emit(
                        "terminal-closed",
                        TerminalClosedPayload {
                            id: reader_id.clone(),
                            exit_code: None,
                        },
                    );
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_handle.emit(
                        "terminal-output",
                        TerminalOutputPayload {
                            id: reader_id.clone(),
                            data,
                        },
                    );
                }
                Err(e) => {
                    // On Windows, a broken pipe means the process exited
                    let _ = app_handle.emit(
                        "terminal-closed",
                        TerminalClosedPayload {
                            id: reader_id.clone(),
                            exit_code: None,
                        },
                    );
                    eprintln!("PTY reader error for {}: {}", reader_id, e);
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn write_terminal(
    id: String,
    data: String,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| format!("Terminal session not found: {}", id))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to PTY: {}", e))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY writer: {}", e))?;
    Ok(())
}

#[tauri::command]
fn resize_terminal(
    id: String,
    rows: u16,
    cols: u16,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("Terminal session not found: {}", id))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize PTY: {}", e))?;
    Ok(())
}

#[tauri::command]
fn close_terminal(id: String, state: tauri::State<'_, TerminalState>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(&id) {
        // Signal the reader thread to stop
        {
            let mut is_alive = session.alive.lock().unwrap_or_else(|e| e.into_inner());
            *is_alive = false;
        }
        // Kill the child process
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
    Ok(())
}

// ── Claude Code Process Backend ──────────────────────────────────────
//
// Architecture: A persistent `claude` process is spawned per UI session using
// `--input-format stream-json` on stdin and `--output-format stream-json` on stdout.
// Messages are sent via `write_claude_code` which writes JSON to stdin.

/// Monotonically increasing generation counter to prevent batcher threads from
/// reaping a respawned process that reuses the same session ID.
static CLAUDE_SPAWN_GEN: AtomicU64 = AtomicU64::new(0);

struct ClaudeCodeProcess {
    child: std::process::Child,
    stdin: Option<std::process::ChildStdin>,
    alive: Arc<AtomicBool>,
    /// Unique generation token assigned at spawn time.
    generation: u64,
}

#[derive(Default)]
struct ClaudeCodeState {
    // Keyed by UI session ID; holds the currently-running process (if any)
    processes: Arc<Mutex<HashMap<String, ClaudeCodeProcess>>>,
}

#[derive(Clone, Serialize)]
struct ClaudeCodeOutputPayload {
    id: String,
    lines: Vec<String>,
}

#[derive(Clone, Serialize)]
struct ClaudeCodeClosedPayload {
    id: String,
    exit_code: Option<i32>,
}

/// On macOS, GUI apps launched from Dock/Finder get a minimal environment
/// (no shell profile, stripped PATH). This loads the user's login shell env
/// so that spawned processes like Claude CLI can find MCP servers, node, etc.
fn get_shell_env() -> HashMap<String, String> {
    let mut env_map = HashMap::new();
    if cfg!(target_os = "macos") {
        // Determine the user's login shell
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        // Run a login shell to dump its environment
        if let Ok(output) = std::process::Command::new(&shell)
            .args(["-l", "-c", "env"])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .output()
        {
            if output.status.success() {
                let env_str = String::from_utf8_lossy(&output.stdout);
                for line in env_str.lines() {
                    if let Some((key, value)) = line.split_once('=') {
                        env_map.insert(key.to_string(), value.to_string());
                    }
                }
            }
        }
    }
    env_map
}

/// Returns (executable, prefix_args) for spawning the Claude CLI.
/// On Windows with npm install, we bypass claude.cmd to avoid cmd.exe pipe
/// inheritance issues — directly invoking `node cli.js` keeps stdin reliable.
fn find_claude_command() -> (String, Vec<String>) {
    if cfg!(target_os = "windows") {
        let home = std::env::var("USERPROFILE").unwrap_or_default();
        // Official installer: direct .exe, no intermediary needed
        let local_bin = format!("{}\\.local\\bin\\claude.exe", home);
        if std::path::Path::new(&local_bin).exists() {
            return (local_bin, vec![]);
        }
        // npm global install: bypass claude.cmd to avoid cmd.exe stdin pipe issues.
        // claude.cmd → cmd.exe /c → node cli.js breaks stdin inheritance with CREATE_NO_WINDOW.
        // Directly invoking node + cli.js avoids the cmd.exe layer entirely.
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        let cli_js = format!("{}\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js", appdata);
        if std::path::Path::new(&cli_js).exists() {
            return ("node".to_string(), vec![cli_js]);
        }
        // Fall back to claude on PATH (handles other install methods)
        ("claude".to_string(), vec![])
    } else {
        let home = std::env::var("HOME").unwrap_or_default();
        let local_bin = format!("{}/.local/bin/claude", home);
        if std::path::Path::new(&local_bin).exists() {
            return (local_bin, vec![]);
        }
        ("claude".to_string(), vec![])
    }
}


/// Spawn a persistent Claude Code process that accepts stream-json on stdin.
/// `id` = UI session ID. Messages are sent via `write_claude_code`.
#[tauri::command]
fn spawn_claude_code(
    id: String,
    cwd: String,
    args: Vec<String>,
    prompt: Option<String>,
    state: tauri::State<'_, ClaudeCodeState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Kill any existing process for this UI session (e.g. if user sends while one is running)
    {
        let mut processes = state.processes.lock().map_err(|e| e.to_string())?;
        if let Some(mut old) = processes.remove(&id) {
            old.alive.store(false, Ordering::Relaxed);
            drop(old.stdin.take());
            let _ = old.child.kill();
            // Reap on background thread to avoid blocking the IPC dispatcher
            std::thread::spawn(move || {
                let _ = old.child.wait();
            });
        }
    }

    let (claude_exe, prefix_args) = find_claude_command();
    let mut cmd = std::process::Command::new(&claude_exe);

    // Prepend any prefix args (e.g. the cli.js path when invoking node directly)
    for arg in &prefix_args {
        cmd.arg(arg);
    }

    // -p alone = pipe mode (stays alive reading stdin via --input-format stream-json)
    // -p "message" = one-shot mode (runs single prompt, exits after result)
    cmd.arg("-p");
    if let Some(ref p) = prompt {
        cmd.arg(p);
    }
    cmd.arg("--output-format").arg("stream-json")
        .arg("--verbose")
        .arg("--include-partial-messages")
        .arg("--dangerously-skip-permissions");
    if prompt.is_none() {
        cmd.arg("--input-format").arg("stream-json");
    }

    // Add any extra args from the frontend
    for arg in &args {
        cmd.arg(arg);
    }

    // Set working directory
    let cwd_path = PathBuf::from(&cwd);
    if cwd_path.exists() && cwd_path.is_dir() {
        cmd.current_dir(&cwd_path);
    }

    // On macOS, GUI apps get a minimal environment. Load the user's shell
    // environment so Claude CLI can find MCP servers, node, npx, etc.
    let shell_env = get_shell_env();
    for (key, value) in &shell_env {
        cmd.env(key, value);
    }

    cmd.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // On Windows, prevent console window from appearing
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn claude: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdin = child.stdin.take();

    let alive = Arc::new(AtomicBool::new(true));
    let alive_stdout = Arc::clone(&alive);
    let alive_stderr = Arc::clone(&alive);

    let generation = CLAUDE_SPAWN_GEN.fetch_add(1, Ordering::Relaxed);
    let process = ClaudeCodeProcess { child, stdin, alive, generation };

    {
        let mut processes = state.processes.lock().map_err(|e| e.to_string())?;
        processes.insert(id.clone(), process);
    }

    let state_arc = Arc::clone(&state.processes);

    // Spawn stdout reader + batcher threads for batched event emission
    if let Some(stdout) = stdout {
        let reader_id = id.clone();
        let app_handle = app.clone();

        let (tx, rx) = std::sync::mpsc::channel::<String>();

        // Reader thread: reads lines from stdout and sends to channel
        std::thread::spawn(move || {
            use std::io::BufRead;
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines() {
                if !alive_stdout.load(Ordering::Relaxed) {
                    break;
                }
                match line {
                    Ok(data) => {
                        if !data.is_empty() {
                            if tx.send(data).is_err() {
                                break;
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
            // tx drops here, signaling the batcher thread
        });

        // Batcher thread: collects lines and emits them in batches every ~50ms
        let batcher_generation = generation;
        std::thread::spawn(move || {
            use std::time::{Duration, Instant};

            const BATCH_INTERVAL: Duration = Duration::from_millis(50);
            let mut batch: Vec<String> = Vec::new();

            loop {
                // Wait for first item (blocks until data or channel closes)
                match rx.recv() {
                    Ok(line) => batch.push(line),
                    Err(_) => {
                        // Channel closed (reader done). Flush remaining and exit.
                        if !batch.is_empty() {
                            let _ = app_handle.emit(
                                "claude-code-output",
                                ClaudeCodeOutputPayload {
                                    id: reader_id.clone(),
                                    lines: std::mem::take(&mut batch),
                                },
                            );
                        }
                        break;
                    }
                }

                // Drain any additional items that arrived within the batch interval
                let deadline = Instant::now() + BATCH_INTERVAL;
                loop {
                    let remaining = deadline.saturating_duration_since(Instant::now());
                    if remaining.is_zero() {
                        break;
                    }
                    match rx.recv_timeout(remaining) {
                        Ok(line) => batch.push(line),
                        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => break,
                        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                }

                // Emit the batch
                if !batch.is_empty() {
                    let _ = app_handle.emit(
                        "claude-code-output",
                        ClaudeCodeOutputPayload {
                            id: reader_id.clone(),
                            lines: std::mem::take(&mut batch),
                        },
                    );
                }
            }

            // Process finished naturally. Reap child and report exit status.
            // Only reap if the process in the map is still OUR generation (not a respawned one).
            let exit_code = if let Ok(mut processes) = state_arc.lock() {
                if let Some(proc) = processes.get(&reader_id) {
                    if proc.generation == batcher_generation {
                        // It's ours. Remove and reap.
                        if let Some(mut proc) = processes.remove(&reader_id) {
                            proc.child.wait().ok().and_then(|s| s.code())
                        } else {
                            None
                        }
                    } else {
                        // A new process was spawned under the same ID. Don't touch it.
                        None
                    }
                } else {
                    // Already removed (e.g. by close_claude_code). Nothing to reap.
                    None
                }
            } else {
                None
            };
            let _ = app_handle.emit(
                "claude-code-closed",
                ClaudeCodeClosedPayload {
                    id: reader_id.clone(),
                    exit_code,
                },
            );
        });
    }

    // Spawn stderr reader thread
    if let Some(stderr) = stderr {
        let reader_id = id.clone();
        let app_handle = app.clone();
        std::thread::spawn(move || {
            use std::io::BufRead;
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines() {
                if !alive_stderr.load(Ordering::Relaxed) {
                    break;
                }
                match line {
                    Ok(data) => {
                        if !data.is_empty() {
                            let _ = app_handle.emit(
                                "claude-code-output",
                                ClaudeCodeOutputPayload {
                                    id: reader_id.clone(),
                                    lines: vec![format!("[stderr] {}", data)],
                                },
                            );
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }

    Ok(())
}

#[tauri::command]
fn close_claude_code(
    id: String,
    state: tauri::State<'_, ClaudeCodeState>,
) -> Result<(), String> {
    let mut processes = state.processes.lock().map_err(|e| e.to_string())?;
    if let Some(mut process) = processes.remove(&id) {
        process.alive.store(false, Ordering::Relaxed);
        drop(process.stdin.take());
        let _ = process.child.kill();
        // Reap the child on a background thread so we don't block the IPC dispatcher.
        // Blocking here starves ALL Tauri commands (terminals, file ops, etc.).
        std::thread::spawn(move || {
            let _ = process.child.wait();
        });
    }
    Ok(())
}

#[tauri::command]
fn write_claude_code(
    id: String,
    message: String,
    state: tauri::State<'_, ClaudeCodeState>,
) -> Result<(), String> {
    use std::io::Write;
    let mut processes = state.processes.lock().map_err(|e| e.to_string())?;
    let process = processes.get_mut(&id)
        .ok_or_else(|| format!("Claude Code session not found: {}", id))?;
    let stdin = process.stdin.as_mut()
        .ok_or_else(|| "Claude Code stdin not available".to_string())?;
    stdin.write_all(message.as_bytes()).map_err(|e| format!("stdin write failed: {}", e))?;
    stdin.write_all(b"\n").map_err(|e| format!("stdin newline failed: {}", e))?;
    stdin.flush().map_err(|e| format!("stdin flush failed: {}", e))?;
    Ok(())
}

// ── File System Watcher ──────────────────────────────────────────────

struct WatcherState {
    watcher: Arc<Mutex<Option<RecommendedWatcher>>>,
}

#[derive(Clone, Serialize)]
struct FsChangePayload {
    kind: String,
    paths: Vec<String>,
}

fn event_kind_to_string(kind: &notify::EventKind) -> &'static str {
    use notify::EventKind::*;
    match kind {
        Create(_) => "create",
        Modify(_) => "modify",
        Remove(_) => "remove",
        Any | Other => "other",
        Access(_) => "other",
    }
}

#[tauri::command]
fn start_watcher(
    path: String,
    state: tauri::State<'_, WatcherState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;

    // Drop existing watcher if any
    *watcher_guard = None;

    let app_handle = app.clone();

    let mut watcher =
        notify::recommended_watcher(move |res: notify::Result<notify::Event>| match res {
            Ok(event) => {
                let kind = event_kind_to_string(&event.kind).to_string();
                let paths: Vec<String> = event
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                let _ = app_handle.emit("fs-change", FsChangePayload { kind, paths });
            }
            Err(e) => {
                eprintln!("File watcher error: {}", e);
            }
        })
        .map_err(|e| format!("Failed to create file watcher: {}", e))?;

    watcher
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to start watching {}: {}", path, e))?;

    *watcher_guard = Some(watcher);
    Ok(())
}

#[tauri::command]
fn stop_watcher(state: tauri::State<'_, WatcherState>) -> Result<(), String> {
    let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;
    *watcher_guard = None;
    Ok(())
}

// ── App State Persistence ────────────────────────────────────────────

#[tauri::command]
fn save_app_state(app: tauri::AppHandle, state_json: String) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    fs::create_dir_all(&app_data_dir).map_err(|e| {
        format!(
            "Failed to create app data dir {}: {}",
            app_data_dir.display(),
            e
        )
    })?;

    let state_file = app_data_dir.join("assistantos-state.json");
    fs::write(&state_file, state_json)
        .map_err(|e| format!("Failed to write state file {}: {}", state_file.display(), e))?;

    Ok(())
}

#[tauri::command]
fn load_app_state(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let state_file = app_data_dir.join("assistantos-state.json");

    if !state_file.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(&state_file)
        .map_err(|e| format!("Failed to read state file {}: {}", state_file.display(), e))
}

// ── AI Chat Backend ──────────────────────────────────────────────────

#[derive(Clone, Serialize)]
struct AiStreamChunkPayload {
    request_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct AiStreamDonePayload {
    request_id: String,
}

#[derive(Clone, Serialize)]
struct AiStreamErrorPayload {
    request_id: String,
    error: String,
}

#[tauri::command]
async fn ai_chat_stream(
    app: tauri::AppHandle,
    request_id: String,
    base_url: String,
    api_key: String,
    body_json: String,
) -> Result<(), String> {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let api_key = api_key.trim().to_string();

    // Parse body JSON so we can use .json() which properly sets content-type
    let body: serde_json::Value = serde_json::from_str(&body_json)
        .map_err(|e| format!("Invalid request body: {}", e))?;

    // Build client with default headers to ensure they survive redirects
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("HTTP-Referer", reqwest::header::HeaderValue::from_static("https://assistantos.app"));
    headers.insert("X-Title", reqwest::header::HeaderValue::from_static("AssistantOS"));
    if !api_key.is_empty() && api_key != "lm-studio" {
        headers.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", api_key))
                .map_err(|e| format!("Invalid API key format: {}", e))?,
        );
    }

    let client = reqwest::Client::builder()
        .default_headers(headers)
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let err_msg = format!("Request failed: {}", e);
            let _ = app.emit(
                "ai-stream-error",
                AiStreamErrorPayload {
                    request_id: request_id.clone(),
                    error: err_msg.clone(),
                },
            );
            err_msg
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let err_msg = format!("API error {}: {}", status, body);
        let _ = app.emit(
            "ai-stream-error",
            AiStreamErrorPayload {
                request_id: request_id.clone(),
                error: err_msg.clone(),
            },
        );
        return Err(err_msg);
    }

    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(bytes) => {
                buffer.extend_from_slice(&bytes);

                // Process complete lines from the byte buffer to avoid corrupting
                // multibyte UTF-8 characters split across network chunks.
                while let Some(newline_pos) = buffer.iter().position(|&b| b == b'\n') {
                    let mut line_bytes: Vec<u8> = buffer.drain(..=newline_pos).collect();

                    if line_bytes.last() == Some(&b'\n') {
                        line_bytes.pop();
                    }
                    if line_bytes.last() == Some(&b'\r') {
                        line_bytes.pop();
                    }
                    if line_bytes.is_empty() {
                        continue;
                    }

                    let line = match String::from_utf8(line_bytes) {
                        Ok(s) => s,
                        Err(_) => {
                            continue;
                        }
                    };

                    if let Some(raw_data) = line.strip_prefix("data:") {
                        let data = raw_data.strip_prefix(' ').unwrap_or(raw_data);

                        if data.trim() == "[DONE]" {
                            let _ = app.emit(
                                "ai-stream-done",
                                AiStreamDonePayload {
                                    request_id: request_id.clone(),
                                },
                            );
                            return Ok(());
                        }

                        let _ = app.emit(
                            "ai-stream-chunk",
                            AiStreamChunkPayload {
                                request_id: request_id.clone(),
                                data: data.to_string(),
                            },
                        );
                    }
                }
            }
            Err(e) => {
                let err_msg = format!("Stream error: {}", e);
                let _ = app.emit(
                    "ai-stream-error",
                    AiStreamErrorPayload {
                        request_id: request_id.clone(),
                        error: err_msg.clone(),
                    },
                );
                return Err(err_msg);
            }
        }
    }

    // Stream ended without [DONE] — still signal done
    let _ = app.emit(
        "ai-stream-done",
        AiStreamDonePayload {
            request_id: request_id.clone(),
        },
    );

    Ok(())
}

#[tauri::command]
async fn ai_chat_stream_anthropic(
    app: tauri::AppHandle,
    request_id: String,
    base_url: String,
    api_key: String,
    body_json: String,
) -> Result<(), String> {
    let url = format!("{}/messages", base_url.trim_end_matches('/'));
    let api_key = api_key.trim().to_string();

    let body: serde_json::Value = serde_json::from_str(&body_json)
        .map_err(|e| format!("Invalid request body: {}", e))?;

    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "x-api-key",
        reqwest::header::HeaderValue::from_str(&api_key)
            .map_err(|e| format!("Invalid API key format: {}", e))?,
    );
    headers.insert(
        "anthropic-version",
        reqwest::header::HeaderValue::from_static("2023-06-01"),
    );

    let client = reqwest::Client::builder()
        .default_headers(headers)
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let err_msg = format!("Request failed: {}", e);
            let _ = app.emit(
                "ai-stream-error",
                AiStreamErrorPayload {
                    request_id: request_id.clone(),
                    error: err_msg.clone(),
                },
            );
            err_msg
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let err_msg = format!("API error {}: {}", status, body);
        let _ = app.emit(
            "ai-stream-error",
            AiStreamErrorPayload {
                request_id: request_id.clone(),
                error: err_msg.clone(),
            },
        );
        return Err(err_msg);
    }

    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(bytes) => {
                buffer.extend_from_slice(&bytes);

                while let Some(newline_pos) = buffer.iter().position(|&b| b == b'\n') {
                    let mut line_bytes: Vec<u8> = buffer.drain(..=newline_pos).collect();

                    if line_bytes.last() == Some(&b'\n') {
                        line_bytes.pop();
                    }
                    if line_bytes.last() == Some(&b'\r') {
                        line_bytes.pop();
                    }
                    if line_bytes.is_empty() {
                        continue;
                    }

                    let line = match String::from_utf8(line_bytes) {
                        Ok(s) => s,
                        Err(_) => {
                            continue;
                        }
                    };

                    if let Some(raw_data) = line.strip_prefix("data:") {
                        let data = raw_data.strip_prefix(' ').unwrap_or(raw_data);

                        if data.trim() == "[DONE]" {
                            let _ = app.emit(
                                "ai-stream-done",
                                AiStreamDonePayload {
                                    request_id: request_id.clone(),
                                },
                            );
                            return Ok(());
                        }

                        let _ = app.emit(
                            "ai-stream-chunk",
                            AiStreamChunkPayload {
                                request_id: request_id.clone(),
                                data: data.to_string(),
                            },
                        );
                    }
                }
            }
            Err(e) => {
                let err_msg = format!("Stream error: {}", e);
                let _ = app.emit(
                    "ai-stream-error",
                    AiStreamErrorPayload {
                        request_id: request_id.clone(),
                        error: err_msg.clone(),
                    },
                );
                return Err(err_msg);
            }
        }
    }

    let _ = app.emit(
        "ai-stream-done",
        AiStreamDonePayload {
            request_id: request_id.clone(),
        },
    );

    Ok(())
}

#[tauri::command]
async fn ai_fetch_models(base_url: String, api_key: String) -> Result<String, String> {
    let url = format!("{}/models", base_url.trim_end_matches('/'));
    let api_key = api_key.trim().to_string();

    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("HTTP-Referer", reqwest::header::HeaderValue::from_static("https://assistantos.app"));
    headers.insert("X-Title", reqwest::header::HeaderValue::from_static("AssistantOS"));
    if !api_key.is_empty() && api_key != "lm-studio" {
        headers.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", api_key))
                .map_err(|e| format!("Invalid API key format: {}", e))?,
        );
    }

    let client = reqwest::Client::builder()
        .default_headers(headers)
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch models: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, body));
    }

    response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))
}

fn lmstudio_root_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/v1") {
        trimmed.trim_end_matches("/v1").to_string()
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
async fn ai_lmstudio_load_model(base_url: String, model: String) -> Result<String, String> {
    let root = lmstudio_root_url(&base_url);
    let url = format!("{}/api/v1/models/load", root);

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let body = serde_json::json!({ "model": model.trim() });

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to load LM Studio model: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("LM Studio load error {}: {}", status, body));
    }

    response
        .text()
        .await
        .map_err(|e| format!("Failed to read LM Studio load response: {}", e))
}

#[tauri::command]
async fn ai_lmstudio_unload_model(base_url: String, instance_id: String) -> Result<(), String> {
    let root = lmstudio_root_url(&base_url);
    let url = format!("{}/api/v1/models/unload", root);

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let body = serde_json::json!({ "instance_id": instance_id.trim() });

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to unload LM Studio model: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("LM Studio unload error {}: {}", status, body));
    }

    Ok(())
}

#[tauri::command]
async fn ai_exchange_openrouter_oauth_code(code: String, code_verifier: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let body = serde_json::json!({
        "code": code.trim(),
        "code_verifier": code_verifier.trim(),
        "code_challenge_method": "S256",
    });

    let response = client
        .post("https://openrouter.ai/api/v1/auth/keys")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenRouter OAuth exchange failed: {}", e))?;

    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("OpenRouter OAuth exchange failed ({}): {}", status, text));
    }

    Ok(text)
}

#[tauri::command]
async fn ai_openai_device_start(issuer: String, client_id: String) -> Result<String, String> {
    let issuer = issuer.trim().trim_end_matches('/').to_string();
    let client_id = client_id.trim().to_string();
    let url = format!("{}/api/accounts/deviceauth/usercode", issuer);

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(&url)
        .json(&serde_json::json!({ "client_id": client_id }))
        .send()
        .await
        .map_err(|e| format!("OpenAI device auth start failed: {}", e))?;

    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("OpenAI device auth start failed ({}): {}", status, text));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Invalid OpenAI device auth response: {}", e))?;
    let user_code = parsed
        .get("user_code")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let device_auth_id = parsed
        .get("device_auth_id")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let interval = parsed.get("interval").and_then(|v| v.as_i64()).unwrap_or(5);

    let out = serde_json::json!({
        "issuer": issuer,
        "client_id": client_id,
        "verification_url": format!("{}/codex/device", issuer),
        "user_code": user_code,
        "device_auth_id": device_auth_id,
        "interval": if interval > 0 { interval } else { 5 },
    });
    Ok(out.to_string())
}

#[tauri::command]
async fn ai_openai_device_poll(issuer: String, device_auth_id: String, user_code: String) -> Result<String, String> {
    let issuer = issuer.trim().trim_end_matches('/').to_string();
    let url = format!("{}/api/accounts/deviceauth/token", issuer);

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(&url)
        .json(&serde_json::json!({
            "device_auth_id": device_auth_id.trim(),
            "user_code": user_code.trim(),
        }))
        .send()
        .await
        .map_err(|e| format!("OpenAI device auth poll failed: {}", e))?;

    if response.status().as_u16() == 403 || response.status().as_u16() == 404 {
        return Ok(String::new());
    }

    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("OpenAI device auth poll failed ({}): {}", status, text));
    }

    Ok(text)
}

#[tauri::command]
async fn ai_openai_exchange_authorization_code(
    issuer: String,
    client_id: String,
    authorization_code: String,
    code_verifier: String,
    redirect_uri: String,
) -> Result<String, String> {
    let issuer = issuer.trim().trim_end_matches('/').to_string();
    let url = format!("{}/oauth/token", issuer);

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let form: HashMap<&str, String> = HashMap::from([
        ("grant_type", "authorization_code".to_string()),
        ("code", authorization_code.trim().to_string()),
        ("redirect_uri", redirect_uri.trim().to_string()),
        ("client_id", client_id.trim().to_string()),
        ("code_verifier", code_verifier.trim().to_string()),
    ]);

    let response = client
        .post(&url)
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("OpenAI OAuth exchange failed: {}", e))?;

    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("OpenAI OAuth exchange failed ({}): {}", status, text));
    }

    Ok(text)
}

#[tauri::command]
async fn ai_openai_refresh_oauth_token(
    issuer: String,
    client_id: String,
    refresh_token: String,
) -> Result<String, String> {
    let issuer = issuer.trim().trim_end_matches('/').to_string();
    let url = format!("{}/oauth/token", issuer);

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let form: HashMap<&str, String> = HashMap::from([
        ("client_id", client_id.trim().to_string()),
        ("grant_type", "refresh_token".to_string()),
        ("refresh_token", refresh_token.trim().to_string()),
    ]);

    let response = client
        .post(&url)
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("OpenAI OAuth refresh failed: {}", e))?;

    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("OpenAI OAuth refresh failed ({}): {}", status, text));
    }

    Ok(text)
}

#[tauri::command]
async fn ai_chat_stream_openai_codex(
    app: tauri::AppHandle,
    request_id: String,
    base_url: String,
    access_token: String,
    body_json: String,
    client_version: String,
) -> Result<(), String> {
    let base = base_url.trim_end_matches('/');
    let url = format!(
        "{}/responses?client_version={}",
        base,
        client_version.trim()
    );

    let body: serde_json::Value = serde_json::from_str(&body_json)
        .map_err(|e| format!("Invalid request body: {}", e))?;

    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&format!("Bearer {}", access_token.trim()))
            .map_err(|e| format!("Invalid access token format: {}", e))?,
    );
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static("text/event-stream"),
    );

    let client = reqwest::Client::builder()
        .default_headers(headers)
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let err_msg = format!("Request failed: {}", e);
            let _ = app.emit(
                "ai-stream-error",
                AiStreamErrorPayload {
                    request_id: request_id.clone(),
                    error: err_msg.clone(),
                },
            );
            err_msg
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let err_msg = format!("API error {}: {}", status, body);
        let _ = app.emit(
            "ai-stream-error",
            AiStreamErrorPayload {
                request_id: request_id.clone(),
                error: err_msg.clone(),
            },
        );
        return Err(err_msg);
    }

    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(bytes) => {
                buffer.extend_from_slice(&bytes);

                while let Some(newline_pos) = buffer.iter().position(|&b| b == b'\n') {
                    let mut line_bytes: Vec<u8> = buffer.drain(..=newline_pos).collect();

                    if line_bytes.last() == Some(&b'\n') {
                        line_bytes.pop();
                    }
                    if line_bytes.last() == Some(&b'\r') {
                        line_bytes.pop();
                    }
                    if line_bytes.is_empty() {
                        continue;
                    }

                    let line = match String::from_utf8(line_bytes) {
                        Ok(s) => s,
                        Err(_) => {
                            continue;
                        }
                    };

                    if let Some(raw_data) = line.strip_prefix("data:") {
                        let data = raw_data.strip_prefix(' ').unwrap_or(raw_data);

                        if data.trim() == "[DONE]" {
                            let _ = app.emit(
                                "ai-stream-done",
                                AiStreamDonePayload {
                                    request_id: request_id.clone(),
                                },
                            );
                            return Ok(());
                        }

                        let _ = app.emit(
                            "ai-stream-chunk",
                            AiStreamChunkPayload {
                                request_id: request_id.clone(),
                                data: data.to_string(),
                            },
                        );
                    }
                }
            }
            Err(e) => {
                let err_msg = format!("Stream error: {}", e);
                let _ = app.emit(
                    "ai-stream-error",
                    AiStreamErrorPayload {
                        request_id: request_id.clone(),
                        error: err_msg.clone(),
                    },
                );
                return Err(err_msg);
            }
        }
    }

    let _ = app.emit(
        "ai-stream-done",
        AiStreamDonePayload {
            request_id: request_id.clone(),
        },
    );

    Ok(())
}

fn parse_mcp_headers(headers_json: Option<String>) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    if let Some(raw) = headers_json {
        if raw.trim().is_empty() {
            return Ok(headers);
        }

        let parsed: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| format!("Invalid MCP headers JSON: {}", e))?;
        let obj = parsed
            .as_object()
            .ok_or_else(|| "MCP headers must be a JSON object".to_string())?;

        for (k, v) in obj {
            let value = v
                .as_str()
                .ok_or_else(|| format!("MCP header '{}' must be a string", k))?;
            let name =
                HeaderName::from_bytes(k.as_bytes()).map_err(|e| format!("Invalid header name '{}': {}", k, e))?;
            let header_value =
                HeaderValue::from_str(value).map_err(|e| format!("Invalid header value for '{}': {}", k, e))?;
            headers.insert(name, header_value);
        }
    }
    Ok(headers)
}

async fn mcp_post_jsonrpc(
    client: &reqwest::Client,
    url: &str,
    base_headers: &HeaderMap,
    session_id: Option<&str>,
    body: serde_json::Value,
) -> Result<(serde_json::Value, Option<String>), String> {
    let mut headers = base_headers.clone();
    if let Some(sid) = session_id {
        let sid_header = HeaderValue::from_str(sid)
            .map_err(|e| format!("Invalid MCP session id header: {}", e))?;
        headers.insert(HeaderName::from_static("mcp-session-id"), sid_header);
    }

    let response = client
        .post(url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("MCP HTTP request failed: {}", e))?;

    let response_session_id = response
        .headers()
        .get("mcp-session-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read MCP response body: {}", e))?;

    if !status.is_success() {
        return Err(format!("MCP HTTP error {}: {}", status, text));
    }

    let parsed: serde_json::Value = parse_mcp_json_response(&text, body.get("id"))?;

    if let Some(err) = parsed.get("error") {
        return Err(format!("MCP JSON-RPC error: {}", err));
    }

    Ok((parsed, response_session_id))
}

fn parse_mcp_json_response(
    text: &str,
    expected_id: Option<&serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Empty MCP response body".to_string());
    }

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(expected) = expected_id {
            if parsed.get("id") == Some(expected) {
                return Ok(parsed);
            }
        } else {
            return Ok(parsed);
        }

        if parsed.get("result").is_some() || parsed.get("error").is_some() {
            return Ok(parsed);
        }
    }

    let mut frames: Vec<serde_json::Value> = Vec::new();

    for line in trimmed.lines() {
        let line = line.trim();
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let payload = data.trim();
        if payload.is_empty() || payload == "[DONE]" {
            continue;
        }
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(payload) {
            if let Some(expected) = expected_id {
                if parsed.get("id") == Some(expected) {
                    return Ok(parsed);
                }
            } else {
                return Ok(parsed);
            }
            frames.push(parsed);
        }
    }

    if let Some(frame) = frames
        .into_iter()
        .find(|v| v.get("result").is_some() || v.get("error").is_some())
    {
        return Ok(frame);
    }

    Err("Invalid MCP JSON response".to_string())
}

fn push_candidate(candidates: &mut Vec<String>, candidate: String) {
    if !candidate.is_empty() && !candidates.contains(&candidate) {
        candidates.push(candidate);
    }
}

fn mcp_endpoint_candidates(server_url: &str) -> Vec<String> {
    let raw = server_url.trim();
    if raw.is_empty() {
        return vec![];
    }

    let mut candidates = Vec::new();
    let normalized = raw.trim_end_matches('/').to_string();
    push_candidate(&mut candidates, normalized.clone());

    if let Ok(url) = reqwest::Url::parse(raw) {
        let path = url.path().trim_end_matches('/');

        if path.is_empty() || path == "/" {
            for suffix in ["/mcp", "/rpc", "/api/mcp"] {
                let mut candidate = url.clone();
                candidate.set_path(suffix);
                push_candidate(
                    &mut candidates,
                    candidate.to_string().trim_end_matches('/').to_string(),
                );
            }
        } else if !path.ends_with("/mcp") {
            let mut candidate = url.clone();
            candidate.set_path(&format!("{}/mcp", path));
            push_candidate(
                &mut candidates,
                candidate.to_string().trim_end_matches('/').to_string(),
            );
        }
    }

    candidates
}

async fn mcp_try_initialize_at_endpoint(
    client: &reqwest::Client,
    server_url: &str,
    headers: &HeaderMap,
    protocol_version: &str,
) -> Result<Option<String>, String> {
    let init_body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "assistantos-init",
        "method": "initialize",
        "params": {
            "protocolVersion": protocol_version,
            "capabilities": {},
            "clientInfo": {
                "name": "AssistantOS",
                "version": "1.0.6"
            }
        }
    });

    let (_init_response, mut session_id) =
        mcp_post_jsonrpc(client, server_url, headers, None, init_body).await?;

    let initialized_body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
        "params": {}
    });

    if let Ok((_, sid)) =
        mcp_post_jsonrpc(client, server_url, headers, session_id.as_deref(), initialized_body).await
    {
        if sid.is_some() {
            session_id = sid;
        }
    }

    Ok(session_id)
}

async fn mcp_initialize_session(
    server_url: &str,
    auth_token: Option<String>,
    headers_json: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<(reqwest::Client, HeaderMap, Option<String>, String), String> {
    let mut headers = parse_mcp_headers(headers_json)?;
    if let Some(token) = auth_token {
        if !token.trim().is_empty() {
            let auth = HeaderValue::from_str(&format!("Bearer {}", token.trim()))
                .map_err(|e| format!("Invalid MCP auth token: {}", e))?;
            headers.insert(AUTHORIZATION, auth);
        }
    }

    headers.insert(
        HeaderName::from_static("accept"),
        HeaderValue::from_static("application/json, text/event-stream"),
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout_ms.unwrap_or(20000)))
        .build()
        .map_err(|e| format!("Failed to create MCP HTTP client: {}", e))?;

    let endpoints = mcp_endpoint_candidates(server_url);
    if endpoints.is_empty() {
        return Err("MCP server URL is empty".to_string());
    }

    let protocol_versions = ["2024-11-05", "2024-10-07"];
    let mut errors = Vec::new();

    for endpoint in endpoints {
        for protocol_version in protocol_versions {
            match mcp_try_initialize_at_endpoint(&client, &endpoint, &headers, protocol_version).await {
                Ok(session_id) => {
                    return Ok((client, headers, session_id, endpoint));
                }
                Err(err) => {
                    errors.push(format!(
                        "endpoint={} protocolVersion={} error={}",
                        endpoint, protocol_version, err
                    ));
                }
            }
        }
    }

    Err(format!(
        "Failed to initialize MCP session. Tried endpoints and protocol versions: {}",
        errors.join(" | ")
    ))
}

#[tauri::command]
async fn mcp_list_tools(
    server_url: String,
    auth_token: Option<String>,
    headers_json: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<String, String> {
    let (client, headers, session_id, resolved_url) =
        mcp_initialize_session(&server_url, auth_token, headers_json, timeout_ms).await?;

    let tools_body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "assistantos-tools-list",
        "method": "tools/list",
        "params": {}
    });

    let (resp, _) =
        mcp_post_jsonrpc(&client, &resolved_url, &headers, session_id.as_deref(), tools_body).await?;

    let tools = resp
        .get("result")
        .and_then(|r| r.get("tools"))
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]));

    Ok(serde_json::json!({ "tools": tools }).to_string())
}

#[tauri::command]
async fn mcp_call_tool(
    server_url: String,
    tool_name: String,
    arguments_json: String,
    auth_token: Option<String>,
    headers_json: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<String, String> {
    let (client, headers, session_id, resolved_url) =
        mcp_initialize_session(&server_url, auth_token, headers_json, timeout_ms).await?;

    let args_value: serde_json::Value = if arguments_json.trim().is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(&arguments_json)
            .map_err(|e| format!("Invalid MCP tool arguments JSON: {}", e))?
    };

    let call_body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "assistantos-tools-call",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": args_value
        }
    });

    let (resp, _) =
        mcp_post_jsonrpc(&client, &resolved_url, &headers, session_id.as_deref(), call_body).await?;

    Ok(resp
        .get("result")
        .cloned()
        .unwrap_or(resp)
        .to_string())
}

// ── Stdio MCP Server Management ─────────────────────────────────────

struct StdioMcpSession {
    alive: Arc<AtomicBool>,
    next_id: Arc<AtomicU64>,
    stdin_tx: tokio::sync::mpsc::Sender<Vec<u8>>,
    pending: Arc<tokio::sync::Mutex<HashMap<u64, tokio::sync::oneshot::Sender<serde_json::Value>>>>,
}

#[derive(Default)]
struct StdioMcpState {
    sessions: Arc<tokio::sync::Mutex<HashMap<String, StdioMcpSession>>>,
}

#[tauri::command]
async fn stdio_mcp_spawn(
    server_id: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    state: tauri::State<'_, StdioMcpState>,
) -> Result<(), String> {
    // Remove any existing dead session, reject if still alive
    {
        let mut sessions = state.sessions.lock().await;
        if let Some(existing) = sessions.get(&server_id) {
            if existing.alive.load(Ordering::Relaxed) {
                return Err(format!("Stdio MCP session already running: {}", server_id));
            }
            // Dead session, clean it up
            sessions.remove(&server_id);
        }
    }

    // Build the shell command string from command + args
    let full_command = if args.is_empty() {
        command.clone()
    } else {
        format!("{} {}", command, args.join(" "))
    };

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = tokio::process::Command::new("cmd.exe");
        c.arg("/C").arg(&full_command);
        c
    } else {
        let mut c = tokio::process::Command::new("bash");
        c.arg("-lc").arg(&full_command);
        c
    };

    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // Add custom environment variables
    for (k, v) in &env {
        cmd.env(k, v);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn stdio MCP server: {}", e))?;

    let stdout = child.stdout.take()
        .ok_or_else(|| "Failed to capture stdout from MCP server".to_string())?;
    let mut stdin = child.stdin.take()
        .ok_or_else(|| "Failed to capture stdin of MCP server".to_string())?;

    let alive = Arc::new(AtomicBool::new(true));
    let next_id = Arc::new(AtomicU64::new(1));
    let pending: Arc<tokio::sync::Mutex<HashMap<u64, tokio::sync::oneshot::Sender<serde_json::Value>>>> =
        Arc::new(tokio::sync::Mutex::new(HashMap::new()));

    // Channel for writing to stdin (serializes writes)
    let (stdin_tx, mut stdin_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(64);

    // Stdin writer task
    let alive_w = Arc::clone(&alive);
    tokio::spawn(async move {
        use tokio::io::AsyncWriteExt;
        while let Some(data) = stdin_rx.recv().await {
            if !alive_w.load(Ordering::Relaxed) {
                break;
            }
            if stdin.write_all(&data).await.is_err() {
                break;
            }
            if stdin.flush().await.is_err() {
                break;
            }
        }
    });

    // Stdout reader task - reads newline-delimited JSON-RPC
    let alive_r = Arc::clone(&alive);
    let pending_r = Arc::clone(&pending);
    let server_id_r = server_id.clone();
    tokio::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while alive_r.load(Ordering::Relaxed) {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    let trimmed = line.trim().to_string();
                    if trimmed.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<serde_json::Value>(&trimmed) {
                        Ok(msg) => {
                            // If it has an ID, it's a response to a request
                            if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
                                let mut pend = pending_r.lock().await;
                                if let Some(sender) = pend.remove(&id) {
                                    let _ = sender.send(msg);
                                }
                            }
                            // Notifications (no id) are silently ignored for now
                        }
                        Err(e) => {
                            eprintln!(
                                "Stdio MCP {} received non-JSON line: {} (error: {})",
                                server_id_r, trimmed, e
                            );
                        }
                    }
                }
                Ok(None) => {
                    // EOF - process exited
                    alive_r.store(false, Ordering::Relaxed);
                    break;
                }
                Err(e) => {
                    eprintln!("Stdio MCP {} reader error: {}", server_id_r, e);
                    alive_r.store(false, Ordering::Relaxed);
                    break;
                }
            }
        }

        // Clean up any remaining pending requests
        let mut pend = pending_r.lock().await;
        for (_, sender) in pend.drain() {
            let _ = sender.send(serde_json::json!({"error": {"code": -1, "message": "MCP server process exited"}}));
        }
    });

    // Stderr reader task (just log it)
    if let Some(stderr) = child.stderr.take() {
        let server_id_e = server_id.clone();
        tokio::spawn(async move {
            use tokio::io::{AsyncBufReadExt, BufReader};
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("Stdio MCP {} stderr: {}", server_id_e, line);
            }
        });
    }

    // Send initialize request before storing session
    let init_result = stdio_mcp_send_request_inner(
        &stdin_tx,
        &pending,
        &alive,
        &next_id,
        "initialize",
        serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "AssistantOS",
                "version": "1.0.0"
            }
        }),
    )
    .await;

    match init_result {
        Ok(_) => {
            // Send initialized notification (no id, no response expected)
            let notification = serde_json::json!({
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
                "params": {}
            });
            let mut data = serde_json::to_string(&notification)
                .map_err(|e| format!("Failed to serialize notification: {}", e))?;
            data.push('\n');
            if stdin_tx.send(data.into_bytes()).await.is_err() {
                alive.store(false, Ordering::Relaxed);
                return Err("Failed to send initialized notification to MCP server".to_string());
            }

            // Store session only after successful init
            let session = StdioMcpSession {
                alive: Arc::clone(&alive),
                next_id,
                stdin_tx: stdin_tx.clone(),
                pending: Arc::clone(&pending),
            };
            {
                let mut sessions = state.sessions.lock().await;
                sessions.insert(server_id.clone(), session);
            }
            Ok(())
        }
        Err(e) => {
            alive.store(false, Ordering::Relaxed);
            Err(format!("Failed to initialize stdio MCP server: {}", e))
        }
    }
}

async fn stdio_mcp_send_request_inner(
    stdin_tx: &tokio::sync::mpsc::Sender<Vec<u8>>,
    pending: &Arc<tokio::sync::Mutex<HashMap<u64, tokio::sync::oneshot::Sender<serde_json::Value>>>>,
    alive: &Arc<AtomicBool>,
    next_id: &Arc<AtomicU64>,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    if !alive.load(Ordering::Relaxed) {
        return Err("Stdio MCP server is not running".to_string());
    }

    let id = next_id.fetch_add(1, Ordering::Relaxed);
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    });

    let (tx, rx) = tokio::sync::oneshot::channel();
    {
        let mut pend = pending.lock().await;
        pend.insert(id, tx);
    }

    let mut data = serde_json::to_string(&request)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;
    data.push('\n');

    stdin_tx
        .send(data.into_bytes())
        .await
        .map_err(|_| "Failed to write to MCP server stdin".to_string())?;

    // Wait for response with timeout
    match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
        Ok(Ok(response)) => {
            if let Some(err) = response.get("error") {
                Err(format!("MCP JSON-RPC error: {}", err))
            } else {
                Ok(response)
            }
        }
        Ok(Err(_)) => Err("MCP response channel closed".to_string()),
        Err(_) => {
            // Remove from pending on timeout
            let mut pend = pending.lock().await;
            pend.remove(&id);
            Err("MCP request timed out".to_string())
        }
    }
}

#[tauri::command]
async fn stdio_mcp_stop(
    server_id: String,
    state: tauri::State<'_, StdioMcpState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    if let Some(session) = sessions.remove(&server_id) {
        session.alive.store(false, Ordering::Relaxed);
        Ok(())
    } else {
        Ok(()) // Already stopped, not an error
    }
}

#[tauri::command]
async fn stdio_mcp_list_tools(
    server_id: String,
    state: tauri::State<'_, StdioMcpState>,
) -> Result<String, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&server_id)
        .ok_or_else(|| format!("No stdio MCP session: {}", server_id))?;

    let response = stdio_mcp_send_request_inner(
        &session.stdin_tx,
        &session.pending,
        &session.alive,
        &session.next_id,
        "tools/list",
        serde_json::json!({}),
    )
    .await?;

    let tools = response
        .get("result")
        .and_then(|r| r.get("tools"))
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]));

    Ok(serde_json::json!({ "tools": tools }).to_string())
}

#[tauri::command]
async fn stdio_mcp_call_tool(
    server_id: String,
    tool_name: String,
    arguments_json: String,
    state: tauri::State<'_, StdioMcpState>,
) -> Result<String, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&server_id)
        .ok_or_else(|| format!("No stdio MCP session: {}", server_id))?;

    let args_value: serde_json::Value = if arguments_json.trim().is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(&arguments_json)
            .map_err(|e| format!("Invalid MCP tool arguments JSON: {}", e))?
    };

    let response = stdio_mcp_send_request_inner(
        &session.stdin_tx,
        &session.pending,
        &session.alive,
        &session.next_id,
        "tools/call",
        serde_json::json!({
            "name": tool_name,
            "arguments": args_value,
        }),
    )
    .await?;

    Ok(response
        .get("result")
        .cloned()
        .unwrap_or(response)
        .to_string())
}

#[tauri::command]
async fn stdio_mcp_status(
    server_id: String,
    state: tauri::State<'_, StdioMcpState>,
) -> Result<String, String> {
    let sessions = state.sessions.lock().await;
    if let Some(session) = sessions.get(&server_id) {
        if session.alive.load(Ordering::Relaxed) {
            Ok("running".to_string())
        } else {
            Ok("stopped".to_string())
        }
    } else {
        Ok("stopped".to_string())
    }
}

// ── Command Execution ───────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct CommandResult {
    stdout: String,
    stderr: String,
    exit_code: i32,
}

#[tauri::command]
async fn run_command_sync(
    command: String,
    cwd: String,
    timeout_ms: Option<u64>,
) -> Result<CommandResult, String> {
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(30000));

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = tokio::process::Command::new("powershell.exe");
        c.arg("-Command").arg(&command);
        c
    } else {
        let mut c = tokio::process::Command::new("bash");
        c.arg("-c").arg(&command);
        c
    };

    cmd.current_dir(&cwd);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // Hide the console window on Windows so it doesn't flash on screen
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    // Ensure the child process is killed if the future is dropped (e.g. on timeout)
    cmd.kill_on_drop(true);

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let wait_fut = child.wait_with_output();

    match tokio::time::timeout(timeout, wait_fut).await {
        Ok(result) => {
            let output = result.map_err(|e| format!("Failed to wait for command: {}", e))?;
            Ok(CommandResult {
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                exit_code: output.status.code().unwrap_or(-1),
            })
        }
        Err(_) => {
            // Timeout: dropping the future drops the Child, which kills it (kill_on_drop)
            Err("Command timed out".to_string())
        }
    }
}

// ── Chat Session Persistence ────────────────────────────────────────

/// Sanitize session_id to prevent path traversal attacks.
/// Only allows alphanumeric chars, hyphens, and underscores.
fn sanitize_session_id(id: &str) -> Result<String, String> {
    if id.is_empty() {
        return Err("Session ID cannot be empty".to_string());
    }
    if id.len() > 128 {
        return Err("Session ID too long".to_string());
    }
    if !id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err(format!("Invalid session ID: {}", id));
    }
    Ok(id.to_string())
}

#[tauri::command]
fn save_chat_session(app: tauri::AppHandle, session_id: String, data: String) -> Result<(), String> {
    let session_id = sanitize_session_id(&session_id)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let chats_dir = app_data_dir.join("chats");
    fs::create_dir_all(&chats_dir)
        .map_err(|e| format!("Failed to create chats dir: {}", e))?;

    let file_path = chats_dir.join(format!("{}.json", session_id));
    fs::write(&file_path, data)
        .map_err(|e| format!("Failed to write chat session: {}", e))
}

#[tauri::command]
fn load_chat_session(app: tauri::AppHandle, session_id: String) -> Result<String, String> {
    let session_id = sanitize_session_id(&session_id)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let file_path = app_data_dir.join("chats").join(format!("{}.json", session_id));

    if !file_path.exists() {
        return Err(format!("Chat session not found: {}", session_id));
    }

    fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read chat session: {}", e))
}

#[tauri::command]
fn list_chat_sessions(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let chats_dir = app_data_dir.join("chats");

    if !chats_dir.exists() {
        return Ok(vec![]);
    }

    let entries = fs::read_dir(&chats_dir)
        .map_err(|e| format!("Failed to read chats dir: {}", e))?;

    let mut session_ids: Vec<String> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_string())
            } else {
                None
            }
        })
        .collect();

    session_ids.sort();
    Ok(session_ids)
}

#[tauri::command]
fn delete_chat_session(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    let session_id = sanitize_session_id(&session_id)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let file_path = app_data_dir.join("chats").join(format!("{}.json", session_id));

    if !file_path.exists() {
        return Err(format!("Chat session not found: {}", session_id));
    }

    fs::remove_file(&file_path)
        .map_err(|e| format!("Failed to delete chat session: {}", e))
}

// ── App Entry ────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TerminalState::default())
        .manage(ClaudeCodeState::default())
        .manage(StdioMcpState::default())
        .manage(WatcherState {
            watcher: Arc::new(Mutex::new(None)),
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_directory_tree,
            read_directory_children,
            read_file_text,
            read_file_binary,
            write_file_text,
            create_file,
            import_paths,
            rename_path,
            delete_path,
            search_files,
            get_file_info,
            list_all_files,
            spawn_terminal,
            write_terminal,
            resize_terminal,
            close_terminal,
            start_watcher,
            stop_watcher,
            save_app_state,
            load_app_state,
            ai_chat_stream,
            ai_chat_stream_anthropic,
            ai_chat_stream_openai_codex,
            ai_fetch_models,
            ai_lmstudio_load_model,
            ai_lmstudio_unload_model,
            ai_exchange_openrouter_oauth_code,
            ai_openai_device_start,
            ai_openai_device_poll,
            ai_openai_exchange_authorization_code,
            ai_openai_refresh_oauth_token,
            mcp_list_tools,
            mcp_call_tool,
            stdio_mcp_spawn,
            stdio_mcp_stop,
            stdio_mcp_list_tools,
            stdio_mcp_call_tool,
            stdio_mcp_status,
            run_command_sync,
            save_chat_session,
            load_chat_session,
            list_chat_sessions,
            delete_chat_session,
            spawn_claude_code,
            write_claude_code,
            close_claude_code,
        ])
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
