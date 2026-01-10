import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, Folder, FileText, FolderOpen, Plus, RefreshCw } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
  isExpanded?: boolean
}

export function FileTree() {
  const { workspacePath, setWorkspacePath, openFile, currentFile } = useAppStore()
  const [files, setFiles] = useState<FileEntry[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  const loadDirectory = async (dirPath: string): Promise<FileEntry[]> => {
    if (!window.electronAPI) return []
    const entries = await window.electronAPI.fs.readDir(dirPath)
    return entries
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map(entry => ({
        ...entry,
        isExpanded: false,
      }))
  }

  const loadWorkspace = async () => {
    if (!workspacePath) return
    const rootFiles = await loadDirectory(workspacePath)
    setFiles(rootFiles)
  }

  useEffect(() => {
    loadWorkspace()
  }, [workspacePath])

  const handleSelectFolder = async () => {
    if (!window.electronAPI) return
    try {
      const path = await window.electronAPI.fs.selectFolder()
      if (path) {
        setWorkspacePath(path)
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
    }
  }

  const toggleExpand = async (entry: FileEntry) => {
    const newExpanded = new Set(expandedPaths)
    if (expandedPaths.has(entry.path)) {
      newExpanded.delete(entry.path)
    } else {
      newExpanded.add(entry.path)
      if (entry.isDirectory && !entry.children) {
        const children = await loadDirectory(entry.path)
        updateFileEntry(files, entry.path, { children })
      }
    }
    setExpandedPaths(newExpanded)
  }

  const updateFileEntry = (_entries: FileEntry[], path: string, updates: Partial<FileEntry>) => {
    setFiles(prevFiles => updateEntryRecursive(prevFiles, path, updates))
  }

  const updateEntryRecursive = (entries: FileEntry[], path: string, updates: Partial<FileEntry>): FileEntry[] => {
    return entries.map(entry => {
      if (entry.path === path) {
        return { ...entry, ...updates }
      }
      if (entry.children) {
        return { ...entry, children: updateEntryRecursive(entry.children, path, updates) }
      }
      return entry
    })
  }

  const handleFileClick = (entry: FileEntry) => {
    if (entry.isDirectory) {
      toggleExpand(entry)
    } else {
      openFile(entry.path)
    }
  }

  const renderEntry = (entry: FileEntry, depth: number = 0) => {
    const isExpanded = expandedPaths.has(entry.path)
    const isSelected = currentFile === entry.path

    return (
      <div key={entry.path}>
        <div
          className={`flex items-center gap-2 py-1.5 cursor-pointer transition-all rounded-lg mx-2 ${
            isSelected
              ? ''
              : 'hover:bg-white/5'
          }`}
          style={{
            paddingLeft: `${depth * 12 + 10}px`,
            paddingRight: '10px',
            ...(isSelected ? {
              background: 'linear-gradient(90deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 212, 255, 0.05) 100%)',
              borderLeft: '2px solid #00d4ff'
            } : {})
          }}
          onClick={() => handleFileClick(entry)}
        >
          {entry.isDirectory ? (
            <>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              )}
            </>
          ) : (
            <>
              <span className="w-4 flex-shrink-0" />
              <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
            </>
          )}
          <span className={`text-sm truncate ${isSelected ? 'text-cyan-400 font-medium' : 'text-slate-300'}`}>
            {entry.name}
          </span>
        </div>
        {entry.isDirectory && isExpanded && entry.children && (
          <div>
            {entry.children.map(child => renderEntry(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="h-full flex flex-col"
      style={{
        background: 'linear-gradient(180deg, rgba(16, 20, 32, 0.95) 0%, rgba(10, 13, 22, 0.98) 100%)'
      }}
    >
      {/* Header */}
      <div
        className="h-12 px-4 flex items-center justify-between relative"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'linear-gradient(180deg, rgba(25, 32, 50, 0.8) 0%, rgba(16, 20, 32, 0.9) 100%)'
        }}
      >
        {/* Top edge highlight */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: 'linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.02))'
          }}
        />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Files</span>
        <div className="flex items-center gap-1">
          <button
            onClick={loadWorkspace}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={handleSelectFolder}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            title="Open Folder"
          >
            <Plus className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-auto py-2">
        {!workspacePath ? (
          <div className="px-4 py-12 text-center">
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{
                background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.6) 0%, rgba(20, 28, 45, 0.7) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}
            >
              <Folder className="w-8 h-8 text-slate-500" />
            </div>
            <p className="text-sm text-slate-500 mb-4">No folder open</p>
            <button onClick={handleSelectFolder} className="btn-secondary text-sm">
              Open Folder
            </button>
          </div>
        ) : files.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-slate-500">Empty folder</p>
          </div>
        ) : (
          files.map(entry => renderEntry(entry))
        )}
      </div>
    </div>
  )
}
