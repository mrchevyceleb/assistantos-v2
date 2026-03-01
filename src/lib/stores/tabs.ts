import { writable, derived, get } from "svelte/store";
import type { ViewerType } from "$lib/utils/file-types";
import { getViewerType } from "$lib/utils/file-types";
import { chatPanelVisible, chatPanelDock } from "$lib/stores/chat";
import { settings } from "$lib/stores/settings";

export interface Tab {
  id: string;
  path: string;
  name: string;
  ext?: string;
  viewerType: ViewerType;
  content?: string;
  isModified: boolean;
  isLoading: boolean;
  editMode: boolean;
}

export interface ClosedTabEntry {
  path: string;
  name: string;
  ext?: string;
  viewerType: ViewerType;
  content?: string;
  editMode: boolean;
  isModified: boolean;
}

export const tabs = writable<Tab[]>([]);
export const activeTabId = writable<string | null>(null);
export const closedTabs = writable<ClosedTabEntry[]>([]);
const MAX_CLOSED_TABS = 40;

export const activeTab = derived([tabs, activeTabId], ([$tabs, $activeTabId]) => {
  return $tabs.find((t) => t.id === $activeTabId) || null;
});

export function openTab(path: string, name: string, ext?: string): string {
  const currentTabs = get(tabs);
  const existing = currentTabs.find((t) => t.path === path);
  if (existing) {
    activeTabId.set(existing.id);
    return existing.id;
  }

  const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const viewerType = getViewerType(ext);
  const newTab: Tab = {
    id,
    path,
    name,
    ext,
    viewerType,
    isModified: false,
    isLoading: true,
    editMode: false,
  };

  tabs.update((t) => [...t, newTab]);
  activeTabId.set(id);
  return id;
}

export function closeTab(id: string, options?: { forceTerminal?: boolean; skipConfirm?: boolean }) {
  const currentTabs = get(tabs);
  const idx = currentTabs.findIndex((t) => t.id === id);
  if (idx === -1) return;

  const closingTab = currentTabs[idx];
  if (closingTab.viewerType === "terminal" && !options?.forceTerminal) {
    // Terminal tabs require explicit force from a caller that has already
    // confirmed intent, which prevents accidental data-loss closes.
    return;
  }

  if (!options?.skipConfirm) {
    const currentSettings = get(settings);

    if (closingTab.viewerType === "terminal") {
      if (!window.confirm(`Close terminal tab "${closingTab.name}"? This will end the session.`)) {
        return;
      }
    }

    if (currentSettings.confirmCloseUnsaved && closingTab.isModified) {
      if (!window.confirm(`"${closingTab.name}" has unsaved changes. Close anyway?`)) {
        return;
      }
    }
  }

  // Track recently closed tabs so users can recover accidental closes.
  if (!closingTab.path.startsWith("__terminal__:") && !closingTab.path.startsWith("__chat__")) {
    const entry: ClosedTabEntry = {
      path: closingTab.path,
      name: closingTab.name,
      ext: closingTab.ext,
      viewerType: closingTab.viewerType,
      content: closingTab.content,
      editMode: closingTab.editMode,
      isModified: closingTab.isModified,
    };
    closedTabs.update((history) => [entry, ...history].slice(0, MAX_CLOSED_TABS));
  }

  tabs.update((t) => t.filter((tab) => tab.id !== id));

  if (closingTab.path.startsWith("__chat__")) {
    if (get(chatPanelDock) === "tab") {
      chatPanelVisible.set(false);
    }
  }

  const $activeTabId = get(activeTabId);
  if ($activeTabId === id) {
    const remaining = currentTabs.filter((t) => t.id !== id);
    if (remaining.length > 0) {
      const newIdx = Math.min(idx, remaining.length - 1);
      activeTabId.set(remaining[newIdx].id);
    } else {
      activeTabId.set(null);
    }
  }
}

export function reopenLastClosedTab(): string | null {
  const history = get(closedTabs);
  const entry = history[0];
  if (!entry) return null;

  const currentTabs = get(tabs);
  const existing = currentTabs.find((t) => t.path === entry.path);
  if (existing) {
    activeTabId.set(existing.id);
    closedTabs.update((h) => h.slice(1));
    return existing.id;
  }

  const reopened: Tab = {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    path: entry.path,
    name: entry.name,
    ext: entry.ext,
    viewerType: entry.viewerType,
    content: entry.content,
    isModified: entry.isModified,
    isLoading: entry.content === undefined,
    editMode: entry.editMode,
  };

  tabs.update((t) => [...t, reopened]);
  activeTabId.set(reopened.id);
  closedTabs.update((h) => h.slice(1));
  return reopened.id;
}

export function updateTabContent(id: string, content: string) {
  tabs.update((t) =>
    t.map((tab) =>
      tab.id === id ? { ...tab, content, isLoading: false } : tab
    )
  );
}

export function setTabModified(id: string, isModified: boolean) {
  tabs.update((t) =>
    t.map((tab) => (tab.id === id ? { ...tab, isModified } : tab))
  );
}

export function toggleEditMode(id: string) {
  tabs.update((t) =>
    t.map((tab) => (tab.id === id ? { ...tab, editMode: !tab.editMode } : tab))
  );
}

export function setTabLoading(id: string, isLoading: boolean) {
  tabs.update((t) =>
    t.map((tab) => (tab.id === id ? { ...tab, isLoading } : tab))
  );
}

/** Move a tab from one index to another (drag-to-reorder) */
export function moveTab(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return;
  tabs.update((t) => {
    const copy = [...t];
    const [moved] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, moved);
    return copy;
  });
}

/** Open a terminal instance as a document tab */
export function openTerminalTab(terminalId: string, title: string): string {
  const currentTabs = get(tabs);
  // Use a synthetic path so we can identify terminal tabs
  const path = `__terminal__:${terminalId}`;
  const existing = currentTabs.find((t) => t.path === path);
  if (existing) {
    activeTabId.set(existing.id);
    return existing.id;
  }

  const newTab: Tab = {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    path,
    name: title,
    ext: undefined,
    viewerType: "terminal" as ViewerType,
    isModified: false,
    isLoading: false,
    editMode: false,
  };

  tabs.update((t) => [...t, newTab]);
  activeTabId.set(newTab.id);
  return newTab.id;
}

/** Remove terminal tabs for a given terminal ID */
export function closeTerminalTab(terminalId: string) {
  const currentTabs = get(tabs);
  const path = `__terminal__:${terminalId}`;
  const tab = currentTabs.find((t) => t.path === path);
  if (tab) {
    closeTab(tab.id, { forceTerminal: true, skipConfirm: true });
  }
}

const CHAT_TAB_PATH = "__chat__";

/** Open AI chat as a document tab */
export function openChatTab(): string {
  const currentTabs = get(tabs);
  const existing = currentTabs.find((t) => t.path === CHAT_TAB_PATH);
  if (existing) {
    activeTabId.set(existing.id);
    return existing.id;
  }

  const newTab: Tab = {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    path: CHAT_TAB_PATH,
    name: "AI Chat",
    ext: undefined,
    viewerType: "chat",
    isModified: false,
    isLoading: false,
    editMode: false,
  };

  tabs.update((t) => [...t, newTab]);
  activeTabId.set(newTab.id);
  return newTab.id;
}

/** Close AI chat tab if present */
export function closeChatTab() {
  const currentTabs = get(tabs);
  const tab = currentTabs.find((t) => t.path === CHAT_TAB_PATH);
  if (tab) {
    closeTab(tab.id, { skipConfirm: true });
  }
}
