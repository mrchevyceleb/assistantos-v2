import { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

interface WidgetContainerProps {
  title: string
  icon: ReactNode
  children: ReactNode
  loading?: boolean
  onRefresh?: () => void
}

export function WidgetContainer({ title, icon, children, loading, onRefresh }: WidgetContainerProps) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(25, 32, 50, 0.6) 0%, rgba(16, 20, 32, 0.8) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.4) 0%, rgba(25, 32, 50, 0.3) 100%)'
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-cyan-400">{icon}</span>
          <span className="text-sm font-medium text-slate-300">{title}</span>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1 rounded hover:bg-white/5 transition-colors text-slate-500 hover:text-slate-400 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-5 h-5 text-slate-500 animate-spin" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
