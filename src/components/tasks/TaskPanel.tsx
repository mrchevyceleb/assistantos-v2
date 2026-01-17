import { useState, useEffect, useCallback } from 'react'
import { Kanban, RefreshCw, Eye, EyeOff, LayoutGrid, List, Cloud, AlertCircle } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useSyncStore } from '../../stores/syncStore'
import { useTaskStore } from '../../stores/taskStore'
import { DEFAULT_KANBAN_SETTINGS, KanbanSettings } from '../../types/task'
import { KanbanBoard } from './KanbanBoard'
import { TaskListView } from './TaskListView'
import { ProjectSelector } from './ProjectSelector'

export function TaskPanel() {
  const { workspacePath, _hasHydrated, kanbanSettings, setKanbanSettings } = useAppStore()

  // Cloud sync stores
  const { config: syncConfig, initialized: syncInitialized } = useSyncStore()
  const taskStore = useTaskStore()

  // Loading state
  const [loading, setLoading] = useState(false)

  // Use store settings or defaults
  const settings: KanbanSettings = kanbanSettings || DEFAULT_KANBAN_SETTINGS

  // Check if Supabase sync is available
  const isSyncAvailable = syncInitialized && !!syncConfig?.syncId

  // Get tasks and projects from taskStore
  const tasks = taskStore.tasks
  const projects = taskStore.projects

  // Initialize task store when sync becomes available
  useEffect(() => {
    if (isSyncAvailable && syncConfig?.syncId && !taskStore.syncId) {
      taskStore.initialize(syncConfig.syncId)
    }
  }, [isSyncAvailable, syncConfig?.syncId, taskStore.syncId, taskStore.initialize])

  // Update taskStore.isCloudEnabled when sync availability changes
  useEffect(() => {
    taskStore.setCloudEnabled(isSyncAvailable)
  }, [isSyncAvailable, taskStore.setCloudEnabled])

  // Load tasks from Supabase
  const loadTasks = useCallback(async () => {
    if (!isSyncAvailable || !syncConfig?.syncId) return

    setLoading(true)
    try {
      await taskStore.loadTasks(settings.selectedProject)
    } finally {
      setLoading(false)
    }
  }, [isSyncAvailable, syncConfig?.syncId, taskStore.loadTasks, settings.selectedProject])

  // Load on mount and when dependencies change
  useEffect(() => {
    if (_hasHydrated && isSyncAvailable) {
      loadTasks()
    }
  }, [_hasHydrated, isSyncAvailable, loadTasks])

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
            {isSyncAvailable && (
              <ProjectSelector
                projects={projects}
                selectedProject={settings.selectedProject}
                onSelectProject={handleSelectProject}
                workspacePath={workspacePath}
                onProjectCreated={loadTasks}
              />
            )}
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

            {/* Cloud sync indicator (always on when available) */}
            {isSyncAvailable && (
              <div
                className="p-2 rounded-lg bg-sky-500/20 text-sky-400"
                title="Cloud sync active"
              >
                <Cloud className="w-4 h-4" />
              </div>
            )}

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
              disabled={loading || !isSyncAvailable}
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
        {!isSyncAvailable ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <AlertCircle className="w-12 h-12 text-amber-500/60 mb-4" />
            <p className="text-slate-400 mb-2">Cloud sync not configured</p>
            <p className="text-sm text-slate-500 max-w-sm">
              Tasks are stored in Supabase cloud storage. Set up cloud sync in Settings to enable task management.
            </p>
          </div>
        ) : loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
          </div>
        ) : tasks.length === 0 && projects.length > 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Kanban className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-slate-400 mb-2">No tasks found</p>
            <p className="text-sm text-slate-500">
              Click the "+" button in the project selector to add your first task.
            </p>
          </div>
        ) : tasks.length === 0 && projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Kanban className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-slate-400 mb-2">No projects yet</p>
            <p className="text-sm text-slate-500">
              Create your first project using the project selector above.
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

      {/* Error display */}
      {taskStore.error && (
        <div
          className="absolute bottom-4 left-4 right-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300">{taskStore.error}</p>
            <button
              onClick={() => taskStore.clearError()}
              className="ml-auto text-xs text-red-400 hover:text-red-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
