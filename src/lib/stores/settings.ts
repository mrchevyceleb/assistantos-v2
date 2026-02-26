import { writable } from "svelte/store";

// ── Types ────────────────────────────────────────────────────────────

export interface AppSettings {
  defaultTerminalDock: "bottom" | "right" | "tab" | "left";
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
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl: string;
  aiTemperature: number;
  aiMaxTokens: number;
  aiEnableToolUse: boolean;
  aiConfirmWrites: boolean;
  aiMaxToolIterations: number;
  aiFavoriteModels: string[];
}

// ── Defaults ─────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AppSettings = {
  defaultTerminalDock: "bottom",
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
  aiApiKey: '',
  aiModel: 'anthropic/claude-sonnet-4',
  aiBaseUrl: 'https://openrouter.ai/api/v1',
  aiTemperature: 0.7,
  aiMaxTokens: 16384,
  aiEnableToolUse: true,
  aiConfirmWrites: true,
  aiMaxToolIterations: 25,
  aiFavoriteModels: [
    'anthropic/claude-sonnet-4',
    'anthropic/claude-opus-4',
    'openai/gpt-4.1',
    'google/gemini-2.5-pro-preview',
  ],
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
