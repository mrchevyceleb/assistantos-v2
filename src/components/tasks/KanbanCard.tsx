import { Calendar, AlertTriangle, Folder, X, Cloud } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { KanbanTask, isSyncTask } from './KanbanBoard'

interface KanbanCardProps {
  task: KanbanTask
  showProject?: boolean
  onDragStart: (e: React.DragEvent, task: KanbanTask) => void
  onDelete?: (task: KanbanTask) => void
}

export function KanbanCard({ task, showProject = false, onDragStart, onDelete }: KanbanCardProps) {
  const { openFile } = useAppStore()

  // Get task properties based on type
  const isCloud = isSyncTask(task)
  const taskText = isCloud ? task.title : task.text
  const taskProjectName = task.projectName
  const taskDueDate = task.dueDate
  const taskPriority = task.priority

  // For SyncTasks, check if there's a linked document
  const documentPath = isCloud ? task.documentPath : task.filePath

  // Check if task is overdue
  const isOverdue = taskDueDate && new Date(taskDueDate) < new Date() && task.status !== 'done'

  // Priority colors
  const priorityColors = {
    high: 'bg-red-500/20 text-red-400 border-red-500/30',
    medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  }

  const handleClick = () => {
    // Open linked document if available
    if (documentPath) {
      openFile(documentPath)
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent opening file
    if (confirm(`Delete task "${taskText}"?`)) {
      onDelete?.(task)
    }
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={handleClick}
      className={`
        p-3 rounded-lg cursor-grab active:cursor-grabbing
        transition-all duration-200 group relative
        hover:scale-[1.02] hover:shadow-lg
        ${task.status === 'done' ? 'opacity-60' : ''}
      `}
      style={{
        background: 'linear-gradient(135deg, rgba(30, 35, 50, 0.9) 0%, rgba(20, 25, 40, 0.95) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
      }}
    >
      {/* Delete button */}
      {onDelete && (
        <button
          onClick={handleDelete}
          className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100
                     hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all"
          title="Delete task"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Task text */}
      <p
        className={`
          text-sm text-slate-200 mb-2 line-clamp-3
          ${task.status === 'done' ? 'line-through text-slate-400' : ''}
        `}
      >
        {taskText}
      </p>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Cloud indicator */}
        {isCloud && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs
                       bg-sky-500/20 text-sky-400 border border-sky-500/30"
            title="Cloud-synced task"
          >
            <Cloud className="w-3 h-3" />
          </span>
        )}

        {/* Priority badge */}
        {taskPriority && (
          <span
            className={`
              inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium
              border ${priorityColors[taskPriority]}
            `}
          >
            {taskPriority === 'high' && <AlertTriangle className="w-3 h-3" />}
            {taskPriority.charAt(0).toUpperCase() + taskPriority.slice(1)}
          </span>
        )}

        {/* Due date */}
        {taskDueDate && (
          <span
            className={`
              inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs
              ${isOverdue
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
              }
            `}
          >
            <Calendar className="w-3 h-3" />
            {taskDueDate}
          </span>
        )}

        {/* Project indicator (when showing all projects) */}
        {showProject && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs
                       bg-violet-500/20 text-violet-400 border border-violet-500/30"
          >
            <Folder className="w-3 h-3" />
            {taskProjectName}
          </span>
        )}
      </div>

      {/* Hover hint */}
      <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] text-slate-500">
          {documentPath ? 'Click to edit' : 'Cloud task'}
        </span>
      </div>
    </div>
  )
}
