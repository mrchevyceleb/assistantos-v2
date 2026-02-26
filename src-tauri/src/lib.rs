use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use walkdir::WalkDir;

use futures_util::StreamExt;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
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
fn search_files(
    root: String,
    query: String,
    case_sensitive: bool,
    show_hidden: bool,
) -> Result<Vec<SearchResult>, String> {
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
                            return Ok(results);
                        }
                    }
                }
            }
        }
    }

    Ok(results)
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
    let client = reqwest::Client::new();
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let api_key = api_key.trim().to_string();

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", "https://assistantos.app")
        .header("X-Title", "AssistantOS")
        .body(body_json)
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
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                buffer.push_str(&text);

                // Process complete lines from the buffer
                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();

                    if line.is_empty() {
                        continue;
                    }

                    if let Some(data) = line.strip_prefix("data: ") {
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
async fn ai_fetch_models(base_url: String, api_key: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/models", base_url.trim_end_matches('/'));
    let api_key = api_key.trim().to_string();

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("HTTP-Referer", "https://assistantos.app")
        .header("X-Title", "AssistantOS")
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
            ai_fetch_models,
            run_command_sync,
            save_chat_session,
            load_chat_session,
            list_chat_sessions,
            delete_chat_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
