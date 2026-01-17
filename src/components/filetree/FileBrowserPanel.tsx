/**
 * File Browser Panel
 * A full-panel version of the file tree for center panel display
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  FolderOpen,
  Plus,
  RefreshCw,
  Star,
  Image,
  Film,
  Music,
  Search,
  Home,
  ArrowUp
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useTabStore } from '../../stores/tabStore'
import { FileContextMenu } from './FileContextMenu'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { NewItemDialog } from './NewItemDialog'
import { isImageFile, isVideoFile, isAudioFile } from '../../utils/fileTypes'
import path from 'path-browserify'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
  isExpanded?: boolean
}

interface ContextMenuStateData {
  x: number
  y: number
  entry: FileEntry
}

interface RenameStateData {
  path: string
  name: string
}

interface NewItemStateData {
  type: 'file' | 'folder'
  parentPath: string
}

type ContextMenuState = ContextMenuStateData | null
type RenameState = RenameStateData | null
type NewItemState = NewItemStateData | null

export function FileBrowserPanel() {
  const { workspacePath, setWorkspacePath, toggleStarred, isStarred, setPendingChatInput } = useAppStore()
  const openOrFocusFile = useTabStore(state => state.openOrFocusFile)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPath, setCurrentPath] = useState<string | null>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  // Rename state
  const [renameState, setRenameState] = useState<RenameState>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null)

  // New file/folder dialog state
  const [newItemState, setNewItemState] = useState<NewItemState>(null)

  useEffect(() => {
    if (workspacePath) {
      setCurrentPath(workspacePath)
    }
  }, [workspacePath])

  const loadDirectory = async (dirPath: string): Promise<FileEntry[]> => {
    if (!window.electronAPI) return []
    const entries = await window.electronAPI.fs.readDir(dirPath)
    return entries
      .filter(entry => !entry.name.startsWith('.')) // Hide dotfiles
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map(entry => ({
        ...entry,
        isExpanded: false,
      }))
  }

  const loadCurrentDirectory = async () => {
    if (!currentPath) return
    const rootFiles = await loadDirectory(currentPath)
    setFiles(rootFiles)
  }

  useEffect(() => {
    loadCurrentDirectory()
  }, [currentPath])

  // Focus rename input when rename mode starts
  useEffect(() => {
    if (renameState && renameInputRef.current) {
      renameInputRef.current.focus()
      const name = renameState.name
      const dotIndex = name.lastIndexOf('.')
      if (dotIndex > 0) {
        renameInputRef.current.setSelectionRange(0, dotIndex)
      } else {
        renameInputRef.current.select()
      }
    }
  }, [renameState])

  const toggleExpand = async (entry: FileEntry) => {
    if (!entry.isDirectory) return

    const newExpanded = new Set(expandedPaths)
    if (newExpanded.has(entry.path)) {
      newExpanded.delete(entry.path)
    } else {
      newExpanded.add(entry.path)
      // Load children if not already loaded
      if (!entry.children) {
        const children = await loadDirectory(entry.path)
        setFiles(prevFiles => updateChildrenRecursive(prevFiles, entry.path, children))
      }
    }
    setExpandedPaths(newExpanded)
  }

  const updateChildrenRecursive = (entries: FileEntry[], targetPath: string, newChildren: FileEntry[]): FileEntry[] => {
    return entries.map(entry => {
      if (entry.path === targetPath) {
        return { ...entry, children: newChildren }
      }
      if (entry.children) {
        return { ...entry, children: updateChildrenRecursive(entry.children, targetPath, newChildren) }
      }
      return entry
    })
  }

  const handleFileClick = (entry: FileEntry) => {
    if (entry.isDirectory) {
      toggleExpand(entry)
    } else {
      openOrFocusFile(entry.path, entry.name)
    }
    setSelectedPath(entry.path)
  }

  const handleDoubleClick = (entry: FileEntry) => {
    if (entry.isDirectory) {
      // Navigate into directory
      setCurrentPath(entry.path)
      setExpandedPaths(new Set())
    } else {
      openOrFocusFile(entry.path, entry.name)
    }
  }

  const navigateUp = () => {
    if (!currentPath) return
    const parentPath = path.dirname(currentPath)
    if (parentPath && parentPath !== currentPath) {
      setCurrentPath(parentPath)
      setExpandedPaths(new Set())
    }
  }

  const navigateHome = () => {
    if (workspacePath) {
      setCurrentPath(workspacePath)
      setExpandedPaths(new Set())
    }
  }

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }

  const handleRename = async () => {
    if (!renameState || !renameValue.trim()) return

    const newPath = path.join(path.dirname(renameState.path), renameValue)

    if (window.electronAPI) {
      const result = await window.electronAPI.fs.rename(renameState.path, newPath)
      if (result.success) {
        loadCurrentDirectory()
      } else {
        setRenameError(result.error || 'Failed to rename')
        return
      }
    }

    setRenameState(null)
    setRenameValue('')
    setRenameError('')
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    if (window.electronAPI) {
      const success = await window.electronAPI.fs.delete(deleteTarget.path)
      if (success) {
        loadCurrentDirectory()
      }
    }

    setDeleteTarget(null)
  }

  const handleNewItem = async (name: string) => {
    if (!newItemState || !name.trim()) return

    const newPath = path.join(newItemState.parentPath, name)

    if (window.electronAPI) {
      let result
      if (newItemState.type === 'folder') {
        result = await window.electronAPI.fs.createDir(newPath)
      } else {
        result = await window.electronAPI.fs.writeFile(newPath, '')
      }
      if (result.success) {
        loadCurrentDirectory()
      }
    }

    setNewItemState(null)
  }

  const handleSendToChat = (entry: FileEntry) => {
    setPendingChatInput(`@${entry.name} `)
  }

  const getFileIcon = (entry: FileEntry) => {
    if (entry.isDirectory) {
      return expandedPaths.has(entry.path)
        ? <FolderOpen className="w-4 h-4 text-amber-400" />
        : <Folder className="w-4 h-4 text-amber-400" />
    }
    if (isImageFile(entry.name)) {
      return <Image className="w-4 h-4 text-emerald-400" />
    }
    if (isVideoFile(entry.name)) {
      return <Film className="w-4 h-4 text-purple-400" />
    }
    if (isAudioFile(entry.name)) {
      return <Music className="w-4 h-4 text-pink-400" />
    }
    return <FileText className="w-4 h-4 text-slate-400" />
  }

  const filterFiles = (entries: FileEntry[]): FileEntry[] => {
    if (!searchQuery.trim()) return entries
    const query = searchQuery.toLowerCase()
    return entries.filter(entry => {
      if (entry.name.toLowerCase().includes(query)) return true
      if (entry.children) {
        const filteredChildren = filterFiles(entry.children)
        return filteredChildren.length > 0
      }
      return false
    })
  }

  const renderEntry = (entry: FileEntry, depth = 0) => {
    const isExpanded = expandedPaths.has(entry.path)
    const isSelected = selectedPath === entry.path
    const starred = isStarred(entry.path)
    const isRenaming = renameState?.path === entry.path

    if (isRenaming) {
      return (
        <div
          key={entry.path}
          className="flex items-center gap-2 py-1 px-2"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {getFileIcon(entry)}
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={e => {
              setRenameValue(e.target.value)
              setRenameError('')
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') {
                setRenameState(null)
                setRenameValue('')
                setRenameError('')
              }
            }}
            onBlur={handleRename}
            className="flex-1 bg-slate-800 text-slate-200 text-sm px-2 py-1 rounded border border-cyan-500/50 focus:outline-none focus:border-cyan-500"
          />
        </div>
      )
    }

    return (
      <div key={entry.path}>
        <div
          className={`
            flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors
            ${isSelected ? 'bg-cyan-500/20 text-cyan-300' : 'hover:bg-white/5 text-slate-300'}
          `}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => handleFileClick(entry)}
          onDoubleClick={() => handleDoubleClick(entry)}
          onContextMenu={e => handleContextMenu(e, entry)}
        >
          {entry.isDirectory && (
            <span className="text-slate-500">
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
          )}
          {!entry.isDirectory && <span className="w-3" />}

          {getFileIcon(entry)}

          <span className="text-sm truncate flex-1">{entry.name}</span>

          {starred && <Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
        </div>

        {/* Children */}
        {entry.isDirectory && isExpanded && entry.children && (
          <div>
            {entry.children.map(child => renderEntry(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const displayedFiles = filterFiles(files)
  const currentPathDisplay = currentPath?.replace(/\\/g, '/').split('/').slice(-2).join('/') || 'No workspace'

  return (
    <div className="h-full flex flex-col bg-slate-900/50">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-white/10">
        <button
          onClick={navigateHome}
          className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200"
          title="Go to workspace root"
        >
          <Home className="w-4 h-4" />
        </button>
        <button
          onClick={navigateUp}
          className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200"
          title="Go up one level"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
        <div className="flex-1 text-sm text-slate-400 truncate">
          .../{currentPathDisplay}
        </div>
        <button
          onClick={loadCurrentDirectory}
          className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setNewItemState({ type: 'file', parentPath: currentPath || '' })}
          className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200"
          title="New file"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-white/5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full bg-slate-800/50 text-slate-200 text-sm pl-8 pr-3 py-2 rounded-lg border border-white/10 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto p-2">
        {!currentPath ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            <p>No workspace open</p>
          </div>
        ) : displayedFiles.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            <p>{searchQuery ? 'No matching files' : 'Empty folder'}</p>
          </div>
        ) : (
          displayedFiles.map(entry => renderEntry(entry, 0))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          path={contextMenu.entry.path}
          name={contextMenu.entry.name}
          isDirectory={contextMenu.entry.isDirectory}
          onClose={() => setContextMenu(null)}
          onRename={() => {
            setRenameState({ path: contextMenu.entry.path, name: contextMenu.entry.name })
            setRenameValue(contextMenu.entry.name)
          }}
          onDelete={() => setDeleteTarget(contextMenu.entry)}
          onSendToChat={() => handleSendToChat(contextMenu.entry)}
          onNewFile={contextMenu.entry.isDirectory ? () => setNewItemState({ type: 'file', parentPath: contextMenu.entry.path }) : undefined}
          onNewFolder={contextMenu.entry.isDirectory ? () => setNewItemState({ type: 'folder', parentPath: contextMenu.entry.path }) : undefined}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteConfirmDialog
          name={deleteTarget.name}
          isDirectory={deleteTarget.isDirectory}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* New item dialog */}
      {newItemState && (
        <NewItemDialog
          type={newItemState.type}
          parentPath={newItemState.parentPath}
          onConfirm={handleNewItem}
          onCancel={() => setNewItemState(null)}
        />
      )}
    </div>
  )
}
