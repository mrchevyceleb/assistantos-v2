import { useState, useEffect, useCallback } from 'react'
import { Clock, Calendar, CheckSquare, AlertCircle } from 'lucide-react'
import { WidgetContainer } from './WidgetContainer'
import { useAppStore } from '@/stores/appStore'
import { useTabStore } from '@/stores/tabStore'
import { parseTasksFromWorkspace } from '@/services/taskParser'
import { ParsedTask, TaskStatus } from '@/types/task'

interface TimelineItem {
  id: string
  type: 'task' | 'event'
  title: string
  time: Date
  endTime?: Date
  status?: TaskStatus
  priority?: 'high' | 'medium' | 'low'
  projectName?: string
  htmlLink?: string
  filePath?: string
  lineNumber?: number
}

interface CalendarEvent {
  id: string
  summary: string
  start: string
  end: string
  htmlLink?: string
}

/**
 * Parse a due date string into a Date object
 * Supports: "YYYY-MM-DD", "today", "tomorrow", "MM/DD"
 */
function parseDueDate(dueDateStr: string): Date | null {
  const now = new Date()
  const lower = dueDateStr.toLowerCase().trim()

  if (lower === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  }

  if (lower === 'tomorrow') {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59)
  }

  // Try ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)) {
    const date = new Date(dueDateStr + 'T23:59:59')
    return isNaN(date.getTime()) ? null : date
  }

  // Try MM/DD format
  if (/^\d{1,2}\/\d{1,2}$/.test(dueDateStr)) {
    const [month, day] = dueDateStr.split('/').map(Number)
    return new Date(now.getFullYear(), month - 1, day, 23, 59, 59)
  }

  return null
}

/**
 * Group timeline items by day
 */
function groupByDay(items: TimelineItem[]): Map<string, TimelineItem[]> {
  const groups = new Map<string, TimelineItem[]>()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dayAfter = new Date(today)
  dayAfter.setDate(dayAfter.getDate() + 2)

  for (const item of items) {
    const itemDate = new Date(item.time.getFullYear(), item.time.getMonth(), item.time.getDate())
    let dayLabel: string

    if (itemDate.getTime() === today.getTime()) {
      dayLabel = 'Today'
    } else if (itemDate.getTime() === tomorrow.getTime()) {
      dayLabel = 'Tomorrow'
    } else {
      dayLabel = item.time.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    }

    if (!groups.has(dayLabel)) {
      groups.set(dayLabel, [])
    }
    groups.get(dayLabel)!.push(item)
  }

  return groups
}

/**
 * Next 48 Hours Widget - Combined timeline of tasks and calendar events
 */
export function Next48HoursWidget() {
  const { workspacePath, integrationConfigs } = useAppStore()
  const openOrFocusTasks = useTabStore((state) => state.openOrFocusTasks)
  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const calendarConfig = integrationConfigs['calendar']
  const isCalendarConfigured = calendarConfig?.enabled

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError(null)

    const timelineItems: TimelineItem[] = []
    const now = new Date()
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000)

    try {
      // 1. Load tasks with due dates
      if (workspacePath) {
        const tasks = await parseTasksFromWorkspace(workspacePath)
        const upcomingTasks = tasks.filter((task: ParsedTask) => {
          if (!task.dueDate || task.status === 'done') return false
          const dueDate = parseDueDate(task.dueDate)
          if (!dueDate) return false
          return dueDate >= now && dueDate <= in48Hours
        })

        timelineItems.push(
          ...upcomingTasks.map((task: ParsedTask) => ({
            id: task.id,
            type: 'task' as const,
            title: task.text,
            time: parseDueDate(task.dueDate!)!,
            status: task.status,
            priority: task.priority,
            projectName: task.projectName,
            filePath: task.filePath,
            lineNumber: task.lineNumber,
          }))
        )
      }

      // 2. Load calendar events (if configured)
      if (isCalendarConfigured && window.electronAPI?.mcp) {
        try {
          const isReady = await window.electronAPI.mcp.isReady('calendar')
          if (!isReady) {
            await window.electronAPI.mcp.start('calendar')
          }

          const result = await window.electronAPI.mcp.executeTool(
            'calendar',
            'mcp__google-calendar__list-events',
            {
              calendarId: 'primary',
              timeMin: now.toISOString(),
              timeMax: in48Hours.toISOString(),
            }
          )

          if (result?.success && result.result) {
            // Parse the response - format may vary based on MCP implementation
            const resultData = result.result as { content?: Array<{ text?: string }> }
            const content = resultData?.content?.[0]?.text || ''
            try {
              // Try to parse as JSON array of events
              const events: CalendarEvent[] = JSON.parse(content)
              timelineItems.push(
                ...events.map((event) => ({
                  id: event.id,
                  type: 'event' as const,
                  title: event.summary,
                  time: new Date(event.start),
                  endTime: new Date(event.end),
                  htmlLink: event.htmlLink,
                }))
              )
            } catch {
              // If not JSON, events may be in a different format
              console.log('Calendar response format not JSON:', content.slice(0, 200))
            }
          }
        } catch (err) {
          console.error('Calendar fetch error:', err)
          // Don't fail the whole widget, just show tasks
        }
      }

      // 3. Sort by time
      timelineItems.sort((a, b) => a.time.getTime() - b.time.getTime())

      setItems(timelineItems)
    } catch (err) {
      setError('Failed to load timeline')
      console.error('Timeline load error:', err)
    } finally {
      setLoading(false)
    }
  }, [workspacePath, isCalendarConfigured])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const getPriorityColor = (priority?: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high':
        return 'text-red-400'
      case 'medium':
        return 'text-amber-400'
      case 'low':
        return 'text-slate-400'
      default:
        return 'text-slate-500'
    }
  }

  const handleItemClick = (item: TimelineItem) => {
    if (item.type === 'event' && item.htmlLink) {
      window.electronAPI?.shell.openExternal(item.htmlLink)
    } else if (item.type === 'task') {
      openOrFocusTasks()
    }
  }

  const groupedItems = groupByDay(items)

  return (
    <WidgetContainer
      title="Next 48 Hours"
      icon={<Clock className="w-4 h-4" />}
      loading={loading}
      onRefresh={loadItems}
    >
      {error ? (
        <div className="text-center py-4">
          <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-6">
          <Calendar className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Nothing scheduled</p>
          <p className="text-xs text-slate-500 mt-1">
            Add tasks with @due() or configure @calendar
          </p>
        </div>
      ) : (
        <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
          {Array.from(groupedItems.entries()).map(([dayLabel, dayItems]) => (
            <div key={dayLabel}>
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                {dayLabel}
              </h4>
              <div className="space-y-1">
                {dayItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className="w-full flex items-start gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                  >
                    {/* Icon */}
                    <div className="mt-0.5">
                      {item.type === 'task' ? (
                        <CheckSquare className="w-4 h-4 text-violet-400" />
                      ) : (
                        <Calendar className="w-4 h-4 text-cyan-400" />
                      )}
                    </div>

                    {/* Time */}
                    <div className="text-xs text-slate-500 min-w-[55px] mt-0.5">
                      {formatTime(item.time)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300 truncate group-hover:text-white transition-colors">
                        {item.title}
                      </p>
                      {item.type === 'task' && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.projectName && (
                            <span className="text-xs text-slate-600">{item.projectName}</span>
                          )}
                          {item.priority && (
                            <span className={`text-xs ${getPriorityColor(item.priority)}`}>
                              !{item.priority}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetContainer>
  )
}
