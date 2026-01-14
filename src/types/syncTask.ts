/**
 * Cloud-synced Task Types
 *
 * Types for tasks stored in Supabase sync_tasks table.
 */

import { TaskStatus } from './task'

/**
 * Cloud-synced task (stored in Supabase)
 */
export interface SyncTask {
  id: string                    // UUID from Supabase
  syncId: string                // User's sync_id namespace

  // Task content
  title: string
  description?: string          // Optional rich description
  status: TaskStatus

  // Organization
  projectName: string
  priority?: 'high' | 'medium' | 'low'
  dueDate?: string              // YYYY-MM-DD format

  // Document link (relative workspace path)
  documentPath?: string         // Links to optional rich markdown file

  // Ordering
  sortOrder: number             // For ordering within columns

  // Flexible data
  tags: string[]
  metadata: Record<string, unknown>

  // Timestamps
  createdAt: string             // ISO timestamp
  updatedAt: string             // ISO timestamp
  completedAt?: string          // When task was completed
}

/**
 * Input for creating a new task
 */
export interface NewSyncTask {
  title: string
  projectName: string
  description?: string
  status?: TaskStatus
  priority?: 'high' | 'medium' | 'low'
  dueDate?: string
  documentPath?: string
  sortOrder?: number
  tags?: string[]
  metadata?: Record<string, unknown>
}

/**
 * Input for updating a task
 */
export interface UpdateSyncTask {
  title?: string
  description?: string
  status?: TaskStatus
  projectName?: string
  priority?: 'high' | 'medium' | 'low' | null
  dueDate?: string | null
  documentPath?: string | null
  sortOrder?: number
  tags?: string[]
  metadata?: Record<string, unknown>
}

/**
 * Database row format (snake_case for Supabase)
 */
export interface SyncTaskRow {
  id: string
  sync_id: string
  title: string
  description: string | null
  status: string
  project_name: string
  priority: string | null
  due_date: string | null
  document_path: string | null
  sort_order: number
  tags: string[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  completed_at: string | null
}

/**
 * Convert database row to SyncTask
 */
export function rowToSyncTask(row: SyncTaskRow): SyncTask {
  return {
    id: row.id,
    syncId: row.sync_id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status as TaskStatus,
    projectName: row.project_name,
    priority: row.priority as 'high' | 'medium' | 'low' | undefined,
    dueDate: row.due_date ?? undefined,
    documentPath: row.document_path ?? undefined,
    sortOrder: row.sort_order,
    tags: row.tags || [],
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  }
}

/**
 * Convert SyncTask/NewSyncTask to database row format
 */
export function syncTaskToRow(task: NewSyncTask | UpdateSyncTask, syncId?: string): Partial<SyncTaskRow> {
  const row: Partial<SyncTaskRow> = {}

  if (syncId) row.sync_id = syncId
  if ('title' in task && task.title !== undefined) row.title = task.title
  if ('description' in task) row.description = task.description ?? null
  if ('status' in task && task.status !== undefined) row.status = task.status
  if ('projectName' in task && task.projectName !== undefined) row.project_name = task.projectName
  if ('priority' in task) row.priority = task.priority ?? null
  if ('dueDate' in task) row.due_date = task.dueDate ?? null
  if ('documentPath' in task) row.document_path = task.documentPath ?? null
  if ('sortOrder' in task && task.sortOrder !== undefined) row.sort_order = task.sortOrder
  if ('tags' in task && task.tags !== undefined) row.tags = task.tags
  if ('metadata' in task && task.metadata !== undefined) row.metadata = task.metadata

  return row
}

/**
 * Convert ParsedTask (file-based) to NewSyncTask for migration
 */
export function parsedTaskToNewSyncTask(parsed: {
  text: string
  status: TaskStatus
  projectName: string
  dueDate?: string
  priority?: 'high' | 'medium' | 'low'
  filePath: string
}): NewSyncTask {
  return {
    title: parsed.text,
    status: parsed.status,
    projectName: parsed.projectName,
    dueDate: parsed.dueDate,
    priority: parsed.priority,
    documentPath: parsed.filePath,
  }
}
