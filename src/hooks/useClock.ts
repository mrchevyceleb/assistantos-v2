import { useState, useEffect } from 'react'

/**
 * Hook that provides a live updating Date object
 * @param updateInterval - Interval in milliseconds (default: 1000ms / 1 second)
 * @returns Current Date object that updates every interval
 */
export function useClock(updateInterval = 1000): Date {
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date())
    }, updateInterval)

    return () => clearInterval(interval)
  }, [updateInterval])

  return time
}

/**
 * Format time based on user preferences
 */
export function formatTime(
  date: Date,
  format: '12h' | '24h' = '12h',
  showSeconds = false
): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: format === '12h',
  }

  if (showSeconds) {
    options.second = '2-digit'
  }

  return date.toLocaleTimeString('en-US', options)
}

/**
 * Get time-based greeting
 */
export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours()

  if (hour < 12) {
    return 'Good morning'
  } else if (hour < 18) {
    return 'Good afternoon'
  } else {
    return 'Good evening'
  }
}
