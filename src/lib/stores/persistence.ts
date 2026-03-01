import { get } from "svelte/store";
import { saveAppState, loadAppState, readFileText } from "$lib/utils/tauri";
import {
  workspacePath,
  sidebarWidth,
  sidebarVisible,
} from "$lib/stores/workspace";
import {
  tabs,
  activeTabId,
  openTab,
  updateTabContent,
} from "$lib/stores/tabs";
import { terminalVisible, terminalHeight } from "$lib/stores/terminal";
import { chatPanelVisible, chatPanelWidth, chatPanelHeight, chatPanelDock } from "$lib/stores/chat";
import { uiZoom } from "$lib/stores/ui";
import {
  settings,
  DEFAULT_SETTINGS,
  type AppSettings,
} from "$lib/stores/settings";

// ── Types ────────────────────────────────────────────────────────────

export interface AppState {
  workspacePath: string | null;
  sidebarWidth: number;
  sidebarVisible: boolean;
  terminalVisible: boolean;
  terminalHeight: number;
  sidebarView: "explorer" | "search";
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
  chatPanelDock?: "right" | "bottom";
}

// ── Save ─────────────────────────────────────────────────────────────

let sidebarViewRef: "explorer" | "search" = "explorer";

/** Call this from +page.svelte whenever sidebarView changes */
export function setSidebarViewRef(view: "explorer" | "search") {
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
    chatPanelVisible: get(chatPanelVisible),
    chatPanelWidth: get(chatPanelWidth),
    chatPanelHeight: get(chatPanelHeight),
    chatPanelDock: get(chatPanelDock),
    openTabs: $tabs
      .filter((t) => !t.path.startsWith("__terminal__:"))
      .map((t) => ({
        path: t.path,
        name: t.name,
        ext: t.ext,
      })),
    activeTabPath: activeTab?.path ?? null,
  };

  try {
    await saveAppState(JSON.stringify(state));
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
export async function restoreState(): Promise<"explorer" | "search" | null> {
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
    settings.set({ ...DEFAULT_SETTINGS, ...state.settings });
  }

  // Restore workspace path (caller will handle loading the file tree)
  if (state.workspacePath) {
    workspacePath.set(state.workspacePath);
  }

  // Restore tabs — open each one and load content
  if (state.openTabs && state.openTabs.length > 0) {
    for (const tab of state.openTabs) {
      // Skip terminal tabs — they can't be restored across sessions
      if (tab.path.startsWith("__terminal__:")) continue;

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
  if (state.chatPanelVisible != null) {
    chatPanelVisible.set(state.chatPanelVisible);
  }
  if (state.chatPanelWidth != null) {
    chatPanelWidth.set(state.chatPanelWidth);
  }
  if (state.chatPanelHeight != null) {
    chatPanelHeight.set(state.chatPanelHeight);
  }
  if (state.chatPanelDock) {
    chatPanelDock.set(state.chatPanelDock);
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
  unsubscribers.push(chatPanelVisible.subscribe(() => debouncedSave()));
  unsubscribers.push(chatPanelWidth.subscribe(() => debouncedSave()));
  unsubscribers.push(chatPanelHeight.subscribe(() => debouncedSave()));
  unsubscribers.push(chatPanelDock.subscribe(() => debouncedSave()));
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
