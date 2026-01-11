import { useState, useEffect, useCallback } from 'react'
import { CheckSquare, RefreshCw } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { parseTasksFromWorkspace } from '../../services/taskParser'
import { ParsedTask } from '../../types/task'
import { TaskFilters } from './TaskFilters'
import { TaskList } from './TaskList'

export function TaskPanel() {
  const { workspacePath, taskSettings } = useAppStore()
  const [tasks, setTasks] = useState<ParsedTask[]>([])
  const [loading, setLoading] = useState(false)

  const loadTasks = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    try {
      const parsedTasks = await parseTasksFromWorkspace(
        workspacePath,
        taskSettings.taskSourcePaths,
        taskSettings.scanEntireWorkspace
      )
      setTasks(parsedTasks)
    } catch (err) {
      console.error('Failed to parse tasks:', err)
    } finally {
      setLoading(false)
    }
  }, [workspacePath, taskSettings.taskSourcePaths, taskSettings.scanEntireWorkspace])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // Filter and sort tasks
  let displayTasks = [...tasks]

  // Filter completed
  if (!taskSettings.showCompleted) {
    displayTasks = displayTasks.filter(t => !t.completed)
  }

  // Sort
  switch (taskSettings.sortBy) {
    case 'priority':
      const priorityOrder = { high: 0, medium: 1, low: 2, undefined: 3 }
      displayTasks.sort((a, b) => {
        const aPriority = priorityOrder[a.priority || 'undefined']
        const bPriority = priorityOrder[b.priority || 'undefined']
        return aPriority - bPriority
      })
      break
    case 'date':
      displayTasks.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      })
      break
    // 'file' is default - already sorted by file in parser
  }

  const openCount = tasks.filter(t => !t.completed).length
  const totalCount = tasks.length

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(16, 20, 32, 0.95) 0%, rgba(10, 13, 22, 0.98) 100%)'
      }}
    >
      {/* Header */}
      <div
        className="px-6 py-4 relative"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'linear-gradient(180deg, rgba(25, 32, 50, 0.6) 0%, rgba(16, 20, 32, 0.7) 100%)'
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckSquare className="w-5 h-5 text-cyan-400" />
            <div>
              <h1 className="text-lg font-semibold text-white">Tasks</h1>
              <p className="text-xs text-slate-400">
                {openCount} open / {totalCount} total
              </p>
            </div>
          </div>
          <button
            onClick={loadTasks}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-slate-400 hover:text-slate-300 disabled:opacity-50"
            title="Refresh tasks"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <TaskFilters />

      {/* Task List */}
      <div className="flex-1 overflow-auto">
        {!workspacePath ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <CheckSquare className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-slate-400 mb-2">No workspace open</p>
            <p className="text-sm text-slate-500">Open a folder to see tasks from your markdown files</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
          </div>
        ) : displayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <CheckSquare className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-slate-400 mb-2">No tasks found</p>
            <p className="text-sm text-slate-500">
              Create tasks in markdown files using:<br />
              <code className="text-cyan-400">- [ ] Task description</code>
            </p>
          </div>
        ) : (
          <TaskList tasks={displayTasks} onTaskToggle={loadTasks} />
        )}
      </div>
    </div>
  )
}
