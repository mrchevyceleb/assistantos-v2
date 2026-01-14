import { useState, useCallback, useRef } from 'react'
import { Plus } from 'lucide-react'
import { ParsedTask, TaskStatus, KANBAN_COLUMN_ORDER, KanbanSettings, TASK_STATUS_CONFIG } from '../../types/task'
import { updateTaskStatus, deleteTask, getTasksFolder } from '../../services/taskParser'
import { KanbanColumn } from './KanbanColumn'
import { NewTaskDialog } from './NewTaskDialog'
import { useAppStore } from '../../stores/appStore'
import { useNotificationStore } from '../../stores/notificationStore'

interface KanbanBoardProps {
  tasks: ParsedTask[]
  settings: KanbanSettings
  onTaskUpdate: () => void
}

export function KanbanBoard({ tasks, settings, onTaskUpdate }: KanbanBoardProps) {
  const { workspacePath } = useAppStore()
  const addNotification = useNotificationStore(state => state.addNotification)
  const [updating, setUpdating] = useState(false)
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo')
  const draggedTaskRef = useRef<ParsedTask | null>(null)

  // Group tasks by status
  const tasksByStatus = KANBAN_COLUMN_ORDER.reduce((acc, status) => {
    acc[status] = tasks.filter((task) => {
      // Apply showCompletedTasks filter
      if (!settings.showCompletedTasks && task.status === 'done') {
        return false
      }
      return task.status === status
    })
    return acc
  }, {} as Record<TaskStatus, ParsedTask[]>)

  // Determine if we should show project names on cards
  const showProject = settings.selectedProject === null

  // Handle drag start
  const handleDragStart = useCallback((e: React.DragEvent, task: ParsedTask) => {
    draggedTaskRef.current = task
    e.dataTransfer.effectAllowed = 'move'
    // Add data for accessibility
    e.dataTransfer.setData('text/plain', task.id)
  }, [])

  // Handle drop on column
  const handleDrop = useCallback(async (newStatus: TaskStatus) => {
    const task = draggedTaskRef.current
    if (!task || task.status === newStatus) {
      draggedTaskRef.current = null
      return
    }

    const oldStatus = task.status
    const statusLabel = TASK_STATUS_CONFIG[newStatus].label
    console.log(`[Kanban] Moving task "${task.text}" from ${oldStatus} to ${newStatus}`)
    console.log(`[Kanban] Task file: ${task.filePath}, line: ${task.lineNumber}`)

    setUpdating(true)
    try {
      const success = await updateTaskStatus(task.filePath, task.lineNumber, newStatus)
      if (success) {
        console.log(`[Kanban] Task status updated successfully`)
        // Refresh the task list
        onTaskUpdate()
      } else {
        console.error(`[Kanban] updateTaskStatus returned false`)
        addNotification(
          'Task Update Failed',
          `Could not move "${task.text}" to ${statusLabel}. Check the console for details.`,
          'error'
        )
      }
    } catch (err) {
      console.error('Failed to update task status:', err)
      addNotification(
        'Task Update Error',
        `Error moving task: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'error'
      )
    } finally {
      setUpdating(false)
      draggedTaskRef.current = null
    }
  }, [onTaskUpdate, addNotification])

  // Handle task deletion
  const handleDelete = useCallback(async (task: ParsedTask) => {
    setUpdating(true)
    try {
      const success = await deleteTask(task.filePath, task.lineNumber)
      if (success) {
        addNotification(
          'Task Deleted',
          `"${task.text}" has been deleted`,
          'success'
        )
        // Refresh the task list
        onTaskUpdate()
      } else {
        addNotification(
          'Delete Failed',
          `Could not delete "${task.text}". Check the console for details.`,
          'error'
        )
      }
    } catch (err) {
      console.error('Failed to delete task:', err)
      addNotification(
        'Delete Error',
        `Error deleting task: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'error'
      )
    } finally {
      setUpdating(false)
    }
  }, [onTaskUpdate, addNotification])

  // Handle new task creation
  const handleCreateTask = useCallback(async (projectName: string, taskTitle: string, dueDate: string, status: TaskStatus) => {
    if (!workspacePath || !window.electronAPI) return

    setUpdating(true)
    try {
      // Get tasks folder path
      const tasksFolder = getTasksFolder(settings.customTasksFolder)
      const tasksPath = `${workspacePath.replace(/\\/g, '/')}/${tasksFolder}`

      // Create project folder if it doesn't exist
      const projectPath = `${tasksPath}/${projectName}`
      const projectExists = await window.electronAPI.fs.exists(projectPath)
      if (!projectExists) {
        await window.electronAPI.fs.createDir(projectPath)
      }

      // Create task file with filename convention: "ProjectName - Task Title - Due YYYY-MM-DD.md"
      const filename = `${projectName} - ${taskTitle} - Due ${dueDate}.md`
      const filePath = `${tasksPath}/${filename}`

      // Create initial file content with a checkbox based on status
      const statusChar = status === 'backlog' ? ' ' : status === 'todo' ? 'o' : status === 'in_progress' ? '>' : status === 'review' ? '?' : 'x'
      const content = `# ${taskTitle}

## Description

Add task description here...

## Checklist

- [${statusChar}] ${taskTitle}

## Notes

`

      const success = await window.electronAPI.fs.writeFile(filePath, content)
      if (success) {
        // Refresh the task list
        onTaskUpdate()
        setShowNewTaskDialog(false)
      } else {
        console.error('Failed to create task file')
      }
    } catch (err) {
      console.error('Failed to create new task:', err)
    } finally {
      setUpdating(false)
    }
  }, [workspacePath, settings.customTasksFolder, onTaskUpdate])

  // Get columns to display (optionally hide empty)
  const visibleColumns = settings.hideEmptyColumns
    ? KANBAN_COLUMN_ORDER.filter((status) => tasksByStatus[status].length > 0)
    : KANBAN_COLUMN_ORDER

  return (
    <div className="h-full flex flex-col">
      {/* Board content */}
      <div
        className={`
          flex-1 flex gap-4 p-4 overflow-x-auto overflow-y-hidden
          ${updating ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        {visibleColumns.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status]}
            showProject={showProject}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onDelete={handleDelete}
            onAddTask={(columnStatus) => {
              setDefaultStatus(columnStatus)
              setShowNewTaskDialog(true)
            }}
          />
        ))}

        {/* Show message if all columns are hidden */}
        {visibleColumns.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-500 text-sm">
              No tasks to display. All columns are empty.
            </p>
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {updating && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="text-sm text-cyan-400">Updating...</div>
        </div>
      )}

      {/* Floating New Task Button */}
      <button
        onClick={() => {
          setDefaultStatus('todo')
          setShowNewTaskDialog(true)
        }}
        className="absolute bottom-6 right-6 p-4 rounded-full shadow-2xl transition-all hover:scale-105"
        style={{
          background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.9) 0%, rgba(147, 51, 234, 0.9) 100%)',
          boxShadow: '0 10px 30px rgba(0, 212, 255, 0.4), 0 0 60px rgba(147, 51, 234, 0.3)'
        }}
        title="Create New Task"
      >
        <Plus className="w-6 h-6 text-white" />
      </button>

      {/* New Task Dialog */}
      {showNewTaskDialog && (
        <NewTaskDialog
          onConfirm={handleCreateTask}
          onCancel={() => setShowNewTaskDialog(false)}
          defaultProject={settings.selectedProject || ''}
          defaultStatus={defaultStatus}
        />
      )}
    </div>
  )
}
