import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ParsedTask, TaskStatus, TASK_STATUS_CONFIG } from '../../types/task'
import { KanbanCard } from './KanbanCard'

interface KanbanColumnProps {
  status: TaskStatus
  tasks: ParsedTask[]
  showProject?: boolean
  onDragStart: (e: React.DragEvent, task: ParsedTask) => void
  onDrop: (status: TaskStatus) => void
  onAddTask?: (status: TaskStatus) => void
  onDelete?: (task: ParsedTask) => void
}

export function KanbanColumn({
  status,
  tasks,
  showProject = false,
  onDragStart,
  onDrop,
  onAddTask,
  onDelete
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const config = TASK_STATUS_CONFIG[status]

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    onDrop(status)
  }

  return (
    <div
      className={`
        flex flex-col min-w-[280px] max-w-[320px] flex-1
        rounded-xl overflow-hidden transition-all duration-200
        ${isDragOver ? 'ring-2 ring-cyan-400/50 scale-[1.02]' : ''}
      `}
      style={{
        background: isDragOver
          ? 'linear-gradient(180deg, rgba(6, 182, 212, 0.1) 0%, rgba(16, 20, 32, 0.95) 100%)'
          : 'linear-gradient(180deg, rgba(25, 32, 50, 0.6) 0%, rgba(16, 20, 32, 0.8) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(0, 0, 0, 0.2)'
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${config.bgColor}`}
            style={{
              boxShadow: `0 0 8px ${config.color.replace('text-', 'rgb(').replace('-400', ', 0.5)')}`
            }}
          />
          <h3 className={`text-sm font-semibold ${config.color}`}>
            {config.label}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              color: 'rgba(255, 255, 255, 0.6)'
            }}
          >
            {tasks.length}
          </span>
          {onAddTask && (
            <button
              onClick={() => onAddTask(status)}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              title={`Add task to ${config.label}`}
            >
              <Plus className="w-4 h-4 text-slate-400 hover:text-cyan-400" />
            </button>
          )}
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px]">
        {tasks.length === 0 ? (
          <div
            className={`
              h-full min-h-[150px] flex items-center justify-center
              rounded-lg border-2 border-dashed
              ${isDragOver ? 'border-cyan-400/50' : 'border-slate-700/50'}
              transition-colors duration-200
            `}
          >
            <p className="text-xs text-slate-500">
              {isDragOver ? 'Drop here' : 'No tasks'}
            </p>
          </div>
        ) : (
          tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              showProject={showProject}
              onDragStart={onDragStart}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  )
}
