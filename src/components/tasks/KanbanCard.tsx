import { Calendar, AlertTriangle, Folder } from 'lucide-react'
import { ParsedTask } from '../../types/task'
import { useAppStore } from '../../stores/appStore'

interface KanbanCardProps {
  task: ParsedTask
  showProject?: boolean
  onDragStart: (e: React.DragEvent, task: ParsedTask) => void
}

export function KanbanCard({ task, showProject = false, onDragStart }: KanbanCardProps) {
  const { openFile } = useAppStore()

  // Check if task is overdue
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done'

  // Priority colors
  const priorityColors = {
    high: 'bg-red-500/20 text-red-400 border-red-500/30',
    medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  }

  const handleClick = () => {
    openFile(task.filePath)
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={handleClick}
      className={`
        p-3 rounded-lg cursor-grab active:cursor-grabbing
        transition-all duration-200 group
        hover:scale-[1.02] hover:shadow-lg
        ${task.status === 'done' ? 'opacity-60' : ''}
      `}
      style={{
        background: 'linear-gradient(135deg, rgba(30, 35, 50, 0.9) 0%, rgba(20, 25, 40, 0.95) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
      }}
    >
      {/* Task text */}
      <p
        className={`
          text-sm text-slate-200 mb-2 line-clamp-3
          ${task.status === 'done' ? 'line-through text-slate-400' : ''}
        `}
      >
        {task.text}
      </p>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Priority badge */}
        {task.priority && (
          <span
            className={`
              inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium
              border ${priorityColors[task.priority]}
            `}
          >
            {task.priority === 'high' && <AlertTriangle className="w-3 h-3" />}
            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
          </span>
        )}

        {/* Due date */}
        {task.dueDate && (
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
            {task.dueDate}
          </span>
        )}

        {/* Project indicator (when showing all projects) */}
        {showProject && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs
                       bg-violet-500/20 text-violet-400 border border-violet-500/30"
          >
            <Folder className="w-3 h-3" />
            {task.projectName}
          </span>
        )}
      </div>

      {/* Hover hint */}
      <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] text-slate-500">Click to edit</span>
      </div>
    </div>
  )
}
