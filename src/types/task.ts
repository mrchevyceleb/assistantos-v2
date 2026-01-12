// Task types for the task management system

// Task status for Kanban workflow
// Maps to extended checkbox syntax:
// [ ] = backlog, [o] = todo, [>] = in_progress, [?] = review, [x] = done
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'

// Status display configuration
export const TASK_STATUS_CONFIG: Record<TaskStatus, {
  label: string
  checkbox: string
  color: string
  bgColor: string
}> = {
  backlog: {
    label: 'Backlog',
    checkbox: ' ',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/20'
  },
  todo: {
    label: 'Todo',
    checkbox: 'o',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20'
  },
  in_progress: {
    label: 'In Progress',
    checkbox: '>',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20'
  },
  review: {
    label: 'Review',
    checkbox: '?',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20'
  },
  done: {
    label: 'Done',
    checkbox: 'x',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20'
  }
}

// Order of columns in Kanban board
export const KANBAN_COLUMN_ORDER: TaskStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'review',
  'done'
]

export interface ParsedTask {
  id: string
  text: string
  status: TaskStatus              // Kanban status
  completed: boolean              // Backward compat: true when status === 'done'
  filePath: string
  lineNumber: number
  projectName: string             // Extracted from parent folder name
  dueDate?: string
  priority?: 'high' | 'medium' | 'low'
  raw: string                     // Original line from file
}

// List view sort options
export type ListSortBy = 'dueDate' | 'project' | 'status' | 'priority'
export type ListSortOrder = 'asc' | 'desc'
export type TaskViewMode = 'kanban' | 'list'

// Kanban display settings (replaces old TaskSettings)
export interface KanbanSettings {
  selectedProject: string | null  // null = show all projects
  hideEmptyColumns: boolean
  showCompletedTasks: boolean
  customTasksFolder: string | null  // Custom folder path (relative to workspace), null = default "TASKS"
  viewMode: TaskViewMode  // 'kanban' or 'list'
  listSortBy: ListSortBy  // Sort field for list view
  listSortOrder: ListSortOrder  // Sort direction for list view
  listGroupByProject: boolean  // Group tasks by project in list view
}

export const DEFAULT_KANBAN_SETTINGS: KanbanSettings = {
  selectedProject: null,
  hideEmptyColumns: false,
  showCompletedTasks: true,
  customTasksFolder: null,
  viewMode: 'kanban',
  listSortBy: 'dueDate',
  listSortOrder: 'asc',
  listGroupByProject: true,
}

// Legacy TaskSettings - kept temporarily for migration
export interface TaskSettings {
  showCompleted: boolean
  groupByFile: boolean
  sortBy: 'file' | 'date' | 'priority'
  taskSourcePaths: string[]
  scanEntireWorkspace: boolean
}

export const DEFAULT_TASK_SETTINGS: TaskSettings = {
  showCompleted: true,
  groupByFile: true,
  sortBy: 'file',
  taskSourcePaths: [],
  scanEntireWorkspace: true,
}

export type CenterPanelView = 'editor' | 'dashboard' | 'tasks'
