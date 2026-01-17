/**
 * Task Management Tools
 *
 * Claude Agent tools for CRUD operations on Supabase-synced tasks.
 * These tools allow the AI to create, read, update, and delete tasks.
 */

import { useTaskStore } from '@/stores/taskStore'
import { useAppStore } from '@/stores/appStore'
import type { NewSyncTask, UpdateSyncTask, SyncTask } from '@/types/syncTask'
import type { TaskStatus } from '@/types/task'
import * as taskSyncService from '@/services/tasks/taskSyncService'

// =============================================================================
// TYPES
// =============================================================================

interface CreateTaskInput {
  title: string
  projectName: string
  description?: string
  status?: TaskStatus
  priority?: 'high' | 'medium' | 'low'
  dueDate?: string
  tags?: string[]
}

interface UpdateTaskInput {
  id: string
  title?: string
  description?: string
  status?: TaskStatus
  projectName?: string
  priority?: 'high' | 'medium' | 'low' | null
  dueDate?: string | null
  tags?: string[]
}

interface DeleteTaskInput {
  id: string
}

interface GetTaskInput {
  id: string
}

interface ListTasksInput {
  projectName?: string
  status?: TaskStatus
  priority?: 'high' | 'medium' | 'low'
  limit?: number
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the sync ID from app store settings
 */
function getSyncId(): string | null {
  const appStore = useAppStore.getState()
  return appStore.syncId || null
}

/**
 * Format a task for display to the user
 */
function formatTask(task: SyncTask): string {
  const lines: string[] = [
    `- **${task.title}**`,
    `  - ID: ${task.id}`,
    `  - Status: ${task.status}`,
    `  - Project: ${task.projectName}`,
  ]

  if (task.priority) {
    lines.push(`  - Priority: ${task.priority}`)
  }
  if (task.dueDate) {
    lines.push(`  - Due: ${task.dueDate}`)
  }
  if (task.description) {
    lines.push(`  - Description: ${task.description}`)
  }
  if (task.tags && task.tags.length > 0) {
    lines.push(`  - Tags: ${task.tags.join(', ')}`)
  }

  return lines.join('\n')
}

/**
 * Format a list of tasks for display
 */
function formatTaskList(tasks: SyncTask[]): string {
  if (tasks.length === 0) {
    return 'No tasks found.'
  }

  return tasks.map(formatTask).join('\n\n')
}

// =============================================================================
// TOOL EXECUTION FUNCTIONS
// =============================================================================

/**
 * Create a new task
 */
export async function executeCreateTask(input: CreateTaskInput): Promise<string> {
  const syncId = getSyncId()
  if (!syncId) {
    throw new Error('Task sync is not enabled. Please enable cloud sync in Settings > Tasks.')
  }

  const newTask: NewSyncTask = {
    title: input.title,
    projectName: input.projectName,
    description: input.description,
    status: input.status || 'todo',
    priority: input.priority,
    dueDate: input.dueDate,
    tags: input.tags || [],
  }

  try {
    // Use the task store to create (handles optimistic updates and real-time sync)
    const taskStore = useTaskStore.getState()
    const createdTask = await taskStore.createTask(newTask)

    if (!createdTask) {
      throw new Error('Failed to create task')
    }

    return `Task created successfully:\n\n${formatTask(createdTask)}`
  } catch (error) {
    throw new Error(`Failed to create task: ${(error as Error).message}`)
  }
}

/**
 * Update an existing task
 */
export async function executeUpdateTask(input: UpdateTaskInput): Promise<string> {
  const { id, ...updates } = input

  if (Object.keys(updates).length === 0) {
    throw new Error('No updates provided. Please specify at least one field to update.')
  }

  try {
    const taskStore = useTaskStore.getState()

    // Convert the input to UpdateSyncTask format
    const updateData: UpdateSyncTask = {}
    if (updates.title !== undefined) updateData.title = updates.title
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.projectName !== undefined) updateData.projectName = updates.projectName
    if (updates.priority !== undefined) updateData.priority = updates.priority
    if (updates.dueDate !== undefined) updateData.dueDate = updates.dueDate
    if (updates.tags !== undefined) updateData.tags = updates.tags

    const updatedTask = await taskStore.updateTask(id, updateData)

    if (!updatedTask) {
      throw new Error('Task not found or update failed')
    }

    return `Task updated successfully:\n\n${formatTask(updatedTask)}`
  } catch (error) {
    throw new Error(`Failed to update task: ${(error as Error).message}`)
  }
}

/**
 * Delete a task
 */
export async function executeDeleteTask(input: DeleteTaskInput): Promise<string> {
  try {
    const taskStore = useTaskStore.getState()

    // First get the task to show what was deleted
    const existingTask = taskStore.tasks.find(t => t.id === input.id)

    const success = await taskStore.deleteTask(input.id)

    if (!success) {
      throw new Error('Task not found or deletion failed')
    }

    const taskInfo = existingTask ? `"${existingTask.title}"` : input.id
    return `Task ${taskInfo} deleted successfully.`
  } catch (error) {
    throw new Error(`Failed to delete task: ${(error as Error).message}`)
  }
}

/**
 * Get a single task by ID
 */
export async function executeGetTask(input: GetTaskInput): Promise<string> {
  try {
    // First try to get from local store
    const taskStore = useTaskStore.getState()
    let task = taskStore.tasks.find(t => t.id === input.id)

    // If not in local store, fetch from Supabase directly
    if (!task) {
      task = await taskSyncService.fetchTask(input.id) || undefined
    }

    if (!task) {
      return `Task with ID "${input.id}" not found.`
    }

    return formatTask(task)
  } catch (error) {
    throw new Error(`Failed to get task: ${(error as Error).message}`)
  }
}

/**
 * List tasks with optional filters
 */
export async function executeListTasks(input: ListTasksInput): Promise<string> {
  const syncId = getSyncId()
  if (!syncId) {
    throw new Error('Task sync is not enabled. Please enable cloud sync in Settings > Tasks.')
  }

  try {
    // Get tasks from the store (which maintains the synced state)
    const taskStore = useTaskStore.getState()

    // Ensure tasks are loaded
    if (taskStore.tasks.length === 0) {
      await taskStore.loadTasks(input.projectName || null)
    }

    let tasks = [...taskStore.tasks]

    // Apply filters
    if (input.projectName) {
      tasks = tasks.filter(t =>
        t.projectName.toLowerCase() === input.projectName!.toLowerCase()
      )
    }

    if (input.status) {
      tasks = tasks.filter(t => t.status === input.status)
    }

    if (input.priority) {
      tasks = tasks.filter(t => t.priority === input.priority)
    }

    // Apply limit
    const limit = input.limit || 50
    tasks = tasks.slice(0, limit)

    // Build summary header
    const filterParts: string[] = []
    if (input.projectName) filterParts.push(`project: ${input.projectName}`)
    if (input.status) filterParts.push(`status: ${input.status}`)
    if (input.priority) filterParts.push(`priority: ${input.priority}`)

    const filterSummary = filterParts.length > 0
      ? `Filters: ${filterParts.join(', ')}\n\n`
      : ''

    const countSummary = `Found ${tasks.length} task${tasks.length !== 1 ? 's' : ''}${limit < taskStore.tasks.length ? ` (showing first ${limit})` : ''}\n\n`

    return `${filterSummary}${countSummary}${formatTaskList(tasks)}`
  } catch (error) {
    throw new Error(`Failed to list tasks: ${(error as Error).message}`)
  }
}

// =============================================================================
// MAIN EXECUTION ROUTER
// =============================================================================

/**
 * Execute a task management tool
 */
export async function executeTaskTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case 'create_task':
      return executeCreateTask(input as CreateTaskInput)

    case 'update_task':
      return executeUpdateTask(input as UpdateTaskInput)

    case 'delete_task':
      return executeDeleteTask(input as DeleteTaskInput)

    case 'get_task':
      return executeGetTask(input as GetTaskInput)

    case 'list_tasks':
      return executeListTasks(input as ListTasksInput)

    default:
      throw new Error(`Unknown task tool: ${name}`)
  }
}
