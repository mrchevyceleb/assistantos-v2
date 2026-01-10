import { useState, useEffect } from 'react'
import { CheckSquare, Circle, AlertCircle } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { WidgetContainer } from './WidgetContainer'
import { parseTasksFromWorkspace } from '../../services/taskParser'
import { ParsedTask } from '../../types/task'

export function TaskSummaryWidget() {
  const { workspacePath, setCenterPanelView } = useAppStore()
  const [tasks, setTasks] = useState<ParsedTask[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (workspacePath) {
      loadTasks()
    }
  }, [workspacePath])

  const loadTasks = async () => {
    if (!workspacePath) return
    setLoading(true)
    try {
      const parsedTasks = await parseTasksFromWorkspace(workspacePath)
      setTasks(parsedTasks)
    } catch (err) {
      console.error('Failed to parse tasks:', err)
    } finally {
      setLoading(false)
    }
  }

  const openTasks = tasks.filter(t => !t.completed)
  const completedTasks = tasks.filter(t => t.completed)
  const highPriorityTasks = openTasks.filter(t => t.priority === 'high')

  // Check for overdue tasks
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdueTasks = openTasks.filter(t => {
    if (!t.dueDate) return false
    const dueDate = new Date(t.dueDate)
    return dueDate < today
  })

  const completionPercent = tasks.length > 0
    ? Math.round((completedTasks.length / tasks.length) * 100)
    : 0

  return (
    <WidgetContainer
      title="Tasks"
      icon={<CheckSquare className="w-4 h-4" />}
      loading={loading}
      onRefresh={loadTasks}
    >
      {!workspacePath ? (
        <p className="text-sm text-slate-400 text-center py-4">Open a workspace to see tasks</p>
      ) : tasks.length === 0 ? (
        <div className="text-center py-4">
          <CheckSquare className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No tasks found</p>
          <p className="text-xs text-slate-500 mt-1">Create a markdown file with - [ ] checkboxes</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>{completedTasks.length} of {tasks.length} completed</span>
              <span>{completionPercent}%</span>
            </div>
            <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${completionPercent}%`,
                  background: 'linear-gradient(90deg, #00d4ff, #00a8cc)'
                }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 rounded-lg bg-white/5">
              <div className="text-lg font-semibold text-cyan-400">{openTasks.length}</div>
              <div className="text-xs text-slate-500">Open</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/5">
              <div className={`text-lg font-semibold ${overdueTasks.length > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {overdueTasks.length}
              </div>
              <div className="text-xs text-slate-500">Overdue</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/5">
              <div className={`text-lg font-semibold ${highPriorityTasks.length > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                {highPriorityTasks.length}
              </div>
              <div className="text-xs text-slate-500">High Priority</div>
            </div>
          </div>

          {/* View all link */}
          <button
            onClick={() => setCenterPanelView('tasks')}
            className="w-full text-sm text-cyan-400 hover:text-cyan-300 py-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            View all tasks
          </button>
        </div>
      )}
    </WidgetContainer>
  )
}
