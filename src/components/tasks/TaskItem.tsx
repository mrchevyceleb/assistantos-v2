import { useState } from 'react'
import { Check, Calendar, AlertTriangle, FileText } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { ParsedTask } from '../../types/task'
import { toggleTaskInFile, getFileName } from '../../services/taskParser'

interface TaskItemProps {
  task: ParsedTask
  onToggle: () => void
  showFile?: boolean
}

export function TaskItem({ task, onToggle, showFile }: TaskItemProps) {
  const { openFile, setCenterPanelView } = useAppStore()
  const [isToggling, setIsToggling] = useState(false)

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isToggling) return

    setIsToggling(true)
    try {
      const success = await toggleTaskInFile(task.filePath, task.lineNumber, !task.completed)
      if (success) {
        onToggle()
      }
    } finally {
      setIsToggling(false)
    }
  }

  const handleClick = () => {
    openFile(task.filePath)
    setCenterPanelView('editor')
    // TODO: Could add line number scrolling support
  }

  const priorityColors = {
    high: 'text-red-400 bg-red-400/10',
    medium: 'text-amber-400 bg-amber-400/10',
    low: 'text-blue-400 bg-blue-400/10',
  }

  const isOverdue = task.dueDate && !task.completed && new Date(task.dueDate) < new Date()

  return (
    <div
      className={`group flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
        task.completed ? 'opacity-60' : ''
      } hover:bg-white/5`}
      onClick={handleClick}
    >
      {/* Checkbox */}
      <button
        onClick={handleToggle}
        disabled={isToggling}
        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all mt-0.5 ${
          task.completed
            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
            : 'border-slate-600 hover:border-cyan-500'
        } ${isToggling ? 'opacity-50' : ''}`}
      >
        {task.completed && <Check className="w-3 h-3" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm ${
            task.completed ? 'text-slate-500 line-through' : 'text-slate-300'
          }`}
        >
          {task.text}
        </span>

        {/* Metadata row */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {/* Priority badge */}
          {task.priority && (
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${priorityColors[task.priority]}`}
            >
              <AlertTriangle className="w-3 h-3" />
              {task.priority}
            </span>
          )}

          {/* Due date */}
          {task.dueDate && (
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                isOverdue
                  ? 'text-red-400 bg-red-400/10'
                  : 'text-slate-500 bg-white/5'
              }`}
            >
              <Calendar className="w-3 h-3" />
              {task.dueDate}
            </span>
          )}

          {/* File indicator */}
          {showFile && (
            <span className="flex items-center gap-1 text-xs text-slate-600">
              <FileText className="w-3 h-3" />
              {getFileName(task.filePath)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
