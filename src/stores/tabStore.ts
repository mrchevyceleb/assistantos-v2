import { create } from 'zustand'

// Types of tabs supported
export type TabType = 'agent' | 'file' | 'browser' | 'dashboard' | 'tasks' | 'ludicrous'

// Tab interface
export interface Tab {
  id: string
  type: TabType
  title: string

  // Type-specific data
  agentId?: string      // For 'agent' tabs
  filePath?: string     // For 'file' tabs
  url?: string          // For 'browser' tab
}

// Tab store interface
interface TabStore {
  // State
  tabs: Tab[]
  activeTabId: string | null

  // Tab operations
  openTab: (tab: Omit<Tab, 'id'>) => string    // Returns new tab ID
  closeTab: (id: string) => void
  closeAllTabs: () => void
  closeOtherTabs: (id: string) => void

  // Tab selection
  setActiveTab: (id: string) => void
  getActiveTab: () => Tab | undefined
  getTab: (id: string) => Tab | undefined

  // Tab updates
  updateTab: (id: string, updates: Partial<Omit<Tab, 'id'>>) => void

  // Tab reordering
  reorderTabs: (fromIndex: number, toIndex: number) => void

  // Tab queries
  findTabByAgentId: (agentId: string) => Tab | undefined
  findTabByFilePath: (filePath: string) => Tab | undefined
  findTabByType: (type: TabType) => Tab | undefined

  // Special operations
  openOrFocusAgent: (agentId: string, title?: string) => string  // Opens new or focuses existing
  openOrFocusFile: (filePath: string, title?: string) => string
  openOrFocusBrowser: (url?: string) => string
  openOrFocusDashboard: () => string
  openOrFocusTasks: () => string
  openOrFocusLudicrous: () => string

  // Close agent tab (called when agent is removed)
  closeAgentTab: (agentId: string) => void

  // Keyboard navigation
  selectNextTab: () => void
  selectPreviousTab: () => void
  selectTabByIndex: (index: number) => void
}

// Generate unique tab ID
function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Extract filename from path
function getFileNameFromPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}

export const useTabStore = create<TabStore>((set, get) => ({
  // Initial state - no tabs (will be populated when app loads)
  tabs: [],
  activeTabId: null,

  // Open a new tab
  openTab: (tabData) => {
    const newTab: Tab = {
      ...tabData,
      id: generateTabId(),
    }

    set(state => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }))

    return newTab.id
  },

  // Close a tab
  closeTab: (id) => {
    const { tabs, activeTabId } = get()

    // Don't close if it's the last tab - but we might want to create a default agent tab
    // For now, allow closing all tabs
    const newTabs = tabs.filter(t => t.id !== id)

    let newActiveId = activeTabId
    if (activeTabId === id) {
      // Find adjacent tab to switch to
      const closedIndex = tabs.findIndex(t => t.id === id)
      if (closedIndex > 0 && newTabs.length > 0) {
        // Prefer tab before
        newActiveId = newTabs[Math.min(closedIndex - 1, newTabs.length - 1)].id
      } else if (newTabs.length > 0) {
        // Use first available
        newActiveId = newTabs[0].id
      } else {
        newActiveId = null
      }
    }

    set({
      tabs: newTabs,
      activeTabId: newActiveId,
    })
  },

  // Close all tabs
  closeAllTabs: () => {
    set({
      tabs: [],
      activeTabId: null,
    })
  },

  // Close all tabs except specified one
  closeOtherTabs: (id) => {
    const { tabs } = get()
    const tabToKeep = tabs.find(t => t.id === id)

    if (tabToKeep) {
      set({
        tabs: [tabToKeep],
        activeTabId: id,
      })
    }
  },

  // Set active tab
  setActiveTab: (id) => {
    const { tabs } = get()
    if (tabs.some(t => t.id === id)) {
      set({ activeTabId: id })
    }
  },

  // Get active tab
  getActiveTab: () => {
    const { tabs, activeTabId } = get()
    return tabs.find(t => t.id === activeTabId)
  },

  // Get tab by ID
  getTab: (id) => {
    return get().tabs.find(t => t.id === id)
  },

  // Update tab
  updateTab: (id, updates) => {
    set(state => ({
      tabs: state.tabs.map(t =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }))
  },

  // Reorder tabs (drag and drop)
  reorderTabs: (fromIndex, toIndex) => {
    const { tabs } = get()
    if (fromIndex < 0 || fromIndex >= tabs.length) return
    if (toIndex < 0 || toIndex >= tabs.length) return
    if (fromIndex === toIndex) return

    const newTabs = [...tabs]
    const [movedTab] = newTabs.splice(fromIndex, 1)
    newTabs.splice(toIndex, 0, movedTab)

    set({ tabs: newTabs })
  },

  // Find tab by agent ID
  findTabByAgentId: (agentId) => {
    return get().tabs.find(t => t.type === 'agent' && t.agentId === agentId)
  },

  // Find tab by file path
  findTabByFilePath: (filePath) => {
    return get().tabs.find(t => t.type === 'file' && t.filePath === filePath)
  },

  // Find tab by type (for singleton tabs like dashboard, tasks, ludicrous)
  findTabByType: (type) => {
    return get().tabs.find(t => t.type === type)
  },

  // Open or focus agent tab
  openOrFocusAgent: (agentId, title) => {
    const existing = get().findTabByAgentId(agentId)
    if (existing) {
      set({ activeTabId: existing.id })
      return existing.id
    }

    return get().openTab({
      type: 'agent',
      title: title || 'New Chat',
      agentId,
    })
  },

  // Open or focus file tab
  openOrFocusFile: (filePath, title) => {
    const existing = get().findTabByFilePath(filePath)
    if (existing) {
      set({ activeTabId: existing.id })
      return existing.id
    }

    return get().openTab({
      type: 'file',
      title: title || getFileNameFromPath(filePath),
      filePath,
    })
  },

  // Open or focus browser tab
  openOrFocusBrowser: (url) => {
    const existing = get().findTabByType('browser')
    if (existing) {
      // Update URL if provided and focus
      if (url) {
        get().updateTab(existing.id, { url })
      }
      set({ activeTabId: existing.id })
      return existing.id
    }

    return get().openTab({
      type: 'browser',
      title: 'Browser',
      url: url || 'https://www.google.com',
    })
  },

  // Open or focus dashboard tab
  openOrFocusDashboard: () => {
    const existing = get().findTabByType('dashboard')
    if (existing) {
      set({ activeTabId: existing.id })
      return existing.id
    }

    return get().openTab({
      type: 'dashboard',
      title: 'Dashboard',
    })
  },

  // Open or focus tasks tab
  openOrFocusTasks: () => {
    const existing = get().findTabByType('tasks')
    if (existing) {
      set({ activeTabId: existing.id })
      return existing.id
    }

    return get().openTab({
      type: 'tasks',
      title: 'Tasks',
    })
  },

  // Open or focus LUDICROUS MODE tab
  openOrFocusLudicrous: () => {
    const existing = get().findTabByType('ludicrous')
    if (existing) {
      set({ activeTabId: existing.id })
      return existing.id
    }

    return get().openTab({
      type: 'ludicrous',
      title: 'LUDICROUS MODE',
    })
  },

  // Close agent tab when agent is removed
  closeAgentTab: (agentId) => {
    const tab = get().findTabByAgentId(agentId)
    if (tab) {
      get().closeTab(tab.id)
    }
  },

  // Select next tab (Ctrl+Tab)
  selectNextTab: () => {
    const { tabs, activeTabId } = get()
    if (tabs.length === 0) return

    const currentIndex = tabs.findIndex(t => t.id === activeTabId)
    const nextIndex = (currentIndex + 1) % tabs.length
    set({ activeTabId: tabs[nextIndex].id })
  },

  // Select previous tab (Ctrl+Shift+Tab)
  selectPreviousTab: () => {
    const { tabs, activeTabId } = get()
    if (tabs.length === 0) return

    const currentIndex = tabs.findIndex(t => t.id === activeTabId)
    const prevIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1
    set({ activeTabId: tabs[prevIndex].id })
  },

  // Select tab by index (Ctrl+1-9)
  selectTabByIndex: (index) => {
    const { tabs } = get()
    if (index >= 0 && index < tabs.length) {
      set({ activeTabId: tabs[index].id })
    }
  },
}))
