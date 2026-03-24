import { writable, derived, get } from "svelte/store";
import { openBrowserTab, closeBrowserTab } from "$lib/stores/tabs";
import { closeBrowserWebview } from "$lib/utils/tauri";

export type BrowserDock = "bottom" | "tab" | "right";

export interface BrowserInstance {
  id: string;
  title: string;
  url: string;
  dock: BrowserDock;
  history: string[];
  historyIndex: number;
  isLoading: boolean;
}

export const browserInstances = writable<BrowserInstance[]>([]);
export const activeBrowserId = writable<string | null>(null);
export const activeRightBrowserId = writable<string | null>(null);
export const browserVisible = writable(false);
export const browserPanelHeight = writable(300);
export const browserPanelWidth = writable(500);

// ── Bookmarks ────────────────────────────────────────────────────────

export interface BrowserBookmark {
  id: string;
  title: string;
  url: string;
}

export const browserBookmarks = writable<BrowserBookmark[]>([]);

export function addBookmark(title: string, url: string): string {
  const existing = get(browserBookmarks).find((b) => b.url === url);
  if (existing) return existing.id;
  const id = `bm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  browserBookmarks.update((bm) => [...bm, { id, title, url }]);
  return id;
}

export function removeBookmark(id: string) {
  browserBookmarks.update((bm) => bm.filter((b) => b.id !== id));
}

export function removeBookmarkByUrl(url: string) {
  browserBookmarks.update((bm) => bm.filter((b) => b.url !== url));
}

// Derived: browsers grouped by dock position
export const bottomBrowsers = derived(browserInstances, ($b) =>
  $b.filter((b) => b.dock === "bottom")
);
export const tabBrowsers = derived(browserInstances, ($b) =>
  $b.filter((b) => b.dock === "tab")
);
export const rightBrowsers = derived(browserInstances, ($b) =>
  $b.filter((b) => b.dock === "right")
);
export const rightBrowserPanelVisible = derived(
  rightBrowsers,
  ($b) => $b.length > 0
);

let nextBrowserNum = 1;

export function addBrowser(
  url: string = "https://www.google.com",
  dock: BrowserDock = "tab"
): string {
  const id = `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const title = `Browser ${nextBrowserNum++}`;

  const instance: BrowserInstance = {
    id,
    title,
    url,
    dock,
    history: [url],
    historyIndex: 0,
    isLoading: false,
  };

  browserInstances.update((b) => [...b, instance]);

  if (dock === "bottom") {
    activeBrowserId.set(id);
    browserVisible.set(true);
  } else if (dock === "right") {
    activeRightBrowserId.set(id);
  } else if (dock === "tab") {
    openBrowserTab(id, title);
  }

  return id;
}

export function removeBrowser(id: string) {
  const instances = get(browserInstances);
  const inst = instances.find((b) => b.id === id);
  if (!inst) return;

  // Close the native webview
  closeBrowserWebview(id).catch(() => {});

  // Close the document tab if tab-docked
  if (inst.dock === "tab") {
    closeBrowserTab(id);
  }

  // Compute the next active ID before mutating the store
  const dockSiblings = instances.filter((b) => b.dock === inst.dock && b.id !== id);

  if (inst.dock === "bottom" && get(activeBrowserId) === id) {
    if (dockSiblings.length > 0) {
      activeBrowserId.set(dockSiblings[0].id);
    } else {
      activeBrowserId.set(null);
      browserVisible.set(false);
    }
  } else if (inst.dock === "right" && get(activeRightBrowserId) === id) {
    if (dockSiblings.length > 0) {
      activeRightBrowserId.set(dockSiblings[0].id);
    } else {
      activeRightBrowserId.set(null);
    }
  }

  // Now remove from store
  browserInstances.update((b) => b.filter((br) => br.id !== id));
}

export function moveBrowser(id: string, newDock: BrowserDock) {
  const instances = get(browserInstances);
  const inst = instances.find((b) => b.id === id);
  if (!inst || inst.dock === newDock) return;

  const oldDock = inst.dock;

  // If leaving "tab" dock, close the document tab
  if (oldDock === "tab") {
    closeBrowserTab(id);
  }

  // Update the dock position
  browserInstances.update((b) =>
    b.map((br) => (br.id === id ? { ...br, dock: newDock } : br))
  );

  // Handle active state for old dock (use original snapshot, exclude the moved instance)
  const oldDockSiblings = instances.filter(
    (b) => b.id !== id && b.dock === oldDock
  );
  if (oldDock === "bottom" && get(activeBrowserId) === id) {
    if (oldDockSiblings.length > 0) {
      activeBrowserId.set(oldDockSiblings[0].id);
    } else {
      activeBrowserId.set(null);
    }
  } else if (oldDock === "right" && get(activeRightBrowserId) === id) {
    if (oldDockSiblings.length > 0) {
      activeRightBrowserId.set(oldDockSiblings[0].id);
    } else {
      activeRightBrowserId.set(null);
    }
  }

  // Set active state for new dock
  if (newDock === "bottom") {
    activeBrowserId.set(id);
    browserVisible.set(true);
  } else if (newDock === "right") {
    activeRightBrowserId.set(id);
  } else if (newDock === "tab") {
    openBrowserTab(id, inst.title);
  }
}

export function updateBrowserUrl(id: string, url: string) {
  browserInstances.update((b) =>
    b.map((br) => (br.id === id ? { ...br, url } : br))
  );
}

const MAX_HISTORY = 100;

export function navigateBrowserTo(id: string, url: string) {
  browserInstances.update((b) =>
    b.map((br) => {
      if (br.id !== id) return br;
      // Truncate forward history when navigating from middle of stack
      let newHistory = [...br.history.slice(0, br.historyIndex + 1), url];
      // Cap history length, trim from the front
      let newIndex = newHistory.length - 1;
      if (newHistory.length > MAX_HISTORY) {
        const trimCount = newHistory.length - MAX_HISTORY;
        newHistory = newHistory.slice(trimCount);
        newIndex = newHistory.length - 1;
      }
      return {
        ...br,
        url,
        history: newHistory,
        historyIndex: newIndex,
      };
    })
  );
}

export function browserGoBack(id: string): string | null {
  const instances = get(browserInstances);
  const inst = instances.find((b) => b.id === id);
  if (!inst || inst.historyIndex <= 0) return null;

  const newIndex = inst.historyIndex - 1;
  const newUrl = inst.history[newIndex];

  browserInstances.update((b) =>
    b.map((br) =>
      br.id === id ? { ...br, url: newUrl, historyIndex: newIndex } : br
    )
  );

  return newUrl;
}

export function browserGoForward(id: string): string | null {
  const instances = get(browserInstances);
  const inst = instances.find((b) => b.id === id);
  if (!inst || inst.historyIndex >= inst.history.length - 1) return null;

  const newIndex = inst.historyIndex + 1;
  const newUrl = inst.history[newIndex];

  browserInstances.update((b) =>
    b.map((br) =>
      br.id === id ? { ...br, url: newUrl, historyIndex: newIndex } : br
    )
  );

  return newUrl;
}

export function setBrowserLoading(id: string, isLoading: boolean) {
  browserInstances.update((b) =>
    b.map((br) => (br.id === id ? { ...br, isLoading } : br))
  );
}
