import { invoke } from "@tauri-apps/api/core";

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  ext?: string;
  children?: FileNode[];
}

export interface SearchResult {
  path: string;
  line_number: number;
  line_content: string;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  ext?: string;
  modified?: number;
}

export async function readDirectoryTree(
  path: string,
  showHidden: boolean = false
): Promise<FileNode> {
  return invoke("read_directory_tree", { path, showHidden });
}

export async function readDirectoryChildren(
  path: string,
  showHidden: boolean = false
): Promise<FileNode[]> {
  return invoke("read_directory_children", { path, showHidden });
}

export async function readFileText(path: string): Promise<string> {
  return invoke("read_file_text", { path });
}

export async function readFileBinary(path: string): Promise<number[]> {
  return invoke("read_file_binary", { path });
}

export async function writeFileText(
  path: string,
  content: string
): Promise<void> {
  return invoke("write_file_text", { path, content });
}

export async function createFile(
  path: string,
  isDir: boolean
): Promise<void> {
  return invoke("create_file", { path, isDir });
}

export async function renamePath(
  oldPath: string,
  newPath: string
): Promise<void> {
  return invoke("rename_path", { oldPath, newPath });
}

export async function deletePath(path: string): Promise<void> {
  return invoke("delete_path", { path });
}

export async function searchFiles(
  root: string,
  query: string,
  caseSensitive: boolean = false,
  showHidden: boolean = false
): Promise<SearchResult[]> {
  return invoke("search_files", { root, query, caseSensitive, showHidden });
}

export async function getFileInfo(path: string): Promise<FileInfo> {
  return invoke("get_file_info", { path });
}

export interface FileEntry {
  name: string;
  path: string;
  relative_path: string;
  ext?: string;
}

export async function listAllFiles(
  root: string,
  showHidden: boolean = false
): Promise<FileEntry[]> {
  return invoke("list_all_files", { root, showHidden });
}

// ── Terminal PTY wrappers ────────────────────────────────────────────

export async function spawnTerminal(
  id: string,
  cwd: string,
  rows: number,
  cols: number,
  shell: string = "auto"
): Promise<void> {
  return invoke("spawn_terminal", { id, cwd, rows, cols, shell });
}

export async function writeTerminal(
  id: string,
  data: string
): Promise<void> {
  return invoke("write_terminal", { id, data });
}

export async function resizeTerminal(
  id: string,
  rows: number,
  cols: number
): Promise<void> {
  return invoke("resize_terminal", { id, rows, cols });
}

export async function closeTerminal(id: string): Promise<void> {
  return invoke("close_terminal", { id });
}

// ── File Watcher wrappers ───────────────────────────────────────────

export async function startWatcher(path: string): Promise<void> {
  return invoke("start_watcher", { path });
}

export async function stopWatcher(): Promise<void> {
  return invoke("stop_watcher");
}

// ── App State Persistence wrappers ──────────────────────────────────

export async function saveAppState(stateJson: string): Promise<void> {
  return invoke("save_app_state", { stateJson });
}

export async function loadAppState(): Promise<string> {
  return invoke("load_app_state");
}
