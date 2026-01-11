import { useState } from 'react'
import { FolderKanban, Plus, ChevronDown, Layers } from 'lucide-react'
import { createProject } from '../../services/taskParser'

interface ProjectSelectorProps {
  projects: string[]
  selectedProject: string | null
  onSelectProject: (project: string | null) => void
  workspacePath: string | null
  onProjectCreated: () => void
}

export function ProjectSelector({
  projects,
  selectedProject,
  onSelectProject,
  workspacePath,
  onProjectCreated
}: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  const handleCreateProject = async () => {
    if (!workspacePath || !newProjectName.trim()) return

    const success = await createProject(workspacePath, newProjectName.trim())
    if (success) {
      setNewProjectName('')
      setIsCreating(false)
      onProjectCreated()
      onSelectProject(newProjectName.trim())
    }
  }

  const displayName = selectedProject || 'All Projects'

  return (
    <div className="relative">
      {/* Selector Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
                   hover:bg-white/5 text-slate-200"
        style={{
          background: 'rgba(0, 0, 0, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        {selectedProject ? (
          <FolderKanban className="w-4 h-4 text-cyan-400" />
        ) : (
          <Layers className="w-4 h-4 text-violet-400" />
        )}
        <span className="text-sm font-medium">{displayName}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => {
              setIsOpen(false)
              setIsCreating(false)
            }}
          />

          {/* Dropdown Menu */}
          <div
            className="absolute top-full left-0 mt-2 min-w-[220px] rounded-lg overflow-hidden z-20
                       shadow-xl animate-in fade-in slide-in-from-top-2 duration-200"
            style={{
              background: 'linear-gradient(180deg, rgba(30, 35, 50, 0.98) 0%, rgba(20, 25, 40, 0.99) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            {/* All Projects option */}
            <button
              onClick={() => {
                onSelectProject(null)
                setIsOpen(false)
              }}
              className={`
                w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm
                transition-colors hover:bg-white/5
                ${selectedProject === null ? 'bg-violet-500/10 text-violet-300' : 'text-slate-300'}
              `}
            >
              <Layers className="w-4 h-4 text-violet-400" />
              All Projects
            </button>

            {/* Divider */}
            {projects.length > 0 && (
              <div className="border-t border-white/5 my-1" />
            )}

            {/* Project List */}
            {projects.map((project) => (
              <button
                key={project}
                onClick={() => {
                  onSelectProject(project)
                  setIsOpen(false)
                }}
                className={`
                  w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm
                  transition-colors hover:bg-white/5
                  ${selectedProject === project ? 'bg-cyan-500/10 text-cyan-300' : 'text-slate-300'}
                `}
              >
                <FolderKanban className="w-4 h-4 text-cyan-400" />
                {project}
              </button>
            ))}

            {/* No projects message */}
            {projects.length === 0 && (
              <div className="px-4 py-3 text-xs text-slate-500">
                No projects yet. Create your first one below.
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-white/5 my-1" />

            {/* Create New Project */}
            {isCreating ? (
              <div className="p-3 space-y-2">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-black/30 text-slate-200
                             border border-white/10 focus:border-cyan-500/50 focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateProject()
                    if (e.key === 'Escape') {
                      setIsCreating(false)
                      setNewProjectName('')
                    }
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateProject}
                    disabled={!newProjectName.trim()}
                    className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg
                               bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30
                               disabled:opacity-50 disabled:cursor-not-allowed
                               transition-colors"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setIsCreating(false)
                      setNewProjectName('')
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg
                               text-slate-400 hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm
                           text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Project
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
