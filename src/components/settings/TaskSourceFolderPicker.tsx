/**
 * Task Source Folder Picker
 * Allows users to configure which folders to scan for tasks
 */

import { useState } from 'react'
import { FolderOpen, Plus, X, Trash2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

interface TaskSourceFolderPickerProps {
  paths: string[]
  onChange: (paths: string[]) => void
}

export function TaskSourceFolderPicker({ paths = [], onChange }: TaskSourceFolderPickerProps) {
  const { workspacePath } = useAppStore()
  // Ensure paths is always an array (handles undefined from persisted state)
  const safePaths = paths || []
  const [isAdding, setIsAdding] = useState(false)
  const [newPath, setNewPath] = useState('')

  const handleAddPath = () => {
    if (newPath.trim() && !safePaths.includes(newPath.trim())) {
      onChange([...safePaths, newPath.trim()])
      setNewPath('')
      setIsAdding(false)
    }
  }

  const handleRemovePath = (pathToRemove: string) => {
    onChange(safePaths.filter(p => p !== pathToRemove))
  }

  const handleBrowseFolder = async () => {
    if (!window.electronAPI || !workspacePath) return

    const selected = await window.electronAPI.fs.selectFolder()
    if (selected) {
      // Convert to relative path if within workspace
      const normalizedSelected = selected.replace(/\\/g, '/')
      const normalizedWorkspace = workspacePath.replace(/\\/g, '/')

      let relativePath = normalizedSelected
      if (normalizedSelected.startsWith(normalizedWorkspace)) {
        relativePath = normalizedSelected.slice(normalizedWorkspace.length)
        // Remove leading slash
        if (relativePath.startsWith('/')) {
          relativePath = relativePath.slice(1)
        }
      }

      if (relativePath && !safePaths.includes(relativePath)) {
        onChange([...safePaths, relativePath])
      }
    }
  }

  return (
    <div className="space-y-2">
      {/* Current paths */}
      {safePaths.length > 0 ? (
        <div className="space-y-1.5">
          {safePaths.map((path) => (
            <div
              key={path}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg"
              style={{
                background: 'rgba(0, 0, 0, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.05)'
              }}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FolderOpen className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span className="text-sm text-slate-300 truncate">{path}</span>
              </div>
              <button
                onClick={() => handleRemovePath(path)}
                className="p-1 hover:bg-red-500/20 rounded text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"
                title="Remove folder"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500 italic py-2">
          No folders configured. Add folders to limit task scanning.
        </p>
      )}

      {/* Add new path */}
      {isAdding ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="e.g., 01-Active/tasks"
            className="input-metallic flex-1 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddPath()
              if (e.key === 'Escape') setIsAdding(false)
            }}
          />
          <button
            onClick={handleAddPath}
            disabled={!newPath.trim()}
            className="px-3 py-2 text-sm bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
          <button
            onClick={() => setIsAdding(false)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Type path
          </button>
          <button
            onClick={handleBrowseFolder}
            disabled={!workspacePath}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-violet-400 hover:bg-violet-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderOpen className="w-4 h-4" />
            Browse
          </button>
        </div>
      )}
    </div>
  )
}
