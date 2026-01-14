import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { KanbanSettings, ListSortBy, KANBAN_COLUMN_ORDER } from '../../types/task'
import { TaskListRow } from './TaskListRow'
import { KanbanTask } from './KanbanBoard'

interface TaskListViewProps {
  tasks: KanbanTask[]
  settings: KanbanSettings
  onTaskUpdate: () => void
  onSortChange: (sortBy: ListSortBy, sortOrder: 'asc' | 'desc') => void
  onGroupByChange: (groupBy: boolean) => void
}

// Priority value for sorting (high = 1, medium = 2, low = 3, undefined = 4)
const priorityValue = (priority?: 'high' | 'medium' | 'low'): number => {
  if (!priority) return 4
  return priority === 'high' ? 1 : priority === 'medium' ? 2 : 3
}

// Status value for sorting based on Kanban column order
const statusValue = (status: string): number => {
  return KANBAN_COLUMN_ORDER.indexOf(status as any)
}

// Parse date for sorting (handles various formats)
const parseDate = (dateStr?: string): Date | null => {
  if (!dateStr) return null
  const parsed = new Date(dateStr)
  return isNaN(parsed.getTime()) ? null : parsed
}

export function TaskListView({
  tasks,
  settings,
  onTaskUpdate,
  onSortChange,
  onGroupByChange
}: TaskListViewProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [showSortDropdown, setShowSortDropdown] = useState(false)

  // Filter tasks based on showCompletedTasks setting
  const filteredTasks = useMemo(() => {
    if (settings.showCompletedTasks) return tasks
    return tasks.filter(t => t.status !== 'done')
  }, [tasks, settings.showCompletedTasks])

  // Sort tasks
  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks]
    const { listSortBy, listSortOrder } = settings
    const multiplier = listSortOrder === 'asc' ? 1 : -1

    sorted.sort((a, b) => {
      let comparison = 0

      switch (listSortBy) {
        case 'dueDate': {
          const dateA = parseDate(a.dueDate)
          const dateB = parseDate(b.dueDate)
          // Tasks with no due date go to the end
          if (!dateA && !dateB) comparison = 0
          else if (!dateA) comparison = 1
          else if (!dateB) comparison = -1
          else comparison = dateA.getTime() - dateB.getTime()
          break
        }
        case 'project':
          comparison = a.projectName.localeCompare(b.projectName)
          break
        case 'status':
          comparison = statusValue(a.status) - statusValue(b.status)
          break
        case 'priority': {
          comparison = priorityValue(a.priority) - priorityValue(b.priority)
          break
        }
      }

      return comparison * multiplier
    })

    return sorted
  }, [filteredTasks, settings.listSortBy, settings.listSortOrder])

  // Group tasks by project if enabled
  const groupedTasks = useMemo(() => {
    if (!settings.listGroupByProject) {
      return { '': sortedTasks }
    }

    const groups: Record<string, KanbanTask[]> = {}
    for (const task of sortedTasks) {
      const key = task.projectName
      if (!groups[key]) groups[key] = []
      groups[key].push(task)
    }
    return groups
  }, [sortedTasks, settings.listGroupByProject])

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupName)) {
        next.delete(groupName)
      } else {
        next.add(groupName)
      }
      return next
    })
  }

  const toggleSortOrder = () => {
    onSortChange(settings.listSortBy, settings.listSortOrder === 'asc' ? 'desc' : 'asc')
  }

  const handleSortByChange = (sortBy: ListSortBy) => {
    onSortChange(sortBy, settings.listSortOrder)
    setShowSortDropdown(false)
  }

  const sortLabels: Record<ListSortBy, string> = {
    dueDate: 'Due Date',
    project: 'Project',
    status: 'Status',
    priority: 'Priority'
  }

  const showProject = settings.selectedProject === null && !settings.listGroupByProject

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sort controls */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5">
        {/* Sort by dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
                       bg-white/5 hover:bg-white/10 transition-colors text-slate-300"
          >
            <ArrowUpDown className="w-4 h-4 text-slate-400" />
            <span>Sort: {sortLabels[settings.listSortBy]}</span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showSortDropdown && (
            <div
              className="absolute top-full left-0 mt-1 z-50 rounded-lg overflow-hidden min-w-[140px]"
              style={{
                background: 'rgba(25, 35, 55, 0.98)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
              }}
            >
              {(Object.keys(sortLabels) as ListSortBy[]).map((sortBy) => (
                <button
                  key={sortBy}
                  onClick={() => handleSortByChange(sortBy)}
                  className={`
                    w-full px-3 py-2 text-left text-sm
                    transition-colors hover:bg-white/10
                    ${settings.listSortBy === sortBy ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-300'}
                  `}
                >
                  {sortLabels[sortBy]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort order toggle */}
        <button
          onClick={toggleSortOrder}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm
                     bg-white/5 hover:bg-white/10 transition-colors text-slate-300"
          title={settings.listSortOrder === 'asc' ? 'Ascending (click to reverse)' : 'Descending (click to reverse)'}
        >
          {settings.listSortOrder === 'asc' ? (
            <ArrowUp className="w-4 h-4 text-cyan-400" />
          ) : (
            <ArrowDown className="w-4 h-4 text-cyan-400" />
          )}
        </button>

        {/* Group by project toggle */}
        <button
          onClick={() => onGroupByChange(!settings.listGroupByProject)}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
            transition-colors
            ${settings.listGroupByProject
              ? 'bg-violet-500/20 text-violet-400'
              : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }
          `}
        >
          Group by Project
        </button>

        {/* Task count */}
        <span className="text-xs text-slate-500 ml-auto">
          {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (
          <div key={groupName || 'all'} className="mb-4 last:mb-0">
            {/* Group header (only if grouping is enabled) */}
            {settings.listGroupByProject && groupName && (
              <button
                onClick={() => toggleGroup(groupName)}
                className="flex items-center gap-2 w-full px-2 py-1.5 mb-2
                           text-sm font-medium text-slate-300 hover:text-white
                           transition-colors"
              >
                {collapsedGroups.has(groupName) ? (
                  <ChevronRight className="w-4 h-4 text-violet-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-violet-400" />
                )}
                <span className="text-violet-400">{groupName}</span>
                <span className="text-xs text-slate-500 ml-1">
                  ({groupTasks.length})
                </span>
              </button>
            )}

            {/* Tasks in group */}
            {!collapsedGroups.has(groupName) && (
              <div className="space-y-2">
                {groupTasks.map((task) => (
                  <TaskListRow
                    key={task.id}
                    task={task}
                    showProject={showProject}
                    onTaskUpdate={onTaskUpdate}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Empty state */}
        {filteredTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-slate-500 text-sm">
              No tasks to display
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
