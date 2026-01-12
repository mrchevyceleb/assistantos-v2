// Weather data types for wttr.in API integration

export interface WeatherData {
  current: {
    tempC: number
    tempF: number
    feelsLikeC: number
    feelsLikeF: number
    weatherDesc: string
    weatherCode: string
    humidity: number
    windSpeedKmph: number
    windDir: string
  }
  forecast: WeatherForecast[]
  location: {
    name: string
    region: string
    country: string
  }
}

export interface WeatherForecast {
  date: string
  maxTempC: number
  maxTempF: number
  minTempC: number
  minTempF: number
  weatherDesc: string
  weatherCode: string
  chanceOfRain: number
}

// wttr.in API response types
export interface WttrResponse {
  current_condition: Array<{
    temp_C: string
    temp_F: string
    weatherDesc: Array<{ value: string }>
    weatherCode: string
    humidity: string
    windspeedKmph: string
    winddir16Point: string
    FeelsLikeC: string
    FeelsLikeF: string
  }>
  nearest_area: Array<{
    areaName: Array<{ value: string }>
    region: Array<{ value: string }>
    country: Array<{ value: string }>
  }>
  weather: Array<{
    date: string
    maxtempC: string
    maxtempF: string
    mintempC: string
    mintempF: string
    hourly: Array<{
      weatherDesc: Array<{ value: string }>
      weatherCode: string
      chanceofrain: string
    }>
  }>
}

// Dashboard settings for persistence
export interface DashboardSettings {
  weatherLocation: string | null  // null = auto-detect via IP
  temperatureUnit: 'C' | 'F'
  clockFormat: '12h' | '24h'
  showSeconds: boolean
}

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  weatherLocation: null,
  temperatureUnit: 'F',
  clockFormat: '12h',
  showSeconds: false,
}
