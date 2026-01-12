import { useState, useEffect, useCallback } from 'react'
import { Kanban, RefreshCw, Eye, EyeOff, FolderPlus, FolderCog, Folder, ChevronDown, FolderOpen, LayoutGrid, List } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { parseTasksFromWorkspace, getProjectList, getTasksFolder } from '../../services/taskParser'
import { ParsedTask, DEFAULT_KANBAN_SETTINGS, KanbanSettings } from '../../types/task'
import { KanbanBoard } from './KanbanBoard'
import { TaskListView } from './TaskListView'
import { ProjectSelector } from './ProjectSelector'

export function TaskPanel() {
  const { workspacePath, _hasHydrated, kanbanSettings, setKanbanSettings } = useAppStore()
  const [tasks, setTasks] = useState<ParsedTask[]>([])
  const [projects, setProjects] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [tasksFolderExists, setTasksFolderExists] = useState(true)
  const [showFolderDialog, setShowFolderDialog] = useState(false)
  const [folderInput, setFolderInput] = useState('')
  const [workspaceFolders, setWorkspaceFolders] = useState<string[]>([])
  const [showFolderDropdown, setShowFolderDropdown] = useState(false)

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
    setShowFolderDropdown(false)
    setFolderInput('')
    // Settings change will trigger loadTasks via useEffect
  }

  // Close dialog (and reset state)
  const closeFolderDialog = () => {
    setShowFolderDialog(false)
    setShowFolderDropdown(false)
    setFolderInput('')
  }

  // Scan workspace for all folders recursively
  const scanWorkspaceFolders = useCallback(async () => {
    if (!workspacePath || !window.electronAPI) return

    const excludedDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', '__pycache__', 'coverage'])
    const allFolders: string[] = []

    const scanDir = async (dirPath: string, relativePath: string = '') => {
      try {
        const entries = await window.electronAPI.fs.readDir(dirPath)
        for (const entry of entries) {
          if (entry.isDirectory && !entry.name.startsWith('.') && !excludedDirs.has(entry.name)) {
            const folderRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name
            allFolders.push(folderRelPath)
            // Recursively scan subdirectories (limit depth to avoid performance issues)
            if (folderRelPath.split('/').length < 4) {
              await scanDir(`${dirPath}/${entry.name}`, folderRelPath)
            }
          }
        }
      } catch (err) {
        // Ignore permission errors for individual directories
      }
    }

    try {
      await scanDir(workspacePath.replace(/\\/g, '/'))
      allFolders.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      setWorkspaceFolders(allFolders)
    } catch (err) {
      console.error('Failed to scan workspace folders:', err)
    }
  }, [workspacePath])

  // Open folder dialog
  const openFolderDialog = async () => {
    setFolderInput(settings.customTasksFolder || '')
    setShowFolderDialog(true)
    setShowFolderDropdown(false)
    await scanWorkspaceFolders()
  }

  // Select folder from dropdown
  const handleSelectFolder = (folder: string) => {
    setFolderInput(folder)
    setShowFolderDropdown(false)
  }

  // Browse for folder using native dialog
  const handleBrowseFolder = async () => {
    if (!window.electronAPI) return

    try {
      const selectedPath = await window.electronAPI.fs.selectFolder()
      if (selectedPath) {
        setFolderInput(selectedPath)
        setShowFolderDropdown(false)
      }
    } catch (err) {
      console.error('Failed to select folder:', err)
    }
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
              {settings.viewMode === 'kanban' ? (
                <Kanban className="w-5 h-5 text-cyan-400" />
              ) : (
                <List className="w-5 h-5 text-cyan-400" />
              )}
              <div>
                <h1 className="text-base font-semibold text-white">
                  {settings.viewMode === 'kanban' ? 'Kanban' : 'Tasks'}
                </h1>
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
            {/* View toggle */}
            <div className="flex items-center rounded-lg overflow-hidden border border-white/10">
              <button
                onClick={() => setKanbanSettings({ viewMode: 'kanban' })}
                className={`
                  p-2 transition-colors
                  ${settings.viewMode === 'kanban'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
                  }
                `}
                title="Kanban view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setKanbanSettings({ viewMode: 'list' })}
                className={`
                  p-2 transition-colors
                  ${settings.viewMode === 'list'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
                  }
                `}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

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
        ) : settings.viewMode === 'list' ? (
          <TaskListView
            tasks={tasks}
            settings={settings}
            onTaskUpdate={loadTasks}
            onSortChange={(sortBy, sortOrder) => setKanbanSettings({ listSortBy: sortBy, listSortOrder: sortOrder })}
            onGroupByChange={(groupBy) => setKanbanSettings({ listGroupByProject: groupBy })}
          />
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
        <div
          className="absolute inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeFolderDialog()
          }}
        >
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
              Browse to any folder on your computer, pick from workspace folders, or type a path.
            </p>

            <div className="mb-4">
              {/* Browse button - primary action */}
              <button
                type="button"
                onClick={handleBrowseFolder}
                className="w-full px-3 py-2.5 mb-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2
                           bg-violet-500/20 border border-violet-500/30 text-violet-300
                           hover:bg-violet-500/30 hover:border-violet-500/40
                           focus:outline-none focus:ring-2 focus:ring-violet-500/30
                           transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Browse for Folder...
              </button>

              {/* Workspace folders dropdown */}
              <label className="block text-xs text-slate-500 mb-1.5">
                Or select from workspace
              </label>
              <div className="relative mb-2">
                <button
                  type="button"
                  onClick={() => setShowFolderDropdown(!showFolderDropdown)}
                  className="w-full px-3 py-2 rounded-lg text-sm text-left flex items-center justify-between
                             bg-black/20 border border-white/10 hover:border-violet-500/30
                             focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30
                             transition-colors"
                >
                  <span className="flex items-center gap-2 text-slate-300">
                    <Folder className="w-4 h-4 text-violet-400" />
                    <span className="text-slate-500">Workspace folders...</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showFolderDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showFolderDropdown && workspaceFolders.length > 0 && (
                  <div
                    className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10 max-h-48 overflow-y-auto"
                    style={{
                      background: 'rgba(20, 28, 45, 0.98)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
                    }}
                  >
                    {workspaceFolders.map((folder) => (
                      <button
                        key={folder}
                        type="button"
                        onClick={() => handleSelectFolder(folder)}
                        className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2
                                   hover:bg-violet-500/20 transition-colors
                                   ${folderInput === folder ? 'bg-violet-500/10 text-violet-300' : 'text-slate-300'}`}
                      >
                        <Folder className="w-4 h-4 text-violet-400/70" />
                        {folder}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Current selection display */}
              {folderInput && (
                <div className="px-3 py-2 mb-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <p className="text-xs text-slate-500 mb-0.5">Selected folder:</p>
                  <p className="text-sm text-cyan-300 font-mono break-all">{folderInput}</p>
                </div>
              )}

              {/* Manual input */}
              <input
                type="text"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="Or type/paste a path..."
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500
                           bg-black/20 border border-white/10 focus:border-violet-500/50
                           focus:outline-none focus:ring-1 focus:ring-violet-500/30"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSetCustomFolder()
                  if (e.key === 'Escape') closeFolderDialog()
                }}
              />

              <p className="text-xs text-slate-600 mt-2">
                Current: <code className="text-cyan-400/80">{effectiveTasksFolder}</code>
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={closeFolderDialog}
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
