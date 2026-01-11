import { LayoutDashboard, RefreshCw } from 'lucide-react'
import { CalendarWidget } from './CalendarWidget'
import { TaskSummaryWidget } from './TaskSummaryWidget'
import { QuickLinksWidget } from './QuickLinksWidget'
import { OnboardingWidget } from './OnboardingWidget'

export function Dashboard() {
  const today = new Date()
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const dateString = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(16, 20, 32, 0.95) 0%, rgba(10, 13, 22, 0.98) 100%)'
      }}
    >
      {/* Header */}
      <div
        className="px-6 py-4 relative"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'linear-gradient(180deg, rgba(25, 32, 50, 0.6) 0%, rgba(16, 20, 32, 0.7) 100%)'
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-cyan-400" />
              {greeting}
            </h1>
            <p className="text-sm text-slate-400 mt-1">{dateString}</p>
          </div>
          <button
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-slate-400 hover:text-slate-300"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Widget Grid */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl space-y-4">
          {/* Onboarding Widget - spans full width */}
          <OnboardingWidget />

          {/* Main widget grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CalendarWidget />
            <TaskSummaryWidget />
            <QuickLinksWidget />
          </div>
        </div>
      </div>
    </div>
  )
}
