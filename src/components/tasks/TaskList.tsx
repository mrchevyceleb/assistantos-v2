import { useAppStore } from '../../stores/appStore'
import { ParsedTask } from '../../types/task'
import { TaskItem } from './TaskItem'
import { getFileName } from '../../services/taskParser'

interface TaskListProps {
  tasks: ParsedTask[]
  onTaskToggle: () => void
}

export function TaskList({ tasks, onTaskToggle }: TaskListProps) {
  const { taskSettings } = useAppStore()

  if (!taskSettings.groupByFile) {
    return (
      <div className="p-4 space-y-2">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} onToggle={onTaskToggle} showFile />
        ))}
      </div>
    )
  }

  // Group tasks by file
  const groupedTasks = tasks.reduce((acc, task) => {
    if (!acc[task.filePath]) {
      acc[task.filePath] = []
    }
    acc[task.filePath].push(task)
    return acc
  }, {} as Record<string, ParsedTask[]>)

  return (
    <div className="p-4 space-y-4">
      {Object.entries(groupedTasks).map(([filePath, fileTasks]) => (
        <div key={filePath}>
          {/* File header */}
          <div className="flex items-center gap-2 mb-2 px-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: 'linear-gradient(135deg, #00d4ff, #00a8cc)' }}
            />
            <span className="text-xs font-medium text-slate-400 truncate">
              {getFileName(filePath)}
            </span>
            <span className="text-xs text-slate-500">
              ({fileTasks.filter(t => !t.completed).length}/{fileTasks.length})
            </span>
          </div>

          {/* Tasks */}
          <div className="space-y-1">
            {fileTasks.map((task) => (
              <TaskItem key={task.id} task={task} onToggle={onTaskToggle} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
