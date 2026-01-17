/**
 * Task Sync Service
 *
 * Handles CRUD operations for cloud-synced tasks in Supabase.
 * Provides real-time subscriptions for cross-device sync.
 */

import { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient } from '../memory/supabaseClient'
import {
  SyncTask,
  NewSyncTask,
  UpdateSyncTask,
  SyncTaskRow,
  rowToSyncTask,
  syncTaskToRow,
} from '../../types/syncTask'
import { TaskStatus } from '../../types/task'

// =============================================================================
// TYPES
// =============================================================================

export interface TaskSyncCallbacks {
  onInsert?: (task: SyncTask) => void
  onUpdate?: (task: SyncTask) => void
  onDelete?: (taskId: string) => void
}

export interface ImportResult {
  imported: number
  failed: number
  errors: string[]
}

export interface FileTask {
  title: string
  status: TaskStatus
  projectName: string
  priority?: 'high' | 'medium' | 'low'
  dueDate?: string
  filePath?: string
  description?: string
  tags?: string[]
}

// =============================================================================
// FETCH OPERATIONS
// =============================================================================

/**
 * Fetch all tasks for a sync namespace
 */
export async function fetchTasks(
  syncId: string,
  projectFilter?: string
): Promise<SyncTask[]> {
  const client = await getSupabaseClient()

  let query = client
    .from('sync_tasks')
    .select('*')
    .eq('sync_id', syncId)
    .order('sort_order', { ascending: true })

  if (projectFilter) {
    query = query.eq('project_name', projectFilter)
  }

  const { data, error } = await query

  if (error) {
    console.error('[TaskSync] Failed to fetch tasks:', error)
    throw new Error(`Failed to fetch tasks: ${error.message}`)
  }

  return (data || []).map((row) => rowToSyncTask(row as SyncTaskRow))
}

/**
 * Fetch distinct project names for a sync namespace
 */
export async function fetchProjects(syncId: string): Promise<string[]> {
  const client = await getSupabaseClient()

  const { data, error } = await client
    .from('sync_tasks')
    .select('project_name')
    .eq('sync_id', syncId)

  if (error) {
    console.error('[TaskSync] Failed to fetch projects:', error)
    throw new Error(`Failed to fetch projects: ${error.message}`)
  }

  // Extract unique project names
  const projects = new Set<string>()
  for (const row of data || []) {
    if (row.project_name) {
      projects.add(row.project_name)
    }
  }

  return Array.from(projects).sort()
}

/**
 * Fetch a single task by ID
 */
export async function fetchTask(taskId: string): Promise<SyncTask | null> {
  const client = await getSupabaseClient()

  const { data, error } = await client
    .from('sync_tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null // Not found
    }
    console.error('[TaskSync] Failed to fetch task:', error)
    throw new Error(`Failed to fetch task: ${error.message}`)
  }

  return rowToSyncTask(data as SyncTaskRow)
}

// =============================================================================
// CREATE / UPDATE / DELETE
// =============================================================================

/**
 * Create a new task
 */
export async function createTask(
  syncId: string,
  task: NewSyncTask
): Promise<SyncTask> {
  const client = await getSupabaseClient()

  // Get max sort_order for this project/status
  const { data: maxData } = await client
    .from('sync_tasks')
    .select('sort_order')
    .eq('sync_id', syncId)
    .eq('project_name', task.projectName)
    .eq('status', task.status || 'todo')
    .order('sort_order', { ascending: false })
    .limit(1)

  const maxSortOrder = maxData?.[0]?.sort_order ?? -1
  const sortOrder = task.sortOrder ?? maxSortOrder + 1

  const row = syncTaskToRow({ ...task, sortOrder }, syncId)

  const { data, error } = await client
    .from('sync_tasks')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('[TaskSync] Failed to create task:', error)
    throw new Error(`Failed to create task: ${error.message}`)
  }

  return rowToSyncTask(data as SyncTaskRow)
}

/**
 * Update an existing task
 */
export async function updateTask(
  taskId: string,
  updates: UpdateSyncTask
): Promise<SyncTask> {
  const client = await getSupabaseClient()

  const row = syncTaskToRow(updates)

  const { data, error } = await client
    .from('sync_tasks')
    .update(row)
    .eq('id', taskId)
    .select()
    .single()

  if (error) {
    console.error('[TaskSync] Failed to update task:', error)
    throw new Error(`Failed to update task: ${error.message}`)
  }

  return rowToSyncTask(data as SyncTaskRow)
}

/**
 * Update task status (optimized for Kanban drag-drop)
 */
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  sortOrder?: number
): Promise<void> {
  const client = await getSupabaseClient()

  const updates: Record<string, unknown> = { status }
  if (sortOrder !== undefined) {
    updates.sort_order = sortOrder
  }

  const { error } = await client
    .from('sync_tasks')
    .update(updates)
    .eq('id', taskId)

  if (error) {
    console.error('[TaskSync] Failed to update task status:', error)
    throw new Error(`Failed to update task status: ${error.message}`)
  }
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string): Promise<void> {
  const client = await getSupabaseClient()

  const { error } = await client.from('sync_tasks').delete().eq('id', taskId)

  if (error) {
    console.error('[TaskSync] Failed to delete task:', error)
    throw new Error(`Failed to delete task: ${error.message}`)
  }
}

/**
 * Reorder multiple tasks (for drag-drop within columns)
 */
export async function reorderTasks(
  taskOrders: Array<{ id: string; sortOrder: number }>
): Promise<void> {
  const client = await getSupabaseClient()

  // Use a transaction-like approach with batch updates
  const promises = taskOrders.map(({ id, sortOrder }) =>
    client.from('sync_tasks').update({ sort_order: sortOrder }).eq('id', id)
  )

  const results = await Promise.all(promises)

  const errors = results.filter((r) => r.error)
  if (errors.length > 0) {
    console.error('[TaskSync] Failed to reorder tasks:', errors)
    throw new Error(`Failed to reorder ${errors.length} tasks`)
  }
}

// =============================================================================
// REALTIME SUBSCRIPTIONS
// =============================================================================

let activeChannel: RealtimeChannel | null = null

/**
 * Subscribe to real-time task changes for a sync namespace
 */
export async function subscribeToTasks(
  syncId: string,
  callbacks: TaskSyncCallbacks
): Promise<() => void> {
  const client = await getSupabaseClient()

  // Unsubscribe from previous channel if exists
  if (activeChannel) {
    client.removeChannel(activeChannel)
    activeChannel = null
  }

  const channel = client
    .channel(`sync_tasks:${syncId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'sync_tasks',
        filter: `sync_id=eq.${syncId}`,
      },
      (payload) => {
        const task = rowToSyncTask(payload.new as SyncTaskRow)
        callbacks.onInsert?.(task)
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'sync_tasks',
        filter: `sync_id=eq.${syncId}`,
      },
      (payload) => {
        const task = rowToSyncTask(payload.new as SyncTaskRow)
        callbacks.onUpdate?.(task)
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'sync_tasks',
        filter: `sync_id=eq.${syncId}`,
      },
      (payload) => {
        const taskId = (payload.old as { id: string }).id
        callbacks.onDelete?.(taskId)
      }
    )
    .subscribe()

  activeChannel = channel

  // Return unsubscribe function
  return () => {
    client.removeChannel(channel)
    if (activeChannel === channel) {
      activeChannel = null
    }
  }
}

// =============================================================================
// MIGRATION
// =============================================================================

/**
 * Import file-based tasks into cloud storage
 */
export async function importFileBasedTasks(
  syncId: string,
  tasks: FileTask[]
): Promise<ImportResult> {
  const result: ImportResult = {
    imported: 0,
    failed: 0,
    errors: [],
  }

  for (const task of tasks) {
    try {
      const newTask: NewSyncTask = {
        title: task.title,
        projectName: task.projectName,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        documentPath: task.filePath,
        description: task.description,
        tags: task.tags,
      }

      await createTask(syncId, newTask)
      result.imported++
    } catch (error) {
      result.failed++
      result.errors.push(
        `Failed to import "${task.title}": ${(error as Error).message}`
      )
    }
  }

  return result
}

/**
 * Check if tasks have been migrated for a sync namespace
 */
export async function hasMigratedTasks(syncId: string): Promise<boolean> {
  const client = await getSupabaseClient()

  const { count, error } = await client
    .from('sync_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('sync_id', syncId)

  if (error) {
    console.error('[TaskSync] Failed to check migration status:', error)
    return false
  }

  return (count ?? 0) > 0
}
