import { useState, useEffect, useCallback } from 'react'
import { Kanban, RefreshCw, Eye, EyeOff, FolderPlus, FolderCog } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { parseTasksFromWorkspace, getProjectList, getTasksFolder } from '../../services/taskParser'
import { ParsedTask, DEFAULT_KANBAN_SETTINGS, KanbanSettings } from '../../types/task'
import { KanbanBoard } from './KanbanBoard'
import { ProjectSelector } from './ProjectSelector'

export function TaskPanel() {
  const { workspacePath, _hasHydrated, kanbanSettings, setKanbanSettings } = useAppStore()
  const [tasks, setTasks] = useState<ParsedTask[]>([])
  const [projects, setProjects] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [tasksFolderExists, setTasksFolderExists] = useState(true)
  const [showFolderDialog, setShowFolderDialog] = useState(false)
  const [folderInput, setFolderInput] = useState('')

  // Use store settings or defaults
  const settings: KanbanSettings = kanbanSettings || DEFAULT_KANBAN_SETTINGS
  const effectiveTasksFolder = getTasksFolder(settings.customTasksFolder)

  // Load projects list and check if tasks folder exists
  const loadProjects = useCallback(async () => {
    if (!workspacePath || !window.electronAPI) return

    // Check if tasks folder exists (using custom or default)
    const tasksPath = `${workspacePath.replace(/\\/g, '/')}/${effectiveTasksFolder}`
    const exists = await window.electronAPI.fs.exists(tasksPath)
    setTasksFolderExists(exists)

    // Get project list
    const projectList = await getProjectList(workspacePath, settings.customTasksFolder)
    setProjects(projectList)
  }, [workspacePath, effectiveTasksFolder, settings.customTasksFolder])

  // Load tasks
  const loadTasks = useCallback(async () => {
    if (!_hasHydrated || !workspacePath) return

    setLoading(true)
    try {
      const parsedTasks = await parseTasksFromWorkspace(
        workspacePath,
        settings.selectedProject,
        settings.customTasksFolder
      )
      setTasks(parsedTasks)

      // Also refresh projects list
      await loadProjects()
    } catch (err) {
      console.error('Failed to parse tasks:', err)
    } finally {
      setLoading(false)
    }
  }, [workspacePath, settings.selectedProject, settings.customTasksFolder, _hasHydrated, loadProjects])

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

  // Create tasks folder with a default project
  const handleCreateTasksFolder = async () => {
    if (!workspacePath || !window.electronAPI) return

    const tasksPath = `${workspacePath.replace(/\\/g, '/')}/${effectiveTasksFolder}`
    try {
      // Create tasks folder
      await window.electronAPI.fs.createDir(tasksPath)

      // Create a default "General" project folder
      const defaultProjectPath = `${tasksPath}/General`
      await window.electronAPI.fs.createDir(defaultProjectPath)

      // Create initial tasks.md file
      const initialContent = `# General Tasks

## Active Tasks

- [ ] First task (edit or delete this)

## Notes

Add any project notes here.
`
      await window.electronAPI.fs.writeFile(`${defaultProjectPath}/tasks.md`, initialContent)

      // Reload projects and tasks
      await loadProjects()
      await loadTasks()
    } catch (err) {
      console.error('Failed to create tasks folder:', err)
    }
  }

  // Set custom tasks folder
  const handleSetCustomFolder = () => {
    const trimmed = folderInput.trim()
    if (trimmed) {
      setKanbanSettings({ customTasksFolder: trimmed })
    } else {
      setKanbanSettings({ customTasksFolder: null })
    }
    setShowFolderDialog(false)
    setFolderInput('')
    // Settings change will trigger loadTasks via useEffect
  }

  // Open folder dialog
  const openFolderDialog = () => {
    setFolderInput(settings.customTasksFolder || '')
    setShowFolderDialog(true)
  }

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden relative"
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
            {/* Folder config */}
            <button
              onClick={openFolderDialog}
              className={`
                p-2 rounded-lg transition-colors
                ${settings.customTasksFolder
                  ? 'bg-violet-500/20 text-violet-400'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
                }
              `}
              title={`Tasks folder: ${effectiveTasksFolder} (click to change)`}
            >
              <FolderCog className="w-4 h-4" />
            </button>

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
        ) : !tasksFolderExists ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <FolderPlus className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-slate-400 mb-2">No "{effectiveTasksFolder}" folder found</p>
            <p className="text-sm text-slate-500 mb-4">
              Create the folder or point to your existing tasks folder
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCreateTasksFolder}
                className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400
                           hover:bg-cyan-500/30 transition-colors text-sm font-medium"
              >
                Create "{effectiveTasksFolder}" Folder
              </button>
              <button
                onClick={openFolderDialog}
                className="px-4 py-2 rounded-lg bg-violet-500/20 text-violet-400
                           hover:bg-violet-500/30 transition-colors text-sm font-medium"
              >
                Set Custom Folder
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-4 max-w-sm">
              Structure: <code className="text-cyan-400/80">{effectiveTasksFolder}/ProjectName/tasks.md</code>
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

      {/* Folder Configuration Dialog */}
      {showFolderDialog && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            className="w-96 rounded-xl p-5"
            style={{
              background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.98) 0%, rgba(20, 28, 45, 0.99) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <FolderCog className="w-5 h-5 text-violet-400" />
              <h3 className="text-lg font-semibold text-white">Tasks Folder</h3>
            </div>

            <p className="text-sm text-slate-400 mb-4">
              Set a custom folder path relative to your workspace root, or leave empty to use the default "TASKS" folder.
            </p>

            <div className="mb-4">
              <label className="block text-xs text-slate-500 mb-1.5">
                Folder path (relative to workspace)
              </label>
              <input
                type="text"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="e.g., Tasks, .tasks, projects/tasks"
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500
                           bg-black/20 border border-white/10 focus:border-violet-500/50
                           focus:outline-none focus:ring-1 focus:ring-violet-500/30"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSetCustomFolder()
                  if (e.key === 'Escape') setShowFolderDialog(false)
                }}
              />
              <p className="text-xs text-slate-600 mt-1.5">
                Current: <code className="text-cyan-400/80">{effectiveTasksFolder}</code>
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowFolderDialog(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white
                           hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSetCustomFolder}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white
                           bg-violet-500/20 hover:bg-violet-500/30 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
