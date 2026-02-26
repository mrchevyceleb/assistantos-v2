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
