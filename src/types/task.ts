// Task types for the task management system

export interface ParsedTask {
  id: string
  text: string
  completed: boolean
  filePath: string
  lineNumber: number
  dueDate?: string
  priority?: 'high' | 'medium' | 'low'
  raw: string // Original line from file
}

export interface TaskSettings {
  showCompleted: boolean
  groupByFile: boolean
  sortBy: 'file' | 'date' | 'priority'
  // Task source configuration
  taskSourcePaths: string[]      // Relative paths to scan (e.g., ["01-Active/tasks"])
  scanEntireWorkspace: boolean   // true = scan all, false = use taskSourcePaths only
}

export const DEFAULT_TASK_SETTINGS: TaskSettings = {
  showCompleted: true,
  groupByFile: true,
  sortBy: 'file',
  taskSourcePaths: [],
  scanEntireWorkspace: true,
}

export type CenterPanelView = 'editor' | 'dashboard' | 'tasks'
