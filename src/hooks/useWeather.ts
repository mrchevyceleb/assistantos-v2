import { useState, useEffect, useCallback } from 'react'
import { WeatherData } from '@/types/weather'
import { fetchWeather } from '@/services/weatherService'

interface UseWeatherResult {
  data: WeatherData | null
  loading: boolean
  error: string | null
  lastUpdated: Date | null
  refresh: () => Promise<void>
}

/**
 * Hook for fetching and managing weather data
 * @param location - City name or null for auto-detect
 * @param autoRefreshInterval - Auto-refresh interval in ms (default: 30 minutes)
 */
export function useWeather(
  location?: string | null,
  autoRefreshInterval = 30 * 60 * 1000 // 30 minutes
): UseWeatherResult {
  const [data, setData] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const weather = await fetchWeather(location)
      setData(weather)
      setLastUpdated(new Date())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch weather'
      setError(message)
      console.error('Weather fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [location])

  // Initial fetch
  useEffect(() => {
    refresh()
  }, [refresh])

  // Auto-refresh
  useEffect(() => {
    if (autoRefreshInterval <= 0) return

    const interval = setInterval(refresh, autoRefreshInterval)
    return () => clearInterval(interval)
  }, [refresh, autoRefreshInterval])

  return { data, loading, error, lastUpdated, refresh }
}
