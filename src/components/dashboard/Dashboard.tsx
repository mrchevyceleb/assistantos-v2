import { useState, useCallback } from 'react'
import { GreetingHeader } from './GreetingHeader'
import { WeatherWidget } from './WeatherWidget'
import { CalendarWidget } from './CalendarWidget'
import { TaskSummaryWidget } from './TaskSummaryWidget'
import { QuickLinksWidget } from './QuickLinksWidget'
import { OnboardingWidget } from './OnboardingWidget'
import { EmailWidget } from './EmailWidget'

export function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0)

  const handleRefresh = useCallback(() => {
    // Increment key to trigger re-mount of all widgets
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(16, 20, 32, 0.95) 0%, rgba(10, 13, 22, 0.98) 100%)'
      }}
    >
      {/* Header with Greeting and Clock */}
      <GreetingHeader onRefresh={handleRefresh} />

      {/* Widget Grid */}
      <div className="flex-1 overflow-auto p-6" key={refreshKey}>
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Onboarding Widget - spans full width */}
          <OnboardingWidget />

          {/* Top row: Weather and Email */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <WeatherWidget />
            <EmailWidget />
          </div>

          {/* Middle row: Tasks and Calendar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TaskSummaryWidget />
            <CalendarWidget />
          </div>

          {/* Bottom row: Quick Links */}
          <div className="grid grid-cols-1 gap-4">
            <QuickLinksWidget />
          </div>
        </div>
      </div>
    </div>
  )
}
