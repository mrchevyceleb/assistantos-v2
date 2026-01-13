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
      const endOfDay = new Date(now)
      endOfDay.setHours(23, 59, 59, 999)

      const result = await window.electronAPI?.mcp.executeTool(
        'calendar',
        'mcp__google-calendar__list-events',
        {
          calendarId: 'primary',
          timeMin: now.toISOString(),
          timeMax: endOfDay.toISOString()
        }
      )

      if (result?.success && result.result) {
        // Parse the response - format may vary based on MCP implementation
        const resultData = result.result as { content?: Array<{ text?: string }> }
        const content = resultData?.content?.[0]?.text || ''
        try {
          // Try to parse as JSON array of events
          const parsedEvents: CalendarEvent[] = JSON.parse(content)
          setEvents(parsedEvents.map(event => ({
            id: event.id,
            summary: event.summary,
            start: event.start,
            end: event.end,
            htmlLink: event.htmlLink,
          })))
        } catch {
          // If result.result is already an array, use it directly
          if (Array.isArray(result.result)) {
            setEvents(result.result.map((event: any) => ({
              id: event.id,
              summary: event.summary,
              start: event.start,
              end: event.end,
              htmlLink: event.htmlLink,
            })))
          } else {
            console.log('[CalendarWidget] Calendar response format:', typeof result.result, content?.slice(0, 200))
            setEvents([])
          }
        }
      } else {
        console.log('[CalendarWidget] No result or unsuccessful:', result)
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
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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
