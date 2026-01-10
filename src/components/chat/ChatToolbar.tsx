/**
 * Chat Toolbar
 * Quick actions bar for managing conversations
 */

import { Save, FolderOpen, Download, Trash2 } from 'lucide-react'

interface ChatToolbarProps {
  onSave: () => void
  onLoad: () => void
  onExport: () => void
  onClear: () => void
  savedCount?: number
  hasMessages: boolean
  isSaving?: boolean
}

export function ChatToolbar({
  onSave,
  onLoad,
  onExport,
  onClear,
  savedCount = 0,
  hasMessages,
  isSaving = false
}: ChatToolbarProps) {
  return (
    <div
      className="flex items-center gap-1 px-4 py-2"
      style={{
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        background: 'rgba(15, 20, 35, 0.5)'
      }}
    >
      {/* Save */}
      <button
        onClick={onSave}
        disabled={!hasMessages || isSaving}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all ${
          hasMessages && !isSaving
            ? 'text-slate-400 hover:text-white hover:bg-white/5'
            : 'text-slate-600 cursor-not-allowed'
        }`}
        title="Save conversation"
      >
        <Save className="w-3.5 h-3.5" />
        <span>{isSaving ? 'Saving...' : 'Save'}</span>
      </button>

      {/* Load */}
      <button
        onClick={onLoad}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
        title="Load conversation"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        <span>Load</span>
        {savedCount > 0 && (
          <span className="ml-0.5 px-1.5 py-0.5 text-[10px] bg-cyan-500/20 text-cyan-400 rounded-full">
            {savedCount}
          </span>
        )}
      </button>

      {/* Export */}
      <button
        onClick={onExport}
        disabled={!hasMessages}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all ${
          hasMessages
            ? 'text-slate-400 hover:text-white hover:bg-white/5'
            : 'text-slate-600 cursor-not-allowed'
        }`}
        title="Export to markdown"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Export</span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Clear */}
      <button
        onClick={onClear}
        disabled={!hasMessages}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all ${
          hasMessages
            ? 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'
            : 'text-slate-600 cursor-not-allowed'
        }`}
        title="Clear conversation"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>Clear</span>
      </button>
    </div>
  )
}
