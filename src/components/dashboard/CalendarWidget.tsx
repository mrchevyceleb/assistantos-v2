import { useState, useEffect } from 'react'
import { Calendar, Clock, Settings } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { WidgetContainer } from './WidgetContainer'

interface CalendarEvent {
  id: string
  summary: string
  start: string
  end: string
  htmlLink?: string
}

export function CalendarWidget() {
  const { integrationConfigs } = useAppStore()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const calendarConfig = integrationConfigs['calendar']
  const isConfigured = calendarConfig?.enabled

  useEffect(() => {
    if (isConfigured) {
      fetchEvents()
    }
  }, [isConfigured])

  const fetchEvents = async () => {
    setLoading(true)
    setError(null)
    try {
      // Check if MCP is ready
      const isReady = await window.electronAPI?.mcp.isReady('calendar')
      if (!isReady) {
        await window.electronAPI?.mcp.start('calendar')
      }

      // Get today's events
      const now = new Date()
      const startOfDay = new Date(now)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(now)
      endOfDay.setHours(23, 59, 59, 999)

      // Format dates without timezone (YYYY-MM-DDTHH:mm:ss)
      const formatDateForCalendar = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        const seconds = String(date.getSeconds()).padStart(2, '0')
        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
      }

      // List available tools
      const availableTools = await window.electronAPI?.mcp.getTools(['calendar'])

      // Find the list-events tool
      const listEventsTool = availableTools?.find((t: any) =>
        t.name?.includes('list') && t.name?.includes('event')
      )

      const result = await window.electronAPI?.mcp.executeTool(
        'calendar',
        listEventsTool?.name || 'calendar_list-events',
        {
          calendarId: 'primary',
          timeMin: formatDateForCalendar(startOfDay),
          timeMax: formatDateForCalendar(endOfDay)
        }
      )

      if (result?.success && result.result) {

        // Helper to extract datetime string from various formats
        const extractDateTime = (dateObj: any): string => {
          if (typeof dateObj === 'string') {
            return dateObj
          }
          // Google Calendar API format: { dateTime: "2024-01-13T10:00:00-05:00" }
          if (dateObj?.dateTime) {
            return dateObj.dateTime
          }
          // All-day event format: { date: "2024-01-13" }
          if (dateObj?.date) {
            return dateObj.date
          }
          return new Date().toISOString()
        }

        try {
          // MCP returns: [{ type: "text", text: "{\"events\":[...],\"totalCount\":0}" }]
          let eventsData = result.result

          // Extract text from MCP format
          if (Array.isArray(eventsData) && eventsData[0]?.type === 'text') {
            const textContent = eventsData[0].text || ''
            if (textContent.trim()) {
              eventsData = JSON.parse(textContent)
            } else {
              setEvents([])
              return
            }
          }

          // Now eventsData should be { events: [...], totalCount: 0 }
          const eventsList = eventsData.events || eventsData

          if (Array.isArray(eventsList)) {
            setEvents(eventsList.map((event: any) => ({
              id: event.id || Math.random().toString(),
              summary: event.summary || 'Untitled Event',
              start: extractDateTime(event.start),
              end: extractDateTime(event.end),
              htmlLink: event.htmlLink,
            })))
          } else {
            setEvents([])
          }
        } catch (err) {
          console.error('[CalendarWidget] Parse error:', err)
          setEvents([])
        }
      } else {
        setEvents([])
      }
    } catch (err) {
      setError('Failed to fetch calendar events')
      console.error('[CalendarWidget] Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString)
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'Time TBD'
      }
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } catch {
      return 'Time TBD'
    }
  }

  if (!isConfigured) {
    return (
      <WidgetContainer title="Calendar" icon={<Calendar className="w-4 h-4" />}>
        <div className="text-center py-6">
          <Calendar className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <p className="text-sm text-slate-400 mb-3">Calendar not configured</p>
          <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 mx-auto">
            <Settings className="w-3 h-3" />
            Configure in Integrations
          </button>
        </div>
      </WidgetContainer>
    )
  }

  return (
    <WidgetContainer
      title="Today's Events"
      icon={<Calendar className="w-4 h-4" />}
      loading={loading}
      onRefresh={fetchEvents}
      skeletonRows={4}
    >
      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : events.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-slate-400">No events scheduled for today</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              onClick={() => event.htmlLink && window.electronAPI?.shell.openExternal(event.htmlLink)}
            >
              <div className="flex items-center gap-1 text-xs text-slate-500 min-w-[60px]">
                <Clock className="w-3 h-3" />
                {formatTime(event.start)}
              </div>
              <span className="text-sm text-slate-300">{event.summary}</span>
            </div>
          ))}
        </div>
      )}
    </WidgetContainer>
  )
}
