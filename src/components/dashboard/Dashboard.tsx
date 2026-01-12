import { useState, useCallback } from 'react'
import { GreetingHeader } from './GreetingHeader'
import { WeatherWidget } from './WeatherWidget'
import { Next48HoursWidget } from './Next48HoursWidget'
import { CalendarWidget } from './CalendarWidget'
import { TaskSummaryWidget } from './TaskSummaryWidget'
import { QuickLinksWidget } from './QuickLinksWidget'
import { OnboardingWidget } from './OnboardingWidget'

export function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0)

  const handleRefresh = useCallback(() => {
    // Increment key to trigger re-mount of all widgets
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
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

          {/* Top row: Weather + Next 48 Hours */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <WeatherWidget />
            </div>
            <div className="md:col-span-2">
              <Next48HoursWidget />
            </div>
          </div>

          {/* Bottom row: Existing widgets */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <CalendarWidget />
            <TaskSummaryWidget />
            <QuickLinksWidget />
          </div>
        </div>
      </div>
    </div>
  )
}
