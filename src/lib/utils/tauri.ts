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

export async function importPaths(
  paths: string[],
  destinationDir: string,
  moveItems: boolean,
): Promise<string[]> {
  return invoke("import_paths", { paths, destinationDir, moveItems });
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

// ── AI Chat wrappers ────────────────────────────────────────────────

export interface CommandResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export async function aiChatStream(
  requestId: string,
  baseUrl: string,
  apiKey: string,
  bodyJson: string,
): Promise<void> {
  return invoke("ai_chat_stream", { requestId, baseUrl, apiKey, bodyJson });
}

export async function aiChatStreamAnthropic(
  requestId: string,
  baseUrl: string,
  apiKey: string,
  bodyJson: string,
): Promise<void> {
  return invoke("ai_chat_stream_anthropic", { requestId, baseUrl, apiKey, bodyJson });
}

export async function aiFetchModels(
  baseUrl: string,
  apiKey: string,
): Promise<string> {
  return invoke("ai_fetch_models", { baseUrl, apiKey });
}

export async function aiLMStudioLoadModel(
  baseUrl: string,
  model: string,
): Promise<string> {
  return invoke("ai_lmstudio_load_model", { baseUrl, model });
}

export async function aiLMStudioUnloadModel(
  baseUrl: string,
  instanceId: string,
): Promise<void> {
  return invoke("ai_lmstudio_unload_model", { baseUrl, instanceId });
}

export async function aiExchangeOpenRouterOAuthCode(
  code: string,
  codeVerifier: string,
): Promise<string> {
  return invoke("ai_exchange_openrouter_oauth_code", { code, codeVerifier });
}

export async function aiOpenAIDeviceStart(
  issuer: string,
  clientId: string,
): Promise<string> {
  return invoke("ai_openai_device_start", { issuer, clientId });
}

export async function aiOpenAIDevicePoll(
  issuer: string,
  deviceAuthId: string,
  userCode: string,
): Promise<string> {
  return invoke("ai_openai_device_poll", { issuer, deviceAuthId, userCode });
}

export async function aiOpenAIExchangeAuthorizationCode(
  issuer: string,
  clientId: string,
  authorizationCode: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<string> {
  return invoke("ai_openai_exchange_authorization_code", {
    issuer,
    clientId,
    authorizationCode,
    codeVerifier,
    redirectUri,
  });
}

export async function aiOpenAIRefreshOAuthToken(
  issuer: string,
  clientId: string,
  refreshToken: string,
): Promise<string> {
  return invoke("ai_openai_refresh_oauth_token", { issuer, clientId, refreshToken });
}

export async function aiChatStreamOpenAICodex(
  requestId: string,
  baseUrl: string,
  accessToken: string,
  bodyJson: string,
  clientVersion: string,
): Promise<void> {
  return invoke("ai_chat_stream_openai_codex", {
    requestId,
    baseUrl,
    accessToken,
    bodyJson,
    clientVersion,
  });
}

export async function runCommandSync(
  command: string,
  cwd: string,
  timeoutMs?: number,
): Promise<CommandResult> {
  return invoke("run_command_sync", { command, cwd, timeoutMs });
}

export async function saveChatSession(
  sessionId: string,
  data: string,
): Promise<void> {
  return invoke("save_chat_session", { sessionId, data });
}

export async function loadChatSession(
  sessionId: string,
): Promise<string> {
  return invoke("load_chat_session", { sessionId });
}

export async function listChatSessions(): Promise<string[]> {
  return invoke("list_chat_sessions");
}

export async function deleteChatSession(
  sessionId: string,
): Promise<void> {
  return invoke("delete_chat_session", { sessionId });
}

// ── Claude Code wrappers ────────────────────────────────────────────

export async function spawnClaudeCode(
  id: string,
  cwd: string,
  args: string[] = [],
  prompt?: string,
): Promise<void> {
  return invoke("spawn_claude_code", { id, cwd, args, prompt: prompt ?? null });
}

export async function closeClaudeCode(id: string): Promise<void> {
  return invoke("close_claude_code", { id });
}

export async function writeClaudeCode(
  id: string,
  message: string,
): Promise<void> {
  return invoke("write_claude_code", { id, message });
}

// ── MCP HTTP wrappers ───────────────────────────────────────────────

export async function mcpListTools(
  serverUrl: string,
  authToken?: string,
  headersJson?: string,
  timeoutMs?: number,
): Promise<string> {
  return invoke("mcp_list_tools", { serverUrl, authToken, headersJson, timeoutMs });
}

export async function mcpCallTool(
  serverUrl: string,
  toolName: string,
  argumentsJson: string,
  authToken?: string,
  headersJson?: string,
  timeoutMs?: number,
): Promise<string> {
  return invoke("mcp_call_tool", {
    serverUrl,
    toolName,
    argumentsJson,
    authToken,
    headersJson,
    timeoutMs,
  });
}

// ── Stdio MCP wrappers ─────────────────────────────────────────────

export async function stdioMcpSpawn(
  serverId: string,
  command: string,
  args: string[],
  env: Record<string, string>,
): Promise<void> {
  return invoke("stdio_mcp_spawn", { serverId, command, args, env });
}

export async function stdioMcpStop(serverId: string): Promise<void> {
  return invoke("stdio_mcp_stop", { serverId });
}

export async function stdioMcpListTools(serverId: string): Promise<string> {
  return invoke("stdio_mcp_list_tools", { serverId });
}

export async function stdioMcpCallTool(
  serverId: string,
  toolName: string,
  argumentsJson: string,
): Promise<string> {
  return invoke("stdio_mcp_call_tool", { serverId, toolName, argumentsJson });
}

export async function stdioMcpStatus(serverId: string): Promise<string> {
  return invoke("stdio_mcp_status", { serverId });
}

// ── Browser Webview ──────────────────────────────────────────────────

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

export async function createBrowserWebview(
  id: string,
  url: string,
  bounds: BrowserBounds,
): Promise<void> {
  return invoke("create_browser_webview", { id, url, bounds });
}

export async function navigateBrowser(id: string, url: string): Promise<void> {
  return invoke("navigate_browser", { id, url });
}

export async function setBrowserBounds(
  id: string,
  bounds: BrowserBounds,
): Promise<void> {
  return invoke("set_browser_bounds", { id, bounds });
}

export async function showBrowser(id: string): Promise<void> {
  return invoke("show_browser", { id });
}

export async function hideBrowser(id: string): Promise<void> {
  return invoke("hide_browser", { id });
}

export async function closeBrowserWebview(id: string): Promise<void> {
  return invoke("close_browser_webview", { id });
}

export async function reloadBrowser(id: string): Promise<void> {
  return invoke("reload_browser", { id });
}
