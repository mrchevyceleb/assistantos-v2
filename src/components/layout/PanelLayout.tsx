import { useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { FileTree } from '../filetree/FileTree'
import { MarkdownEditor } from '../editor/MarkdownEditor'
import { MediaViewer } from '../editor/MediaViewer'
import { AgentChat } from '../chat/AgentChat'
import { CenterPanelTabs } from './CenterPanelTabs'
import { Dashboard } from '../dashboard/Dashboard'
import { TaskPanel } from '../tasks/TaskPanel'
import { useAppStore } from '../../stores/appStore'
import { isMediaFile } from '../../utils/fileTypes'

import './panels.css'

export function PanelLayout() {
  const { centerPanelView, setCenterPanelView, currentFile } = useAppStore()

  // Keyboard shortcuts for view switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '1':
            e.preventDefault()
            setCenterPanelView('editor')
            break
          case '2':
            e.preventDefault()
            setCenterPanelView('dashboard')
            break
          case '3':
            e.preventDefault()
            setCenterPanelView('tasks')
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setCenterPanelView])

  const renderCenterPanel = () => {
    switch (centerPanelView) {
      case 'dashboard':
        return <Dashboard />
      case 'tasks':
        return <TaskPanel />
      case 'editor':
      default:
        // Show MediaViewer for media files, MarkdownEditor for text files
        if (currentFile && isMediaFile(currentFile)) {
          return <MediaViewer />
        }
        return <MarkdownEditor />
    }
  }

  return (
    <Group orientation="horizontal" className="panel-group">
      {/* File Tree Panel */}
      <Panel defaultSize={20} minSize={15}>
        <div className="panel-content">
          <FileTree />
        </div>
      </Panel>

      <Separator />

      {/* Center Panel (Editor/Dashboard/Tasks) */}
      <Panel defaultSize={45} minSize={20}>
        <div className="panel-content flex flex-col">
          <CenterPanelTabs />
          <div className="flex-1 overflow-hidden">
            {renderCenterPanel()}
          </div>
        </div>
      </Panel>

      <Separator />

      {/* Chat Panel */}
      <Panel defaultSize={35} minSize={20}>
        <div className="panel-content">
          <AgentChat />
        </div>
      </Panel>
    </Group>
  )
}
