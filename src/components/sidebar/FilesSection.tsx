import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileText, Star, RefreshCw, Plus } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useTabStore } from '../../stores/tabStore'
// isMediaFile imported if needed for future media handling
import { FileSearch, FileSearchHandle } from './FileSearch'
import { FileContextMenu } from '../filetree/FileContextMenu'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

interface ContextMenuState {
  x: number
  y: number
  entry: FileEntry
}

interface FileItemProps {
  entry: FileEntry
  depth: number
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onFileClick: (path: string) => void
  isStarred: (path: string) => boolean
  onToggleStar: (path: string) => void
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void
}

function FileItem({
  entry,
  depth,
  expandedPaths,
  onToggleExpand,
  onFileClick,
  isStarred,
  onToggleStar,
  onContextMenu,
}: FileItemProps) {
  const isExpanded = expandedPaths.has(entry.path)
  const starred = isStarred(entry.path)

  // Hide dotfiles
  if (entry.name.startsWith('.')) {
    return null
  }

  const handleClick = () => {
    if (entry.isDirectory) {
      onToggleExpand(entry.path)
    } else {
      onFileClick(entry.path)
    }
  }

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleStar(entry.path)
  }

  return (
    <div>
      <div
        className={`
          group flex items-center gap-1 py-1 px-2 cursor-pointer
          hover:bg-white/5 rounded transition-colors text-slate-400
          ${starred ? 'text-amber-400' : 'hover:text-white'}
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, entry)}
      >
        {/* Expand/Collapse Icon */}
        {entry.isDirectory ? (
          isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          )
        ) : (
          <span className="w-3.5" />
        )}

        {/* File/Folder Icon */}
        {entry.isDirectory ? (
          isExpanded ? (
            <FolderOpen className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          )
        ) : (
          <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
        )}

        {/* Name */}
        <span className="text-sm truncate flex-1">{entry.name}</span>

        {/* Star Button */}
        {!entry.isDirectory && (
          <button
            onClick={handleStarClick}
            className={`
              p-0.5 rounded transition-opacity
              ${starred
                ? 'opacity-100 text-amber-400'
                : 'opacity-0 group-hover:opacity-100 text-slate-500 hover:text-amber-400'
              }
            `}
          >
            <Star className={`w-3 h-3 ${starred ? 'fill-current' : ''}`} />
          </button>
        )}
      </div>

      {/* Children */}
      {entry.isDirectory && isExpanded && entry.children && (
        <div>
          {entry.children.map((child) => (
            <FileItem
              key={child.path}
              entry={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onFileClick={onFileClick}
              isStarred={isStarred}
              onToggleStar={onToggleStar}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export interface FilesSectionHandle {
  focusSearch: () => void
}

export function FilesSection() {
  const [isCollapsed, setIsCollapsed] = useState(true)  // Collapsed by default
  const [files, setFiles] = useState<FileEntry[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const searchRef = useRef<FileSearchHandle>(null)

  const workspacePath = useAppStore(state => state.workspacePath)
  const setWorkspacePath = useAppStore(state => state.setWorkspacePath)
  const starredPaths = useAppStore(state => state.starredPaths)
  const toggleStarred = useAppStore(state => state.toggleStarred)
  const isStarred = useAppStore(state => state.isStarred)

  const openOrFocusFile = useTabStore(state => state.openOrFocusFile)

  // Global keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+P or Ctrl+Shift+F to focus search
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || (e.shiftKey && e.key === 'F'))) {
        e.preventDefault()
        // Expand the section if collapsed
        if (isCollapsed) {
          setIsCollapsed(false)
        }
        // Focus search after a brief delay to allow expansion animation
        setTimeout(() => {
          searchRef.current?.focus()
        }, 50)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCollapsed])

  // Load files when workspace changes or section expands
  useEffect(() => {
    if (workspacePath && !isCollapsed) {
      loadFiles()
    }
  }, [workspacePath, isCollapsed])

  const loadFiles = async () => {
    if (!workspacePath) return

    setIsLoading(true)
    try {
      const entries = await loadDirectory(workspacePath)
      setFiles(entries)
    } catch (error) {
      console.error('Failed to load files:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadDirectory = async (dirPath: string): Promise<FileEntry[]> => {
    try {
      const items = await window.electronAPI.fs.readDir(dirPath)
      const entries: FileEntry[] = []

      for (const item of items) {
        // Skip dotfiles
        if (item.name.startsWith('.')) continue

        const entry: FileEntry = {
          name: item.name,
          path: item.path,
          isDirectory: item.isDirectory,
        }

        // Pre-load expanded directories
        if (item.isDirectory && expandedPaths.has(item.path)) {
          entry.children = await loadDirectory(item.path)
        }

        entries.push(entry)
      }

      // Sort: folders first, then alphabetically
      return entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
    } catch {
      return []
    }
  }

  const handleToggleExpand = async (path: string) => {
    const newExpanded = new Set(expandedPaths)

    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
      // Load children if needed
      const updateChildren = async (entries: FileEntry[]): Promise<FileEntry[]> => {
        return Promise.all(
          entries.map(async (entry) => {
            if (entry.path === path && entry.isDirectory && !entry.children) {
              return {
                ...entry,
                children: await loadDirectory(entry.path),
              }
            }
            if (entry.children) {
              return {
                ...entry,
                children: await updateChildren(entry.children),
              }
            }
            return entry
          })
        )
      }
      setFiles(await updateChildren(files))
    }

    setExpandedPaths(newExpanded)
  }

  const handleFileClick = (path: string) => {
    openOrFocusFile(path)
  }

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      entry
    })
  }

  const handleSelectFolder = async () => {
    try {
      const folderPath = await window.electronAPI.fs.selectFolder()
      if (folderPath) {
        setWorkspacePath(folderPath)
        setIsCollapsed(false) // Expand to show the new workspace
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
    }
  }

  // Count starred files in current workspace
  const starredCount = starredPaths.filter(p =>
    workspacePath && p.startsWith(workspacePath)
  ).length

  return (
    <div className="border-t border-white/5 flex flex-col flex-1 min-h-0">
      {/* Section Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="
          w-full flex items-center justify-between px-4 py-3
          text-slate-400 hover:text-white transition-colors cursor-pointer
        "
      >
        <div className="flex items-center gap-2">
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          <Folder className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-medium uppercase tracking-wider">Files</span>
          {starredCount > 0 && (
            <span className="text-xs text-amber-400">
              ({starredCount} starred)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleSelectFolder()
            }}
            className="p-1 rounded hover:bg-white/10"
            title="Select workspace folder"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {!isCollapsed && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                loadFiles()
              }}
              className="p-1 rounded hover:bg-white/10"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Search and File Tree */}
      {!isCollapsed && (
        <>
          {/* Search Input */}
          {workspacePath && (
            <div className="px-3 py-2 border-b border-white/5">
              <FileSearch ref={searchRef} />
            </div>
          )}

          {/* File Tree */}
          <div className="pb-2 flex-1 overflow-y-auto">
            {!workspacePath ? (
              <div className="px-4 py-2 text-xs text-slate-500">
                No workspace selected
              </div>
            ) : files.length === 0 ? (
              <div className="px-4 py-2 text-xs text-slate-500">
                {isLoading ? 'Loading...' : 'Empty workspace'}
              </div>
            ) : (
              files.map((entry) => (
                <FileItem
                  key={entry.path}
                  entry={entry}
                  depth={0}
                  expandedPaths={expandedPaths}
                  onToggleExpand={handleToggleExpand}
                  onFileClick={handleFileClick}
                  isStarred={isStarred}
                  onToggleStar={toggleStarred}
                  onContextMenu={handleContextMenu}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          path={contextMenu.entry.path}
          name={contextMenu.entry.name}
          isDirectory={contextMenu.entry.isDirectory}
          onClose={() => setContextMenu(null)}
          onRename={() => {
            // TODO: Add rename support
            setContextMenu(null)
          }}
          onDelete={() => {
            // TODO: Add delete support
            setContextMenu(null)
          }}
          onSendToChat={() => {
            // TODO: Add send to chat support
            setContextMenu(null)
          }}
        />
      )}
    </div>
  )
}
