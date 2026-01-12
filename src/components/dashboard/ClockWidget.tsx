import { useClock, formatTime } from '@/hooks/useClock'
import { useAppStore } from '@/stores/appStore'

/**
 * Digital clock component with ticking seconds
 * Displays time in 12h or 24h format based on user settings
 */
export function ClockWidget() {
  const time = useClock(1000) // Update every second
  const { dashboardSettings } = useAppStore()

  const formattedTime = formatTime(
    time,
    dashboardSettings.clockFormat,
    dashboardSettings.showSeconds
  )

  return (
    <div className="font-display tabular-nums">
      <span className="text-3xl font-light text-white tracking-tight">
        {formattedTime}
      </span>
    </div>
  )
}
