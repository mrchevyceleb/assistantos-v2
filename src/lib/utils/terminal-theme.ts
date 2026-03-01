export type TerminalStylePreset = "metal" | "minimal" | "retro" | "high-contrast";

const BASE_THEME = {
  background: "#0c0c14",
  foreground: "#e2e8f0",
  cursor: "#58b4d0",
  cursorAccent: "#0c0c14",
  selectionBackground: "#585b7066",
  selectionForeground: "#e2e8f0",
  black: "#45475a",
  red: "#f87171",
  green: "#34d399",
  yellow: "#fbbf24",
  blue: "#58b4d0",
  magenta: "#f5c2e7",
  cyan: "#22d3ee",
  white: "#e2e8f0",
  brightBlack: "#585b70",
  brightRed: "#f87171",
  brightGreen: "#34d399",
  brightYellow: "#fbbf24",
  brightBlue: "#58b4d0",
  brightMagenta: "#f5c2e7",
  brightCyan: "#22d3ee",
  brightWhite: "#94a3b8",
};

const THEME_BY_PRESET: Record<TerminalStylePreset, typeof BASE_THEME> = {
  metal: BASE_THEME,
  minimal: {
    ...BASE_THEME,
    background: "#0a0b10",
    selectionBackground: "#33415566",
  },
  retro: {
    ...BASE_THEME,
    background: "#0a140e",
    foreground: "#8df3b4",
    cursor: "#8df3b4",
    cursorAccent: "#0a140e",
    selectionBackground: "#1f6f3f66",
    blue: "#5eead4",
    brightBlue: "#5eead4",
  },
  "high-contrast": {
    ...BASE_THEME,
    background: "#050507",
    foreground: "#f8fafc",
    cursor: "#f8fafc",
    cursorAccent: "#050507",
    selectionBackground: "#ffffff44",
  },
};

export function getTerminalTheme(preset: TerminalStylePreset) {
  return THEME_BY_PRESET[preset] || BASE_THEME;
}

export const TERM_THEME = BASE_THEME;
