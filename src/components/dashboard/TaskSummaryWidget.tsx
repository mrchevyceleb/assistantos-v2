import { useState, useEffect } from 'react'
import { CheckSquare, AlertCircle, Circle, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { WidgetContainer } from './WidgetContainer'
import { parseTasksFromWorkspace, getTasksFolder } from '../../services/taskParser'
import { ParsedTask, DEFAULT_KANBAN_SETTINGS, TASK_STATUS_CONFIG } from '../../types/task'

interface TaskGroup {
  label: string
  tasks: ParsedTask[]
  color: string
  bgColor: string
}

export function TaskSummaryWidget() {
  const { workspacePath, setCenterPanelView, kanbanSettings } = useAppStore()
  const [tasks, setTasks] = useState<ParsedTask[]>([])
  const [loading, setLoading] = useState(false)
  const [tasksExist, setTasksExist] = useState(true)

  const settings = kanbanSettings || DEFAULT_KANBAN_SETTINGS
  const effectiveTasksFolder = getTasksFolder(settings.customTasksFolder)

  useEffect(() => {
    if (workspacePath) {
      loadTasks()
    }
  }, [workspacePath, settings.customTasksFolder])

  const loadTasks = async () => {
    if (!workspacePath) return
    setLoading(true)
    try {
      // Check if tasks folder exists
      if (window.electronAPI) {
        const tasksPath = `${workspacePath.replace(/\\/g, '/')}/${effectiveTasksFolder}`
        const exists = await window.electronAPI.fs.exists(tasksPath)
        setTasksExist(exists)
        if (!exists) {
          setTasks([])
          setLoading(false)
          return
        }
      }

      const parsedTasks = await parseTasksFromWorkspace(workspacePath, null, settings.customTasksFolder)
      setTasks(parsedTasks)
    } catch (err) {
      console.error('Failed to parse tasks:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filter and group tasks
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dayAfterTomorrow = new Date(today)
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)

  // Filter out completed tasks and group by due date
  const activeTasks = tasks.filter(t => t.status !== 'done')

  const overdueTasks = activeTasks.filter(t => {
    if (!t.dueDate) return false
    const dueDate = new Date(t.dueDate)
    return dueDate < today
  }).sort((a, b) => {
    const aDate = new Date(a.dueDate || 0)
    const bDate = new Date(b.dueDate || 0)
    return aDate.getTime() - bDate.getTime()
  })

  const todayTasks = activeTasks.filter(t => {
    if (!t.dueDate) return false
    const dueDate = new Date(t.dueDate)
    return dueDate >= today && dueDate < tomorrow
  })

  const tomorrowTasks = activeTasks.filter(t => {
    if (!t.dueDate) return false
    const dueDate = new Date(t.dueDate)
    return dueDate >= tomorrow && dueDate < dayAfterTomorrow
  })

  // Tasks without due date or due later
  const otherTasks = activeTasks.filter(t => {
    if (!t.dueDate) return true
    const dueDate = new Date(t.dueDate)
    return dueDate >= dayAfterTomorrow
  })

  const taskGroups: TaskGroup[] = [
    { label: 'Overdue', tasks: overdueTasks, color: 'text-red-400', bgColor: 'bg-red-500/10' },
    { label: 'Today', tasks: todayTasks, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10' },
    { label: 'Tomorrow', tasks: tomorrowTasks, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  ].filter(g => g.tasks.length > 0)

  const totalActive = activeTasks.length
  const hasNoUpcoming = taskGroups.length === 0 && otherTasks.length > 0

  const getStatusIcon = (status: ParsedTask['status']) => {
    const config = TASK_STATUS_CONFIG[status]
    switch (status) {
      case 'done':
        return <CheckCircle2 className={`w-3.5 h-3.5 ${config.color}`} />
      case 'in_progress':
        return <Circle className={`w-3.5 h-3.5 ${config.color} animate-pulse`} />
      default:
        return <Circle className={`w-3.5 h-3.5 ${config.color}`} />
    }
  }

  const renderTaskItem = (task: ParsedTask, showProject = true) => (
    <div
      key={task.id}
      className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-white/5 cursor-pointer transition-colors"
      onClick={() => setCenterPanelView('tasks')}
    >
      {getStatusIcon(task.status)}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-200 truncate">{task.text}</p>
        {showProject && task.projectName && (
          <p className="text-[10px] text-slate-500 truncate">{task.projectName}</p>
        )}
      </div>
    </div>
  )

  return (
    <WidgetContainer
      title="Tasks"
      icon={<CheckSquare className="w-4 h-4" />}
      loading={loading}
      onRefresh={loadTasks}
    >
      {!workspacePath ? (
        <p className="text-sm text-slate-400 text-center py-4">Open a workspace to see tasks</p>
      ) : !tasksExist ? (
        <div className="text-center py-4">
          <CheckSquare className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No "{effectiveTasksFolder}" folder</p>
          <p className="text-xs text-slate-500 mt-1">Go to Tasks to set up your task board</p>
        </div>
      ) : totalActive === 0 ? (
        <div className="text-center py-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">All caught up!</p>
          <p className="text-xs text-slate-500 mt-1">No active tasks</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {/* Task groups by due date */}
          {taskGroups.map(group => (
            <div key={group.label}>
              <div className={`flex items-center gap-2 px-2 py-1 rounded ${group.bgColor}`}>
                {group.label === 'Overdue' && <AlertCircle className="w-3 h-3 text-red-400" />}
                <span className={`text-xs font-medium ${group.color}`}>
                  {group.label} ({group.tasks.length})
                </span>
              </div>
              <div className="mt-1">
                {group.tasks.slice(0, 3).map(task => renderTaskItem(task))}
                {group.tasks.length > 3 && (
                  <p className="text-[10px] text-slate-500 px-2 py-1">
                    +{group.tasks.length - 3} more
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Show "other" tasks if there are no upcoming */}
          {hasNoUpcoming && (
            <div>
              <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-500/10">
                <span className="text-xs font-medium text-slate-400">
                  Upcoming ({otherTasks.length})
                </span>
              </div>
              <div className="mt-1">
                {otherTasks.slice(0, 5).map(task => renderTaskItem(task))}
                {otherTasks.length > 5 && (
                  <p className="text-[10px] text-slate-500 px-2 py-1">
                    +{otherTasks.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* View all link */}
          <button
            onClick={() => setCenterPanelView('tasks')}
            className="w-full text-sm text-cyan-400 hover:text-cyan-300 py-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            View All Tasks ({totalActive})
          </button>
        </div>
      )}
    </WidgetContainer>
  )
}
