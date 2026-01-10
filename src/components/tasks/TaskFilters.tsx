import { Eye, EyeOff, FolderTree, Calendar, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

export function TaskFilters() {
  const { taskSettings, setTaskSettings } = useAppStore()

  const sortOptions = [
    { id: 'file' as const, label: 'By File', icon: <FolderTree className="w-3.5 h-3.5" /> },
    { id: 'date' as const, label: 'By Date', icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: 'priority' as const, label: 'By Priority', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  ]

  return (
    <div
      className="px-4 py-2 flex items-center gap-3 flex-wrap"
      style={{
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        background: 'rgba(16, 20, 32, 0.5)'
      }}
    >
      {/* Show completed toggle */}
      <button
        onClick={() => setTaskSettings({ showCompleted: !taskSettings.showCompleted })}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all ${
          taskSettings.showCompleted
            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
            : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'
        }`}
      >
        {taskSettings.showCompleted ? (
          <Eye className="w-3.5 h-3.5" />
        ) : (
          <EyeOff className="w-3.5 h-3.5" />
        )}
        {taskSettings.showCompleted ? 'Showing completed' : 'Hiding completed'}
      </button>

      {/* Sort options */}
      <div className="flex items-center gap-1 ml-auto">
        <span className="text-xs text-slate-500 mr-1">Sort:</span>
        {sortOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => setTaskSettings({ sortBy: option.id })}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
              taskSettings.sortBy === option.id
                ? 'bg-cyan-500/10 text-cyan-400'
                : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'
            }`}
            title={option.label}
          >
            {option.icon}
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
