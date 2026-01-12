import { useState } from 'react'
import { Cloud, Droplets, Wind, MapPin, Thermometer } from 'lucide-react'
import { WidgetContainer } from './WidgetContainer'
import { useWeather } from '@/hooks/useWeather'
import { useAppStore } from '@/stores/appStore'
import { getWeatherIcon } from '@/services/weatherService'

/**
 * Weather widget showing current conditions and 2-day forecast
 * Uses wttr.in API (no API key required)
 */
export function WeatherWidget() {
  const { dashboardSettings, setDashboardSettings } = useAppStore()
  const { data, loading, error, refresh } = useWeather(dashboardSettings.weatherLocation)
  const [editingLocation, setEditingLocation] = useState(false)
  const [locationInput, setLocationInput] = useState('')

  const unit = dashboardSettings.temperatureUnit

  const toggleUnit = () => {
    setDashboardSettings({
      temperatureUnit: unit === 'F' ? 'C' : 'F',
    })
  }

  const handleLocationSubmit = () => {
    setDashboardSettings({
      weatherLocation: locationInput.trim() || null,
    })
    setEditingLocation(false)
    setLocationInput('')
  }

  if (error) {
    return (
      <WidgetContainer
        title="Weather"
        icon={<Cloud className="w-4 h-4" />}
        onRefresh={refresh}
      >
        <div className="text-center py-4">
          <Cloud className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-red-400 mb-2">{error}</p>
          <button
            onClick={refresh}
            className="text-xs text-cyan-400 hover:text-cyan-300"
          >
            Try again
          </button>
        </div>
      </WidgetContainer>
    )
  }

  return (
    <WidgetContainer
      title="Weather"
      icon={<Cloud className="w-4 h-4" />}
      loading={loading}
      onRefresh={refresh}
    >
      {data && (
        <div className="space-y-4">
          {/* Current conditions */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="text-4xl">
                {getWeatherIcon(data.current.weatherCode)}
              </span>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-light text-white">
                    {unit === 'F' ? data.current.tempF : data.current.tempC}
                  </span>
                  <button
                    onClick={toggleUnit}
                    className="text-lg text-slate-400 hover:text-cyan-400 transition-colors"
                    title="Toggle temperature unit"
                  >
                    °{unit}
                  </button>
                </div>
                <p className="text-sm text-slate-400">{data.current.weatherDesc}</p>
              </div>
            </div>
          </div>

          {/* Feels like + humidity + wind */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1" title="Feels like">
              <Thermometer className="w-3 h-3" />
              <span>
                Feels {unit === 'F' ? data.current.feelsLikeF : data.current.feelsLikeC}°
              </span>
            </div>
            <div className="flex items-center gap-1" title="Humidity">
              <Droplets className="w-3 h-3" />
              <span>{data.current.humidity}%</span>
            </div>
            <div className="flex items-center gap-1" title="Wind">
              <Wind className="w-3 h-3" />
              <span>{data.current.windSpeedKmph} km/h</span>
            </div>
          </div>

          {/* 2-day forecast */}
          {data.forecast.length > 1 && (
            <div
              className="grid grid-cols-2 gap-2 pt-3"
              style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}
            >
              {data.forecast.slice(1, 3).map((day, index) => {
                const dayName = index === 0
                  ? 'Tomorrow'
                  : new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })

                return (
                  <div
                    key={day.date}
                    className="text-center p-2 rounded-lg"
                    style={{ background: 'rgba(255, 255, 255, 0.03)' }}
                  >
                    <p className="text-xs text-slate-500 mb-1">{dayName}</p>
                    <span className="text-xl">{getWeatherIcon(day.weatherCode)}</span>
                    <p className="text-xs text-slate-400 mt-1">
                      {unit === 'F'
                        ? `${day.minTempF}° - ${day.maxTempF}°`
                        : `${day.minTempC}° - ${day.maxTempC}°`}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {/* Location */}
          <div className="pt-2" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            {editingLocation ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  placeholder="City name..."
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLocationSubmit()
                    if (e.key === 'Escape') setEditingLocation(false)
                  }}
                />
                <button
                  onClick={handleLocationSubmit}
                  className="text-xs text-cyan-400 hover:text-cyan-300"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setLocationInput(dashboardSettings.weatherLocation || '')
                  setEditingLocation(true)
                }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-400 transition-colors"
              >
                <MapPin className="w-3 h-3" />
                <span>
                  {data.location.name}
                  {data.location.region && `, ${data.location.region}`}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </WidgetContainer>
  )
}
