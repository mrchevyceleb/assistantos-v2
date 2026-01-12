import { useState } from 'react'
import { Calendar, AlertTriangle, Folder, FileText } from 'lucide-react'
import { ParsedTask, TaskStatus, TASK_STATUS_CONFIG, KANBAN_COLUMN_ORDER } from '../../types/task'
import { useAppStore } from '../../stores/appStore'
import { updateTaskStatus } from '../../services/taskParser'

interface TaskListRowProps {
  task: ParsedTask
  showProject?: boolean
  onTaskUpdate: () => void
}

export function TaskListRow({ task, showProject = true, onTaskUpdate }: TaskListRowProps) {
  const { openFile } = useAppStore()
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const [updating, setUpdating] = useState(false)

  // Check if task is overdue
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done'

  // Priority colors
  const priorityColors = {
    high: 'bg-red-500/20 text-red-400 border-red-500/30',
    medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  }

  const statusConfig = TASK_STATUS_CONFIG[task.status]

  const handleClick = () => {
    openFile(task.filePath)
  }

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (newStatus === task.status) {
      setShowStatusDropdown(false)
      return
    }

    setUpdating(true)
    setShowStatusDropdown(false)
    try {
      const success = await updateTaskStatus(task.filePath, task.lineNumber, newStatus)
      if (success) {
        onTaskUpdate()
      }
    } catch (err) {
      console.error('Failed to update task status:', err)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
        transition-all duration-200 group
        hover:bg-white/5
        ${task.status === 'done' ? 'opacity-60' : ''}
        ${updating ? 'opacity-50 pointer-events-none' : ''}
      `}
      style={{
        background: 'linear-gradient(135deg, rgba(25, 30, 45, 0.6) 0%, rgba(18, 22, 35, 0.7) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
      }}
      onClick={handleClick}
    >
      {/* Status indicator with dropdown */}
      <div className="relative flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowStatusDropdown(!showStatusDropdown)
          }}
          className={`
            w-6 h-6 rounded-md flex items-center justify-center
            transition-colors hover:ring-2 hover:ring-white/20
            ${statusConfig.bgColor}
          `}
          title={`Status: ${statusConfig.label} (click to change)`}
        >
          <span className={`text-xs font-bold ${statusConfig.color}`}>
            {task.status === 'done' ? 'x' : task.status === 'backlog' ? ' ' : statusConfig.checkbox}
          </span>
        </button>

        {/* Status dropdown */}
        {showStatusDropdown && (
          <div
            className="absolute top-full left-0 mt-1 z-50 rounded-lg overflow-hidden min-w-[140px]"
            style={{
              background: 'rgba(25, 35, 55, 0.98)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {KANBAN_COLUMN_ORDER.map((status) => {
              const config = TASK_STATUS_CONFIG[status]
              return (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  className={`
                    w-full px-3 py-2 text-left flex items-center gap-2 text-sm
                    transition-colors hover:bg-white/10
                    ${task.status === status ? 'bg-white/5' : ''}
                  `}
                >
                  <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${config.bgColor} ${config.color}`}>
                    {status === 'done' ? 'x' : status === 'backlog' ? ' ' : config.checkbox}
                  </span>
                  <span className={config.color}>{config.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Task text */}
      <div className="flex-1 min-w-0">
        <p
          className={`
            text-sm text-slate-200 truncate
            ${task.status === 'done' ? 'line-through text-slate-400' : ''}
          `}
        >
          {task.text}
        </p>
      </div>

      {/* Metadata badges */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Priority badge */}
        {task.priority && (
          <span
            className={`
              inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium
              border ${priorityColors[task.priority]}
            `}
          >
            {task.priority === 'high' && <AlertTriangle className="w-3 h-3" />}
            {task.priority.charAt(0).toUpperCase()}
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

        {/* Open file indicator */}
        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
          <FileText className="w-4 h-4 text-slate-500" />
        </span>
      </div>
    </div>
  )
}
