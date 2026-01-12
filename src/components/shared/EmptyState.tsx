import { ReactNode } from 'react'
import { Inbox, FileText, MessageSquare, Settings, Search, FolderOpen } from 'lucide-react'

type EmptyStateType = 'default' | 'files' | 'messages' | 'settings' | 'search' | 'folder'

interface EmptyStateProps {
  type?: EmptyStateType
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

const defaultIcons: Record<EmptyStateType, ReactNode> = {
  default: <Inbox className="w-12 h-12" />,
  files: <FileText className="w-12 h-12" />,
  messages: <MessageSquare className="w-12 h-12" />,
  settings: <Settings className="w-12 h-12" />,
  search: <Search className="w-12 h-12" />,
  folder: <FolderOpen className="w-12 h-12" />
}

/**
 * Reusable empty state component for when there's no content to display
 */
export function EmptyState({
  type = 'default',
  icon,
  title,
  description,
  action,
  className = ''
}: EmptyStateProps) {
  const displayIcon = icon || defaultIcons[type]

  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      <div className="text-slate-500 mb-4">
        {displayIcon}
      </div>

      <h3 className="text-lg font-medium text-slate-300 mb-2">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-slate-500 max-w-sm mb-4">
          {description}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

/**
 * Compact empty state for inline use (e.g., in sidebars)
 */
export function CompactEmptyState({
  icon,
  message,
  className = ''
}: {
  icon?: ReactNode
  message: string
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-6 text-center ${className}`}>
      {icon && (
        <div className="text-slate-600 mb-2">
          {icon}
        </div>
      )}
      <p className="text-xs text-slate-500">{message}</p>
    </div>
  )
}
