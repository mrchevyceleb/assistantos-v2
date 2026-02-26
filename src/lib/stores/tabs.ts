import { writable, derived, get } from "svelte/store";
import type { ViewerType } from "$lib/utils/file-types";
import { getViewerType } from "$lib/utils/file-types";

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

export const tabs = writable<Tab[]>([]);
export const activeTabId = writable<string | null>(null);

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

export function closeTab(id: string) {
  const currentTabs = get(tabs);
  const idx = currentTabs.findIndex((t) => t.id === id);
  if (idx === -1) return;

  tabs.update((t) => t.filter((tab) => tab.id !== id));

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
