/**
 * Task Store
 *
 * Zustand store for cloud-synced tasks.
 * Manages task state, CRUD operations, and real-time subscriptions.
 */

import { create } from 'zustand'
import { SyncTask, NewSyncTask, UpdateSyncTask } from '@/types/syncTask'
import { TaskStatus } from '@/types/task'
import * as taskSyncService from '@/services/tasks/taskSyncService'

// =============================================================================
// TYPES
// =============================================================================

interface TaskStoreState {
  // Core state
  tasks: SyncTask[]
  projects: string[]
  loading: boolean
  error: string | null
  syncId: string | null

  // Computed
  isCloudEnabled: boolean

  // Filter state (synced with appStore.kanbanSettings)
  projectFilter: string | null
}

interface TaskStoreActions {
  // Initialization
  initialize: (syncId: string) => Promise<void>
  setCloudEnabled: (enabled: boolean) => void

  // Task loading
  loadTasks: (projectFilter?: string | null) => Promise<void>
  loadProjects: () => Promise<void>

  // CRUD operations
  createTask: (task: NewSyncTask) => Promise<SyncTask | null>
  updateTask: (taskId: string, updates: UpdateSyncTask) => Promise<SyncTask | null>
  updateTaskStatus: (
    taskId: string,
    status: TaskStatus,
    sortOrder?: number
  ) => Promise<boolean>
  deleteTask: (taskId: string) => Promise<boolean>
  reorderTasks: (taskOrders: Array<{ id: string; sortOrder: number }>) => Promise<void>

  // Real-time
  subscribeToChanges: () => () => void

  // Migration
  importFromFiles: (
    fileTasks: taskSyncService.FileTask[]
  ) => Promise<taskSyncService.ImportResult>
  hasMigratedTasks: () => Promise<boolean>

  // Internal
  setProjectFilter: (filter: string | null) => void
  clearError: () => void
}

type TaskStore = TaskStoreState & TaskStoreActions

// =============================================================================
// STORE
// =============================================================================

export const useTaskStore = create<TaskStore>((set, get) => ({
  // Initial state
  tasks: [],
  projects: [],
  loading: false,
  error: null,
  syncId: null,
  isCloudEnabled: false,
  projectFilter: null,

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  initialize: async (syncId: string) => {
    set({ syncId, loading: true, error: null })

    try {
      // Load projects and tasks in parallel
      const [projects] = await Promise.all([
        taskSyncService.fetchProjects(syncId),
      ])

      set({ projects, loading: false })

      // Start real-time subscription
      get().subscribeToChanges()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize'
      set({ error: message, loading: false })
    }
  },

  setCloudEnabled: (enabled: boolean) => {
    set({ isCloudEnabled: enabled })
  },

  // -------------------------------------------------------------------------
  // Task Loading
  // -------------------------------------------------------------------------

  loadTasks: async (projectFilter?: string | null) => {
    const { syncId } = get()
    if (!syncId) return

    set({ loading: true, error: null })

    try {
      const filterToUse = projectFilter === undefined ? get().projectFilter : projectFilter
      const tasks = await taskSyncService.fetchTasks(syncId, filterToUse || undefined)
      set({ tasks, projectFilter: filterToUse ?? null, loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load tasks'
      set({ error: message, loading: false })
    }
  },

  loadProjects: async () => {
    const { syncId } = get()
    if (!syncId) return

    try {
      const projects = await taskSyncService.fetchProjects(syncId)
      set({ projects })
    } catch (err) {
      console.error('[TaskStore] Failed to load projects:', err)
    }
  },

  // -------------------------------------------------------------------------
  // CRUD Operations
  // -------------------------------------------------------------------------

  createTask: async (task: NewSyncTask) => {
    const { syncId } = get()
    if (!syncId) return null

    try {
      const newTask = await taskSyncService.createTask(syncId, task)

      // Optimistic: Add to local state immediately
      set((state) => ({
        tasks: [...state.tasks, newTask],
        // Add project if new
        projects: state.projects.includes(task.projectName)
          ? state.projects
          : [...state.projects, task.projectName].sort(),
      }))

      return newTask
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create task'
      set({ error: message })
      return null
    }
  },

  updateTask: async (taskId: string, updates: UpdateSyncTask) => {
    try {
      const updatedTask = await taskSyncService.updateTask(taskId, updates)

      // Optimistic: Update local state
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? updatedTask : t)),
      }))

      // Refresh projects if project name changed
      if (updates.projectName) {
        get().loadProjects()
      }

      return updatedTask
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update task'
      set({ error: message })
      return null
    }
  },

  updateTaskStatus: async (
    taskId: string,
    status: TaskStatus,
    sortOrder?: number
  ) => {
    try {
      // Optimistic: Update local state immediately for instant UI feedback
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status,
                sortOrder: sortOrder ?? t.sortOrder,
                updatedAt: new Date().toISOString(),
                completedAt: status === 'done' ? new Date().toISOString() : t.completedAt,
              }
            : t
        ),
      }))

      await taskSyncService.updateTaskStatus(taskId, status, sortOrder)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update task status'
      set({ error: message })

      // Revert optimistic update by reloading
      get().loadTasks()
      return false
    }
  },

  deleteTask: async (taskId: string) => {
    try {
      // Optimistic: Remove from local state
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== taskId),
      }))

      await taskSyncService.deleteTask(taskId)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete task'
      set({ error: message })

      // Revert optimistic update
      get().loadTasks()
      return false
    }
  },

  reorderTasks: async (taskOrders: Array<{ id: string; sortOrder: number }>) => {
    try {
      // Optimistic: Update local state
      const orderMap = new Map(taskOrders.map((o) => [o.id, o.sortOrder]))
      set((state) => ({
        tasks: state.tasks.map((t) => {
          const newOrder = orderMap.get(t.id)
          return newOrder !== undefined ? { ...t, sortOrder: newOrder } : t
        }),
      }))

      await taskSyncService.reorderTasks(taskOrders)
    } catch (err) {
      console.error('[TaskStore] Failed to reorder tasks:', err)
      // Revert by reloading
      get().loadTasks()
    }
  },

  // -------------------------------------------------------------------------
  // Real-time Subscriptions
  // -------------------------------------------------------------------------

  subscribeToChanges: () => {
    const { syncId } = get()
    if (!syncId) return () => {}

    return taskSyncService.subscribeToTasks(syncId, {
      onInsert: (task) => {
        set((state) => {
          // Avoid duplicates
          if (state.tasks.find((t) => t.id === task.id)) {
            return state
          }
          return {
            tasks: [...state.tasks, task],
            projects: state.projects.includes(task.projectName)
              ? state.projects
              : [...state.projects, task.projectName].sort(),
          }
        })
      },

      onUpdate: (task) => {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
        }))
      },

      onDelete: (taskId) => {
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== taskId),
        }))
      },
    })
  },

  // -------------------------------------------------------------------------
  // Migration
  // -------------------------------------------------------------------------

  importFromFiles: async (fileTasks: taskSyncService.FileTask[]) => {
    const { syncId } = get()
    if (!syncId) {
      return { imported: 0, failed: fileTasks.length, errors: ['No sync ID'] }
    }

    const result = await taskSyncService.importFileBasedTasks(syncId, fileTasks)

    // Reload tasks after migration
    await get().loadTasks()
    await get().loadProjects()

    return result
  },

  hasMigratedTasks: async () => {
    const { syncId } = get()
    if (!syncId) return false
    return taskSyncService.hasMigratedTasks(syncId)
  },

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  setProjectFilter: (filter: string | null) => {
    set({ projectFilter: filter })
    get().loadTasks(filter)
  },

  clearError: () => {
    set({ error: null })
  },
}))

// =============================================================================
// SELECTORS
// =============================================================================

/**
 * Get tasks grouped by status (for Kanban columns)
 */
export function useTasksByStatus() {
  return useTaskStore((state) => {
    const byStatus: Record<TaskStatus, SyncTask[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    }

    for (const task of state.tasks) {
      byStatus[task.status]?.push(task)
    }

    // Sort by sort_order within each column
    for (const status of Object.keys(byStatus) as TaskStatus[]) {
      byStatus[status].sort((a, b) => a.sortOrder - b.sortOrder)
    }

    return byStatus
  })
}

/**
 * Get tasks for a specific project
 */
export function useTasksByProject(projectName: string) {
  return useTaskStore((state) =>
    state.tasks.filter((t) => t.projectName === projectName)
  )
}

/**
 * Get a single task by ID
 */
export function useTask(taskId: string) {
  return useTaskStore((state) => state.tasks.find((t) => t.id === taskId))
}
