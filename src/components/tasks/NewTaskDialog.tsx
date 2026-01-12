import { useState, useRef, useEffect } from 'react'
import { X, Calendar, Folder, FileText } from 'lucide-react'
import { TaskStatus, TASK_STATUS_CONFIG } from '../../types/task'

interface NewTaskDialogProps {
  onConfirm: (projectName: string, taskTitle: string, dueDate: string, status: TaskStatus) => void
  onCancel: () => void
  defaultProject?: string
  defaultStatus?: TaskStatus
}

export function NewTaskDialog({ onConfirm, onCancel, defaultProject = '', defaultStatus = 'todo' }: NewTaskDialogProps) {
  const [projectName, setProjectName] = useState(defaultProject)
  const [taskTitle, setTaskTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState<TaskStatus>(defaultStatus)
  const [error, setError] = useState('')

  const titleInputRef = useRef<HTMLInputElement>(null)

  // Focus title input on mount
  useEffect(() => {
    titleInputRef.current?.focus()
  }, [])

  // Set default due date to today
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    setDueDate(today)
  }, [])

  const handleSubmit = () => {
    // Validation
    if (!projectName.trim()) {
      setError('Project name is required')
      return
    }
    if (!taskTitle.trim()) {
      setError('Task title is required')
      return
    }
    if (!dueDate) {
      setError('Due date is required')
      return
    }

    // Validate due date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(dueDate)) {
      setError('Invalid date format (use YYYY-MM-DD)')
      return
    }

    onConfirm(projectName.trim(), taskTitle.trim(), dueDate, status)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(30, 35, 50, 0.98) 0%, rgba(20, 25, 38, 0.99) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 25px 80px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.1) inset'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            New Task
          </h2>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-white/5 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Project Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <Folder className="w-4 h-4 text-cyan-400" />
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value)
                setError('')
              }}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Website Redesign"
              className="input-metallic w-full"
            />
          </div>

          {/* Task Title */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Task Title
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={taskTitle}
              onChange={(e) => {
                setTaskTitle(e.target.value)
                setError('')
              }}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Design homepage mockup"
              className="input-metallic w-full"
            />
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value)
                setError('')
              }}
              onKeyDown={handleKeyDown}
              className="input-metallic w-full"
            />
          </div>

          {/* Initial Status */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Initial Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['backlog', 'todo', 'in_progress', 'review'] as TaskStatus[]).map((statusOption) => {
                const config = TASK_STATUS_CONFIG[statusOption]
                const isSelected = status === statusOption
                return (
                  <button
                    key={statusOption}
                    onClick={() => setStatus(statusOption)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      isSelected
                        ? `${config.color} ${config.bgColor} border border-current`
                        : 'text-slate-400 bg-white/5 border border-transparent hover:bg-white/10'
                    }`}
                  >
                    {config.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary"
          >
            Create Task
          </button>
        </div>
      </div>
    </div>
  )
}
