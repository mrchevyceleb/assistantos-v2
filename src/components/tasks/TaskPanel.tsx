import { useState, useEffect, useCallback } from 'react'
import { Kanban, RefreshCw, Eye, EyeOff, FolderPlus } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { parseTasksFromWorkspace, getProjectList, TASKS_FOLDER } from '../../services/taskParser'
import { ParsedTask, DEFAULT_KANBAN_SETTINGS, KanbanSettings } from '../../types/task'
import { KanbanBoard } from './KanbanBoard'
import { ProjectSelector } from './ProjectSelector'

export function TaskPanel() {
  const { workspacePath, _hasHydrated, kanbanSettings, setKanbanSettings } = useAppStore()
  const [tasks, setTasks] = useState<ParsedTask[]>([])
  const [projects, setProjects] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [tasksExist, setTasksExist] = useState(true)

  // Use store settings or defaults
  const settings: KanbanSettings = kanbanSettings || DEFAULT_KANBAN_SETTINGS

  // Load projects list
  const loadProjects = useCallback(async () => {
    if (!workspacePath) return
    const projectList = await getProjectList(workspacePath)
    setProjects(projectList)
    setTasksExist(projectList.length > 0)
  }, [workspacePath])

  // Load tasks
  const loadTasks = useCallback(async () => {
    if (!_hasHydrated || !workspacePath) return

    setLoading(true)
    try {
      const parsedTasks = await parseTasksFromWorkspace(
        workspacePath,
        settings.selectedProject
      )
      setTasks(parsedTasks)

      // Also refresh projects list
      await loadProjects()
    } catch (err) {
      console.error('Failed to parse tasks:', err)
    } finally {
      setLoading(false)
    }
  }, [workspacePath, settings.selectedProject, _hasHydrated, loadProjects])

  // Load on mount and when dependencies change
  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // Handle project selection
  const handleSelectProject = (project: string | null) => {
    setKanbanSettings({ selectedProject: project })
  }

  // Toggle show completed tasks
  const toggleShowCompleted = () => {
    setKanbanSettings({ showCompletedTasks: !settings.showCompletedTasks })
  }

  // Calculate stats
  const openCount = tasks.filter(t => t.status !== 'done').length
  const totalCount = tasks.length

  // Create TASKS folder helper
  const handleCreateTasksFolder = async () => {
    if (!workspacePath || !window.electronAPI) return

    const tasksPath = `${workspacePath.replace(/\\/g, '/')}/${TASKS_FOLDER}`
    try {
      await window.electronAPI.fs.createDir(tasksPath)
      await loadProjects()
    } catch (err) {
      console.error('Failed to create TASKS folder:', err)
    }
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden relative"
      style={{
        background: 'linear-gradient(180deg, rgba(16, 20, 32, 0.95) 0%, rgba(10, 13, 22, 0.98) 100%)'
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 relative flex-shrink-0"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'linear-gradient(180deg, rgba(25, 32, 50, 0.6) 0%, rgba(16, 20, 32, 0.7) 100%)'
        }}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Left: Title and Project Selector */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Kanban className="w-5 h-5 text-cyan-400" />
              <div>
                <h1 className="text-base font-semibold text-white">Kanban</h1>
                <p className="text-xs text-slate-400">
                  {openCount} active / {totalCount} total
                </p>
              </div>
            </div>

            {/* Project Selector */}
            <ProjectSelector
              projects={projects}
              selectedProject={settings.selectedProject}
              onSelectProject={handleSelectProject}
              workspacePath={workspacePath}
              onProjectCreated={loadTasks}
            />
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Toggle completed */}
            <button
              onClick={toggleShowCompleted}
              className={`
                p-2 rounded-lg transition-colors
                ${settings.showCompletedTasks
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
                }
              `}
              title={settings.showCompletedTasks ? 'Hide completed' : 'Show completed'}
            >
              {settings.showCompletedTasks ? (
                <Eye className="w-4 h-4" />
              ) : (
                <EyeOff className="w-4 h-4" />
              )}
            </button>

            {/* Refresh */}
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!workspacePath ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Kanban className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-slate-400 mb-2">No workspace open</p>
            <p className="text-sm text-slate-500">
              Open a folder to see your Kanban board
            </p>
          </div>
        ) : loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
          </div>
        ) : !tasksExist ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <FolderPlus className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-slate-400 mb-2">No TASKS folder found</p>
            <p className="text-sm text-slate-500 mb-4">
              Create a TASKS folder with project subfolders to get started
            </p>
            <button
              onClick={handleCreateTasksFolder}
              className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400
                         hover:bg-cyan-500/30 transition-colors text-sm font-medium"
            >
              Create TASKS Folder
            </button>
            <p className="text-xs text-slate-600 mt-4 max-w-sm">
              Structure: <code className="text-cyan-400/80">TASKS/ProjectName/tasks.md</code>
            </p>
          </div>
        ) : tasks.length === 0 && projects.length > 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Kanban className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-slate-400 mb-2">No tasks found</p>
            <p className="text-sm text-slate-500">
              Add tasks to your project files using:<br />
              <code className="text-cyan-400">- [ ] Backlog task</code><br />
              <code className="text-blue-400">- [o] Todo task</code><br />
              <code className="text-amber-400">- [&gt;] In progress</code><br />
              <code className="text-purple-400">- [?] In review</code><br />
              <code className="text-emerald-400">- [x] Done</code>
            </p>
          </div>
        ) : (
          <KanbanBoard
            tasks={tasks}
            settings={settings}
            onTaskUpdate={loadTasks}
          />
        )}
      </div>
    </div>
  )
}
