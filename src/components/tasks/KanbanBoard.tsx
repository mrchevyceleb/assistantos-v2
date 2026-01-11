import { useState, useCallback, useRef } from 'react'
import { ParsedTask, TaskStatus, KANBAN_COLUMN_ORDER, KanbanSettings } from '../../types/task'
import { updateTaskStatus } from '../../services/taskParser'
import { KanbanColumn } from './KanbanColumn'

interface KanbanBoardProps {
  tasks: ParsedTask[]
  settings: KanbanSettings
  onTaskUpdate: () => void
}

export function KanbanBoard({ tasks, settings, onTaskUpdate }: KanbanBoardProps) {
  const [updating, setUpdating] = useState(false)
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

    setUpdating(true)
    try {
      const success = await updateTaskStatus(task.filePath, task.lineNumber, newStatus)
      if (success) {
        // Refresh the task list
        onTaskUpdate()
      }
    } catch (err) {
      console.error('Failed to update task status:', err)
    } finally {
      setUpdating(false)
      draggedTaskRef.current = null
    }
  }, [onTaskUpdate])

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
    </div>
  )
}
