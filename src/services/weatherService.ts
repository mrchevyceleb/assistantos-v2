// Weather service using wttr.in API (no API key required)

import { WeatherData, WttrResponse } from '@/types/weather'

/**
 * Fetch weather data from wttr.in
 * @param location - City name or coordinates. If null/undefined, auto-detects via IP
 */
export async function fetchWeather(location?: string | null): Promise<WeatherData> {
  const url = location
    ? `https://wttr.in/${encodeURIComponent(location)}?format=j1`
    : 'https://wttr.in/?format=j1' // Auto-detect via IP

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Weather fetch failed: ${response.statusText}`)
  }

  const data: WttrResponse = await response.json()
  return transformWeatherData(data)
}

/**
 * Transform wttr.in response to our WeatherData format
 */
function transformWeatherData(data: WttrResponse): WeatherData {
  const current = data.current_condition[0]
  const area = data.nearest_area[0]

  return {
    current: {
      tempC: parseInt(current.temp_C, 10),
      tempF: parseInt(current.temp_F, 10),
      feelsLikeC: parseInt(current.FeelsLikeC, 10),
      feelsLikeF: parseInt(current.FeelsLikeF, 10),
      weatherDesc: current.weatherDesc[0]?.value || 'Unknown',
      weatherCode: current.weatherCode,
      humidity: parseInt(current.humidity, 10),
      windSpeedKmph: parseInt(current.windspeedKmph, 10),
      windDir: current.winddir16Point,
    },
    forecast: data.weather.slice(0, 3).map((day) => ({
      date: day.date,
      maxTempC: parseInt(day.maxtempC, 10),
      maxTempF: parseInt(day.maxtempF, 10),
      minTempC: parseInt(day.mintempC, 10),
      minTempF: parseInt(day.mintempF, 10),
      // Use midday hourly entry for description
      weatherDesc: day.hourly[4]?.weatherDesc[0]?.value || 'Unknown',
      weatherCode: day.hourly[4]?.weatherCode || '113',
      chanceOfRain: parseInt(day.hourly[4]?.chanceofrain || '0', 10),
    })),
    location: {
      name: area.areaName[0]?.value || 'Unknown',
      region: area.region[0]?.value || '',
      country: area.country[0]?.value || '',
    },
  }
}

/**
 * Map wttr.in weather codes to emoji icons
 * See: https://www.worldweatheronline.com/developer/api/docs/weather-icons.aspx
 */
export function getWeatherIcon(weatherCode: string): string {
  const code = parseInt(weatherCode, 10)

  // Sunny / Clear
  if (code === 113) return '☀️'

  // Partly cloudy
  if (code === 116) return '⛅'

  // Cloudy
  if (code === 119) return '☁️'

  // Overcast
  if (code === 122) return '☁️'

  // Mist / Fog
  if ([143, 248, 260].includes(code)) return '🌫️'

  // Patchy rain / Light rain / Drizzle
  if ([176, 263, 266, 293, 296, 353].includes(code)) return '🌧️'

  // Moderate rain / Heavy rain
  if ([299, 302, 305, 308, 356, 359].includes(code)) return '🌧️'

  // Patchy snow / Light snow
  if ([179, 323, 326, 368].includes(code)) return '🌨️'

  // Moderate snow / Heavy snow / Blizzard
  if ([227, 230, 329, 332, 335, 338, 371, 395].includes(code)) return '❄️'

  // Sleet
  if ([182, 185, 281, 284, 311, 314, 317, 350, 362, 365, 374, 377].includes(code)) return '🌨️'

  // Thunderstorm
  if ([200, 386, 389, 392].includes(code)) return '⛈️'

  // Default
  return '🌡️'
}

/**
 * Get a human-readable weather description
 */
export function getWeatherDescription(weatherCode: string): string {
  const code = parseInt(weatherCode, 10)

  const descriptions: Record<number, string> = {
    113: 'Clear',
    116: 'Partly Cloudy',
    119: 'Cloudy',
    122: 'Overcast',
    143: 'Mist',
    176: 'Light Rain',
    179: 'Light Snow',
    182: 'Sleet',
    185: 'Freezing Drizzle',
    200: 'Thunderstorm',
    227: 'Blowing Snow',
    230: 'Blizzard',
    248: 'Fog',
    260: 'Freezing Fog',
    263: 'Light Drizzle',
    266: 'Drizzle',
    281: 'Freezing Drizzle',
    284: 'Heavy Freezing Drizzle',
    293: 'Light Rain',
    296: 'Light Rain',
    299: 'Moderate Rain',
    302: 'Moderate Rain',
    305: 'Heavy Rain',
    308: 'Heavy Rain',
    311: 'Light Freezing Rain',
    314: 'Freezing Rain',
    317: 'Sleet',
    320: 'Light Sleet',
    323: 'Light Snow',
    326: 'Light Snow',
    329: 'Moderate Snow',
    332: 'Moderate Snow',
    335: 'Heavy Snow',
    338: 'Heavy Snow',
    350: 'Ice Pellets',
    353: 'Light Rain Showers',
    356: 'Rain Showers',
    359: 'Heavy Rain',
    362: 'Light Sleet Showers',
    365: 'Sleet Showers',
    368: 'Light Snow Showers',
    371: 'Snow Showers',
    374: 'Light Ice Pellets',
    377: 'Ice Pellets',
    386: 'Thunderstorm',
    389: 'Heavy Thunderstorm',
    392: 'Thunderstorm with Snow',
    395: 'Heavy Snow with Thunder',
  }

  return descriptions[code] || 'Unknown'
}
