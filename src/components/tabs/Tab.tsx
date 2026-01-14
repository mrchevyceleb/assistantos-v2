import { X, Bot, FileText, Globe, LayoutDashboard, CheckSquare, Zap, FolderOpen, StickyNote } from 'lucide-react'
import type { Tab as TabType, TabType as TabTypeEnum } from '../../stores/tabStore'
import type { AgentStatus } from '../../stores/agentStore'

// Status indicator colors
const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: 'bg-emerald-400',
  working: 'bg-amber-400 animate-pulse',
  queued: 'bg-blue-400',
  error: 'bg-red-400',
}

// Tab icons by type
function getTabIcon(type: TabTypeEnum, isActive: boolean) {
  const className = `w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`

  switch (type) {
    case 'agent':
      return <Bot className={className} />
    case 'file':
      return <FileText className={className} />
    case 'browser':
      return <Globe className={className} />
    case 'dashboard':
      return <LayoutDashboard className={className} />
    case 'tasks':
      return <CheckSquare className={className} />
    case 'ludicrous':
      return <Zap className={`${className} ${isActive ? 'text-amber-400' : ''}`} />
    case 'files':
      return <FolderOpen className={className} />
    case 'note':
      return <StickyNote className={className} />
    default:
      return <FileText className={className} />
  }
}

interface TabProps {
  tab: TabType
  isActive: boolean
  agentStatus?: AgentStatus
  onClick: () => void
  onClose: () => void
  onMouseDown: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}

export function Tab({
  tab,
  isActive,
  agentStatus,
  onClick,
  onClose,
  onMouseDown,
  onContextMenu,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: TabProps) {
  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
  }

  return (
    <div
      data-tab-id={tab.id}
      className={`
        group relative flex items-center gap-2
        px-3 py-2 min-w-[120px] max-w-[200px]
        cursor-pointer select-none
        border-r border-white/5
        transition-all duration-150
        ${isActive
          ? 'bg-slate-800/50 text-white'
          : 'text-slate-400 hover:text-white hover:bg-white/5'
        }
        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}
      `}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Active Indicator Line */}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
      )}

      {/* Status Indicator (for agent tabs) */}
      {tab.type === 'agent' && agentStatus && (
        <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[agentStatus]}`} />
      )}

      {/* Icon (for non-agent tabs or agents without visible status) */}
      {(tab.type !== 'agent' || !agentStatus) && getTabIcon(tab.type, isActive)}

      {/* Title */}
      <span className="flex-1 text-sm truncate">{tab.title}</span>

      {/* Close Button */}
      <button
        onClick={handleCloseClick}
        className={`
          p-0.5 rounded
          transition-opacity duration-150
          ${isActive
            ? 'opacity-60 hover:opacity-100 hover:bg-white/10'
            : 'opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-white/10'
          }
        `}
        title="Close (Ctrl+W)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
