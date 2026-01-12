import { useEffect } from 'react'
import { useTabStore } from '../../stores/tabStore'
import { useAppStore } from '../../stores/appStore'
import { AgentChatContainer } from '../chat/AgentChatContainer'
import { MarkdownEditor } from '../editor/MarkdownEditor'
import { MediaViewer } from '../editor/MediaViewer'
import { Dashboard } from '../dashboard/Dashboard'
import { TaskPanel } from '../tasks/TaskPanel'
import { WebBrowserPanel } from '../browser/WebBrowserPanel'
import { LudicrousMode } from '../ludicrous/LudicrousMode'
import { isMediaFile } from '../../utils/fileTypes'

export function TabContent() {
  const activeTab = useTabStore(state => state.getActiveTab())
  const setCurrentFile = useAppStore(state => state.openFile)
  const currentFile = useAppStore(state => state.currentFile)

  // Sync current file with active file tab (in useEffect to avoid render-time state updates)
  useEffect(() => {
    if (activeTab?.type === 'file' && activeTab.filePath && currentFile !== activeTab.filePath) {
      setCurrentFile(activeTab.filePath)
    }
  }, [activeTab, currentFile, setCurrentFile])

  // No active tab
  if (!activeTab) {
    return (
      <div className="
        flex items-center justify-center
        h-full
        bg-slate-900/50
        text-slate-500
      ">
        <div className="text-center">
          <p className="text-lg">No tabs open</p>
          <p className="text-sm mt-1">Click + to open a new tab</p>
        </div>
      </div>
    )
  }

  // Render based on tab type
  switch (activeTab.type) {
    case 'agent':
      if (!activeTab.agentId) {
        return <div className="p-4 text-slate-500">Invalid agent tab</div>
      }
      return <AgentChatContainer agentId={activeTab.agentId} />

    case 'file':
      if (!activeTab.filePath) {
        return <div className="p-4 text-slate-500">Invalid file tab</div>
      }
      // Check if it's a media file
      if (isMediaFile(activeTab.filePath)) {
        return <MediaViewer />
      }
      return <MarkdownEditor />

    case 'browser':
      return <WebBrowserPanel url={activeTab.url} />

    case 'dashboard':
      return <Dashboard />

    case 'tasks':
      return <TaskPanel />

    case 'ludicrous':
      return <LudicrousMode />

    default:
      return (
        <div className="p-4 text-slate-500">
          Unknown tab type: {activeTab.type}
        </div>
      )
  }
}
