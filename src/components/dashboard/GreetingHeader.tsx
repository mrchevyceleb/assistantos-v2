import { LayoutDashboard, RefreshCw } from 'lucide-react'
import { ClockWidget } from './ClockWidget'
import { useClock, getGreeting } from '@/hooks/useClock'

interface GreetingHeaderProps {
  onRefresh?: () => void
  loading?: boolean
}

/**
 * Dashboard header with time-based greeting, date, and live clock
 */
export function GreetingHeader({ onRefresh, loading }: GreetingHeaderProps) {
  const time = useClock(60000) // Update greeting/date every minute

  const greeting = getGreeting(time)
  const dateString = time.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div
      className="px-6 py-5 relative"
      style={{
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        background: 'linear-gradient(180deg, rgba(25, 32, 50, 0.6) 0%, rgba(16, 20, 32, 0.7) 100%)',
      }}
    >
      <div className="flex items-start justify-between">
        {/* Left side - Greeting and Date */}
        <div>
          <h1 className="text-2xl font-semibold text-white flex items-center gap-3">
            <LayoutDashboard className="w-6 h-6 text-cyan-400" />
            {greeting}
          </h1>
          <p className="text-sm text-slate-400 mt-1 ml-9">{dateString}</p>
        </div>

        {/* Right side - Clock and Refresh */}
        <div className="flex items-center gap-4">
          <ClockWidget />
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors text-slate-400 hover:text-slate-300 disabled:opacity-50"
              title="Refresh all widgets"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
