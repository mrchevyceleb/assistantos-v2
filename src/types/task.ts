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
}

export const DEFAULT_TASK_SETTINGS: TaskSettings = {
  showCompleted: true,
  groupByFile: true,
  sortBy: 'file',
}

export type CenterPanelView = 'editor' | 'dashboard' | 'tasks'
