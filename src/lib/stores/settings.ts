import { writable } from "svelte/store";

// ── Types ────────────────────────────────────────────────────────────

export interface AppSettings {
  defaultTerminalDock: "bottom" | "right" | "tab" | "left";
  terminalStylePreset: "metal" | "minimal" | "retro" | "high-contrast";
  defaultShell: "auto" | "powershell" | "bash" | "cmd";
  terminalFontSize: number;
  terminalCursorStyle: "block" | "underline" | "bar";
  editorFontSize: number;
  tabSize: number;
  wordWrap: boolean;
  autoSaveDelay: number;
  theme: string;
  showHiddenFiles: boolean;
  restoreSession: boolean;
  confirmCloseUnsaved: boolean;
  aiProvider: "openrouter" | "anthropic" | "openai";
  aiAuthMode: "apiKey" | "oauth";
  aiApiKey: string;
  aiOpenRouterApiKey: string;
  aiAnthropicApiKey: string;
  aiOpenAIApiKey: string;
  aiModel: string;
  aiBaseUrl: string;
  aiOpenRouterBaseUrl: string;
  aiAnthropicBaseUrl: string;
  aiOpenAIBaseUrl: string;
  aiTemperature: number;
  aiMaxTokens: number;
  aiEnableToolUse: boolean;
  aiConfirmWrites: boolean;
  aiYoloMode: boolean;
  aiMaxToolIterations: number;
  aiFavoriteModels: string[];
  aiChatDock: "right" | "bottom" | "tab";
  aiReadInstructionsEveryMessage: boolean;
  aiEnableAtMentions: boolean;
  aiSlashCommandDirs: string[];
  aiThinkingMode: "all" | "preview" | "none";
  mcpServers: MCPServerConfig[];
}

export interface MCPServerConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  authToken: string;
  headersJson: string;
  timeoutMs: number;
}

// ── Defaults ─────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AppSettings = {
  defaultTerminalDock: "bottom",
  terminalStylePreset: "metal",
  defaultShell: "auto",
  terminalFontSize: 14,
  terminalCursorStyle: "bar",
  editorFontSize: 14,
  tabSize: 2,
  wordWrap: false,
  autoSaveDelay: 2000,
  theme: "catppuccin-mocha",
  showHiddenFiles: false,
  restoreSession: true,
  confirmCloseUnsaved: true,
  aiProvider: "openrouter",
  aiAuthMode: "apiKey",
  aiApiKey: '',
  aiOpenRouterApiKey: '',
  aiAnthropicApiKey: '',
  aiOpenAIApiKey: '',
  aiModel: 'anthropic/claude-sonnet-4',
  aiBaseUrl: 'https://openrouter.ai/api/v1',
  aiOpenRouterBaseUrl: 'https://openrouter.ai/api/v1',
  aiAnthropicBaseUrl: 'https://api.anthropic.com/v1',
  aiOpenAIBaseUrl: 'https://api.openai.com/v1',
  aiTemperature: 0.7,
  aiMaxTokens: 16384,
  aiEnableToolUse: true,
  aiConfirmWrites: true,
  aiYoloMode: false,
  aiMaxToolIterations: 25,
  aiChatDock: "bottom",
  aiReadInstructionsEveryMessage: true,
  aiEnableAtMentions: true,
  aiSlashCommandDirs: [],
  aiThinkingMode: "preview",
  aiFavoriteModels: [
    'anthropic/claude-sonnet-4',
    'anthropic/claude-opus-4',
    'openai/gpt-4.1',
    'google/gemini-2.5-pro-preview',
  ],
  mcpServers: [],
};

// ── Stores ───────────────────────────────────────────────────────────

export const settings = writable<AppSettings>({ ...DEFAULT_SETTINGS });

/** Whether the settings modal is visible */
export const settingsVisible = writable(false);

// ── Helpers ──────────────────────────────────────────────────────────

/** Update a single setting by key */
export function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
) {
  settings.update((s) => ({ ...s, [key]: value }));
}

export function getActiveAIKey(s: AppSettings): string {
  if (s.aiProvider === "anthropic") return (s.aiAnthropicApiKey || "").trim();
  if (s.aiProvider === "openai") return (s.aiOpenAIApiKey || "").trim();
  return (s.aiOpenRouterApiKey || s.aiApiKey || "").trim();
}

export function getActiveAIBaseUrl(s: AppSettings): string {
  if (s.aiProvider === "anthropic") {
    return (s.aiAnthropicBaseUrl || "https://api.anthropic.com/v1").trim();
  }
  if (s.aiProvider === "openai") {
    return (s.aiOpenAIBaseUrl || "https://api.openai.com/v1").trim();
  }
  return (s.aiOpenRouterBaseUrl || s.aiBaseUrl || "https://openrouter.ai/api/v1").trim();
}
