import { useState, useEffect } from 'react'
import { Kanban, Circle, AlertCircle, Play, HelpCircle, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { WidgetContainer } from './WidgetContainer'
import { parseTasksFromWorkspace, getTasksFolder } from '../../services/taskParser'
import { ParsedTask, TaskStatus, DEFAULT_KANBAN_SETTINGS } from '../../types/task'

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

  // Group tasks by status
  const tasksByStatus: Record<TaskStatus, number> = {
    backlog: tasks.filter(t => t.status === 'backlog').length,
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    review: tasks.filter(t => t.status === 'review').length,
    done: tasks.filter(t => t.status === 'done').length,
  }

  const activeTasks = tasksByStatus.todo + tasksByStatus.in_progress + tasksByStatus.review
  const completedTasks = tasksByStatus.done

  // Check for overdue tasks (not done)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdueTasks = tasks.filter(t => {
    if (!t.dueDate || t.status === 'done') return false
    const dueDate = new Date(t.dueDate)
    return dueDate < today
  })

  const completionPercent = tasks.length > 0
    ? Math.round((completedTasks / tasks.length) * 100)
    : 0

  return (
    <WidgetContainer
      title="Kanban"
      icon={<Kanban className="w-4 h-4" />}
      loading={loading}
      onRefresh={loadTasks}
    >
      {!workspacePath ? (
        <p className="text-sm text-slate-400 text-center py-4">Open a workspace to see tasks</p>
      ) : !tasksExist ? (
        <div className="text-center py-4">
          <Kanban className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No "{effectiveTasksFolder}" folder</p>
          <p className="text-xs text-slate-500 mt-1">Go to Tasks to set up your Kanban board</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-4">
          <Kanban className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No tasks found</p>
          <p className="text-xs text-slate-500 mt-1">Add tasks with - [ ] checkboxes</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>{activeTasks} active</span>
              <span>{completionPercent}% done</span>
            </div>
            <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${completionPercent}%`,
                  background: 'linear-gradient(90deg, #10b981, #059669)'
                }}
              />
            </div>
          </div>

          {/* Status breakdown */}
          <div className="grid grid-cols-5 gap-1">
            <div className="text-center p-1.5 rounded-lg bg-white/5" title="Backlog">
              <Circle className="w-3 h-3 text-slate-400 mx-auto mb-0.5" />
              <div className="text-sm font-semibold text-slate-400">{tasksByStatus.backlog}</div>
            </div>
            <div className="text-center p-1.5 rounded-lg bg-white/5" title="Todo">
              <Circle className="w-3 h-3 text-blue-400 mx-auto mb-0.5" />
              <div className="text-sm font-semibold text-blue-400">{tasksByStatus.todo}</div>
            </div>
            <div className="text-center p-1.5 rounded-lg bg-white/5" title="In Progress">
              <Play className="w-3 h-3 text-amber-400 mx-auto mb-0.5" />
              <div className="text-sm font-semibold text-amber-400">{tasksByStatus.in_progress}</div>
            </div>
            <div className="text-center p-1.5 rounded-lg bg-white/5" title="Review">
              <HelpCircle className="w-3 h-3 text-purple-400 mx-auto mb-0.5" />
              <div className="text-sm font-semibold text-purple-400">{tasksByStatus.review}</div>
            </div>
            <div className="text-center p-1.5 rounded-lg bg-white/5" title="Done">
              <CheckCircle2 className="w-3 h-3 text-emerald-400 mx-auto mb-0.5" />
              <div className="text-sm font-semibold text-emerald-400">{tasksByStatus.done}</div>
            </div>
          </div>

          {/* Alerts */}
          {overdueTasks.length > 0 && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400">{overdueTasks.length} overdue</span>
            </div>
          )}

          {/* View all link */}
          <button
            onClick={() => setCenterPanelView('tasks')}
            className="w-full text-sm text-cyan-400 hover:text-cyan-300 py-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            Open Kanban Board
          </button>
        </div>
      )}
    </WidgetContainer>
  )
}
