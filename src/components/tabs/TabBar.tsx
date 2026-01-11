import { useEffect, useRef } from 'react'
import { useTabStore, type Tab as TabType } from '../../stores/tabStore'
import { useAgentStore } from '../../stores/agentStore'
import { Tab } from './Tab'
import { AddTabButton } from './AddTabButton'

export function TabBar() {
  const tabs = useTabStore(state => state.tabs)
  const activeTabId = useTabStore(state => state.activeTabId)
  const setActiveTab = useTabStore(state => state.setActiveTab)
  const closeTab = useTabStore(state => state.closeTab)
  const reorderTabs = useTabStore(state => state.reorderTabs)
  const selectNextTab = useTabStore(state => state.selectNextTab)
  const selectPreviousTab = useTabStore(state => state.selectPreviousTab)
  const selectTabByIndex = useTabStore(state => state.selectTabByIndex)

  const agents = useAgentStore(state => state.agents)

  const tabsContainerRef = useRef<HTMLDivElement>(null)

  // Get agent status for tab indicators
  const getAgentStatus = (agentId?: string) => {
    if (!agentId) return undefined
    return agents.find(a => a.id === agentId)?.status
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Tab / Ctrl+Shift+Tab - Next/Previous tab
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        if (e.shiftKey) {
          selectPreviousTab()
        } else {
          selectNextTab()
        }
      }

      // Ctrl+W - Close current tab
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) {
          closeTab(activeTabId)
        }
      }

      // Ctrl+1-9 - Select tab by index
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const index = parseInt(e.key) - 1
        selectTabByIndex(index)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTabId, closeTab, selectNextTab, selectPreviousTab, selectTabByIndex])

  // Scroll active tab into view
  useEffect(() => {
    if (activeTabId && tabsContainerRef.current) {
      const activeTabEl = tabsContainerRef.current.querySelector(`[data-tab-id="${activeTabId}"]`)
      if (activeTabEl) {
        activeTabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      }
    }
  }, [activeTabId])

  // Handle drag and drop reordering
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString())
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'))
    if (dragIndex !== dropIndex) {
      reorderTabs(dragIndex, dropIndex)
    }
  }

  // Handle middle-click to close
  const handleMouseDown = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) { // Middle click
      e.preventDefault()
      closeTab(tabId)
    }
  }

  return (
    <div className="
      flex items-center
      h-10 min-h-[40px]
      bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-slate-900/95
      border-b border-white/5
    ">
      {/* Tabs Container - Scrollable */}
      <div
        ref={tabsContainerRef}
        className="
          flex-1 flex items-center
          overflow-x-auto overflow-y-hidden
          scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent
        "
        style={{ scrollbarWidth: 'thin' }}
      >
        {tabs.map((tab, index) => (
          <Tab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            agentStatus={getAgentStatus(tab.agentId)}
            onClick={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            onMouseDown={(e) => handleMouseDown(e, tab.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
          />
        ))}
      </div>

      {/* Add Tab Button */}
      <AddTabButton />
    </div>
  )
}
