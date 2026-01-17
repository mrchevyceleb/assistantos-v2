import { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

interface WidgetContainerProps {
  title: string
  icon: ReactNode
  children: ReactNode
  loading?: boolean
  onRefresh?: () => void
  skeletonRows?: number
}

// Skeleton loader component for loading states
function SkeletonLoader({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg animate-pulse"
            style={{ background: 'rgba(255, 255, 255, 0.05)' }}
          />
          <div className="flex-1 space-y-1.5">
            <div
              className="h-3 rounded animate-pulse"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                width: `${60 + Math.random() * 30}%`
              }}
            />
            <div
              className="h-2 rounded animate-pulse"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                width: `${40 + Math.random() * 40}%`
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function WidgetContainer({ title, icon, children, loading, onRefresh, skeletonRows = 3 }: WidgetContainerProps) {
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
            aria-label={loading ? 'Refreshing...' : 'Refresh'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <SkeletonLoader rows={skeletonRows} />
        ) : (
          children
        )}
      </div>
    </div>
  )
}
