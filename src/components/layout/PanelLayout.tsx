import { Group, Panel, Separator } from 'react-resizable-panels'
import { FileTree } from '../filetree/FileTree'
import { MarkdownEditor } from '../editor/MarkdownEditor'
import { AgentChat } from '../chat/AgentChat'

import './panels.css'

export function PanelLayout() {
  return (
    <Group orientation="horizontal" className="panel-group">
      {/* File Tree Panel */}
      <Panel defaultSize={20} minSize={15}>
        <div className="panel-content">
          <FileTree />
        </div>
      </Panel>

      <Separator />

      {/* Editor Panel */}
      <Panel defaultSize={45} minSize={20}>
        <div className="panel-content">
          <MarkdownEditor />
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
