import { get } from "svelte/store";
import { saveAppState, loadAppState, readFileText } from "$lib/utils/tauri";
import {
  workspacePath,
  sidebarWidth,
  sidebarVisible,
  expandedPaths,
} from "$lib/stores/workspace";
import {
  tabs,
  activeTabId,
  openTab,
  updateTabContent,
} from "$lib/stores/tabs";
import { terminalVisible, terminalHeight } from "$lib/stores/terminal";
import { chatPanelDock } from "$lib/stores/chat";
import {
  chatInstances, chatVisible, chatPanelWidth, chatPanelHeight,
  activeRightChatId, activeBottomChatId,
  type ChatDock,
} from "$lib/stores/chat-instances";
import { uiZoom } from "$lib/stores/ui";
import {
  settings,
  DEFAULT_SETTINGS,
  type AppSettings,
} from "$lib/stores/settings";
import { saveAllInstanceMessages, loadInstanceMessages } from "$lib/stores/chat-instance-state";
import {
  claudeCodeSessions,
  saveClaudeCodeSessions,
  getClaudeCodeSessionMeta,
  restoreClaudeCodeSession,
} from "$lib/stores/claude-code";
import {
  browserInstances,
  browserVisible,
  browserPanelWidth,
  browserPanelHeight,
  activeBrowserId,
  activeRightBrowserId,
  browserBookmarks,
  type BrowserDock,
  type BrowserBookmark,
} from "$lib/stores/browser";

// ── Types ────────────────────────────────────────────────────────────

export interface AppState {
  workspacePath: string | null;
  sidebarWidth: number;
  sidebarVisible: boolean;
  terminalVisible: boolean;
  terminalHeight: number;
  sidebarView: "explorer" | "search" | "history";
  uiZoom?: number;
  settings?: Partial<AppSettings>;
  openTabs: Array<{
    path: string;
    name: string;
    ext?: string;
  }>;
  activeTabPath: string | null;
  chatPanelVisible?: boolean;
  chatPanelWidth?: number;
  chatPanelHeight?: number;
  chatPanelDock?: "right" | "bottom" | "tab";
  chatInstances?: Array<{ id: string; title: string; model: string; provider: string; dock: ChatDock }>;
  chatVisible?: boolean;
  expandedPaths?: string[];
  claudeCodeSessions?: Array<{
    id: string;
    claudeSessionId?: string;
    selectedModel?: string;
    totalCost?: number;
    cwd: string;
    model?: string;
  }>;
  browserInstances?: Array<{ id: string; title: string; url: string; dock: BrowserDock }>;
  browserVisible?: boolean;
  browserPanelWidth?: number;
  browserPanelHeight?: number;
  browserBookmarks?: BrowserBookmark[];
}

// ── Save ─────────────────────────────────────────────────────────────

let sidebarViewRef: "explorer" | "search" | "history" = "explorer";

/** Call this from +page.svelte whenever sidebarView changes */
export function setSidebarViewRef(view: "explorer" | "search" | "history") {
  sidebarViewRef = view;
}

export async function saveState(): Promise<void> {
  const $tabs = get(tabs);
  const $activeTabId = get(activeTabId);
  const activeTab = $tabs.find((t) => t.id === $activeTabId);

  const state: AppState = {
    workspacePath: get(workspacePath),
    sidebarWidth: get(sidebarWidth),
    sidebarVisible: get(sidebarVisible),
    terminalVisible: get(terminalVisible),
    terminalHeight: get(terminalHeight),
    sidebarView: sidebarViewRef,
    uiZoom: get(uiZoom),
    settings: get(settings),
    chatPanelVisible: get(chatVisible),
    chatPanelWidth: get(chatPanelWidth),
    chatPanelHeight: get(chatPanelHeight),
    chatPanelDock: get(chatPanelDock),
    chatInstances: get(chatInstances).map(({ id, title, model, provider, dock }) => ({ id, title, model, provider, dock })),
    chatVisible: get(chatVisible),
    expandedPaths: Array.from(get(expandedPaths)),
    claudeCodeSessions: getClaudeCodeSessionMeta(),
    browserInstances: get(browserInstances).map(({ id, title, url, dock }) => ({ id, title, url, dock })),
    browserVisible: get(browserVisible),
    browserPanelWidth: get(browserPanelWidth),
    browserPanelHeight: get(browserPanelHeight),
    browserBookmarks: get(browserBookmarks),
    openTabs: $tabs
      .filter((t) => !t.path.startsWith("__terminal__:") && !t.path.startsWith("__chat__") && !t.path.startsWith("__browser__:"))
      .map((t) => ({
        path: t.path,
        name: t.name,
        ext: t.ext,
      })),
    activeTabPath: activeTab?.path ?? null,
  };

  try {
    await saveAppState(JSON.stringify(state));
    // Persist chat messages and Claude Code sessions to individual files
    await Promise.allSettled([
      saveAllInstanceMessages(),
      saveClaudeCodeSessions(),
    ]);
  } catch (e) {
    console.error("Failed to save app state:", e);
  }
}

// ── Load ─────────────────────────────────────────────────────────────

export async function loadState(): Promise<AppState | null> {
  try {
    const json = await loadAppState();
    if (!json) return null;

    const state: AppState = JSON.parse(json);
    return state;
  } catch (e) {
    console.error("Failed to load app state:", e);
    return null;
  }
}

/** Restore all stores from saved state. Returns sidebarView for the page component. */
export async function restoreState(): Promise<"explorer" | "search" | "history" | null> {
  const state = await loadState();
  if (!state) return null;

  // Restore simple stores
  sidebarWidth.set(state.sidebarWidth);
  sidebarVisible.set(state.sidebarVisible);
  terminalVisible.set(state.terminalVisible);
  terminalHeight.set(state.terminalHeight);
  if (state.uiZoom != null) {
    uiZoom.set(state.uiZoom);
  }

  // Restore settings (merge saved over defaults)
  if (state.settings) {
    const legacySettings = state.settings as Partial<AppSettings> & { aiFavoriteModels?: string[] };
    const merged = { ...DEFAULT_SETTINGS, ...legacySettings };

    // Backward compatibility: migrate legacy single AI key/base URL fields.
    if (!merged.aiOpenRouterApiKey && merged.aiApiKey) {
      merged.aiOpenRouterApiKey = merged.aiApiKey;
    }
    if (!merged.aiOpenRouterBaseUrl && merged.aiBaseUrl) {
      merged.aiOpenRouterBaseUrl = merged.aiBaseUrl;
    }

    // Migration: normalize bare model IDs to prefixed form.
    // Older saves stored e.g. 'claude-sonnet-4-6' instead of 'anthropic/claude-sonnet-4-6'.
    function normalizeBareModelId(id: string): string {
      if (id.includes('/')) return id; // Already prefixed — leave alone.
      if (id.startsWith('claude-')) return `anthropic/${id}`;
      if (id.startsWith('gpt-') || id.startsWith('o3') || id.startsWith('o4') || id.startsWith('codex-')) return `openai/${id}`;
      return id; // Unknown bare ID — leave unchanged.
    }
    merged.aiEnabledModels = (merged.aiEnabledModels || []).map(normalizeBareModelId);

    // Migration: seed enabled models from legacy favorites once.
    const legacyFavorites = Array.isArray(legacySettings.aiFavoriteModels)
      ? legacySettings.aiFavoriteModels.map(normalizeBareModelId)
      : [];

    // Migration: if aiEnabledModels is empty, seed from legacy favorites, then defaults.
    if (merged.aiEnabledModels.length === 0) {
      merged.aiEnabledModels = [
        ...(legacyFavorites.length > 0 ? legacyFavorites : DEFAULT_SETTINGS.aiEnabledModels),
      ];
    }

    // Migration: bump maxToolIterations if stuck at old low default (25).
    if (merged.aiMaxToolIterations < 75) {
      merged.aiMaxToolIterations = 75;
    }

    settings.set(merged);
  }

  // Restore expanded paths
  if (state.expandedPaths) {
    expandedPaths.set(new Set(state.expandedPaths));
  }

  // Restore workspace path (caller will handle loading the file tree)
  if (state.workspacePath) {
    workspacePath.set(state.workspacePath);
  }

  // Restore Claude Code sessions from disk (before tabs so tabs can find them)
  if (state.claudeCodeSessions && state.claudeCodeSessions.length > 0) {
    for (const ccMeta of state.claudeCodeSessions) {
      await restoreClaudeCodeSession(ccMeta.id);
    }
  }

  // Restore tabs — open each one and load content
  if (state.openTabs && state.openTabs.length > 0) {
    for (const tab of state.openTabs) {
      // Skip synthetic tabs — restored separately
      if (tab.path.startsWith("__terminal__:") || tab.path.startsWith("__chat__") || tab.path.startsWith("__browser__:")) continue;

      // Restore Claude Code tabs
      if (tab.path.startsWith("__claude-code__:")) {
        const ccId = tab.path.replace("__claude-code__:", "");
        const { openClaudeCodeTab } = await import("$lib/stores/tabs");
        openClaudeCodeTab(ccId, tab.name || "Claude Code");
        continue;
      }

      try {
        // Check if file still exists by trying to read it
        const content = await readFileText(tab.path);
        const id = openTab(tab.path, tab.name, tab.ext);
        updateTabContent(id, content);
      } catch {
        // File no longer exists — skip it
        console.warn("Skipping missing file:", tab.path);
      }
    }

    // Restore active tab by path
    if (state.activeTabPath) {
      const $tabs = get(tabs);
      const match = $tabs.find((t) => t.path === state.activeTabPath);
      if (match) {
        activeTabId.set(match.id);
      }
    }
  }

  // Restore chat panel state
  if (state.chatPanelWidth != null) {
    chatPanelWidth.set(state.chatPanelWidth);
  }
  if (state.chatPanelHeight != null) {
    chatPanelHeight.set(state.chatPanelHeight);
  }
  if (state.chatPanelDock) {
    chatPanelDock.set(state.chatPanelDock);
  }

  // Restore chat instances (new multi-instance system)
  if (state.chatInstances && state.chatInstances.length > 0) {
    chatInstances.set(state.chatInstances);
    // Set active IDs for each dock
    const rightChat = state.chatInstances.find(c => c.dock === 'right');
    const bottomChat = state.chatInstances.find(c => c.dock === 'bottom');
    if (rightChat) activeRightChatId.set(rightChat.id);
    if (bottomChat) activeBottomChatId.set(bottomChat.id);
    // Restore tab-docked chats
    for (const inst of state.chatInstances) {
      if (inst.dock === 'tab') {
        const { openChatInstanceTab } = await import('$lib/stores/tabs');
        openChatInstanceTab(inst.id, inst.title);
      }
    }
    // Load persisted messages for each chat instance
    for (const inst of state.chatInstances) {
      await loadInstanceMessages(inst.id);
    }
  }

  // Restore chat visibility
  if (state.chatVisible != null) {
    chatVisible.set(state.chatVisible);
  } else if (state.chatPanelVisible != null) {
    // Legacy migration
    chatVisible.set(state.chatPanelVisible);
  }

  // Restore browser instances
  if (state.browserInstances && state.browserInstances.length > 0) {
    // Restore instances with empty history (webview will be recreated on mount)
    const restored = state.browserInstances.map((inst) => ({
      ...inst,
      history: [inst.url],
      historyIndex: 0,
      isLoading: false,
    }));
    browserInstances.set(restored);
    // Set active IDs
    const rightBrowser = restored.find((b) => b.dock === "right");
    const bottomBrowser = restored.find((b) => b.dock === "bottom");
    if (rightBrowser) activeRightBrowserId.set(rightBrowser.id);
    if (bottomBrowser) activeBrowserId.set(bottomBrowser.id);
    // Restore tab-docked browsers
    for (const inst of restored) {
      if (inst.dock === "tab") {
        const { openBrowserTab } = await import("$lib/stores/tabs");
        openBrowserTab(inst.id, inst.title);
      }
    }
  }
  if (state.browserVisible != null) {
    browserVisible.set(state.browserVisible);
  }
  if (state.browserPanelWidth != null) {
    browserPanelWidth.set(state.browserPanelWidth);
  }
  if (state.browserPanelHeight != null) {
    browserPanelHeight.set(state.browserPanelHeight);
  }
  if (state.browserBookmarks) {
    browserBookmarks.set(state.browserBookmarks);
  }

  // Update sidebar view ref for future saves
  sidebarViewRef = state.sidebarView ?? "explorer";

  return state.sidebarView ?? "explorer";
}

// ── Auto-save (debounced) ────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSave() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    saveState();
  }, 1000);
}

const unsubscribers: Array<() => void> = [];

export function startAutoSave() {
  // Subscribe to all relevant stores
  unsubscribers.push(workspacePath.subscribe(() => debouncedSave()));
  unsubscribers.push(sidebarWidth.subscribe(() => debouncedSave()));
  unsubscribers.push(sidebarVisible.subscribe(() => debouncedSave()));
  unsubscribers.push(terminalVisible.subscribe(() => debouncedSave()));
  unsubscribers.push(terminalHeight.subscribe(() => debouncedSave()));
  unsubscribers.push(uiZoom.subscribe(() => debouncedSave()));
  unsubscribers.push(settings.subscribe(() => debouncedSave()));
  unsubscribers.push(tabs.subscribe(() => debouncedSave()));
  unsubscribers.push(activeTabId.subscribe(() => debouncedSave()));
  unsubscribers.push(chatVisible.subscribe(() => debouncedSave()));
  unsubscribers.push(chatPanelWidth.subscribe(() => debouncedSave()));
  unsubscribers.push(chatPanelHeight.subscribe(() => debouncedSave()));
  unsubscribers.push(chatPanelDock.subscribe(() => debouncedSave()));
  unsubscribers.push(chatInstances.subscribe(() => debouncedSave()));
  unsubscribers.push(claudeCodeSessions.subscribe(() => debouncedSave()));
  unsubscribers.push(expandedPaths.subscribe(() => debouncedSave()));
  unsubscribers.push(browserInstances.subscribe(() => debouncedSave()));
  unsubscribers.push(browserVisible.subscribe(() => debouncedSave()));
  unsubscribers.push(browserPanelWidth.subscribe(() => debouncedSave()));
  unsubscribers.push(browserPanelHeight.subscribe(() => debouncedSave()));
  unsubscribers.push(browserBookmarks.subscribe(() => debouncedSave()));
}

export function stopAutoSave() {
  for (const unsub of unsubscribers) {
    unsub();
  }
  unsubscribers.length = 0;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}
