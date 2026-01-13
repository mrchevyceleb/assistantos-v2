import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronRight, ChevronDown, Folder, FileText, FolderOpen, Plus, RefreshCw, Star, GripVertical, Image, Film, Music, Maximize2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useTabStore } from '../../stores/tabStore'
import { StarredSection } from './StarredSection'
import { FileContextMenu } from './FileContextMenu'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { NewItemDialog } from './NewItemDialog'
import { useLinkHandler } from '../../hooks/useLinkHandler'
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

export function FileTree() {
  const { workspacePath, setWorkspacePath, openFile, currentFile, toggleStarred, isStarred, setCenterPanelView, setPendingChatInput } = useAppStore()
  const openOrFocusFiles = useTabStore(state => state.openOrFocusFiles)
  const { openLocalFile } = useLinkHandler()
  const [files, setFiles] = useState<FileEntry[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

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

  const loadWorkspace = async () => {
    if (!workspacePath) return
    const rootFiles = await loadDirectory(workspacePath)
    setFiles(rootFiles)
  }

  useEffect(() => {
    loadWorkspace()
  }, [workspacePath])

  // Focus rename input when rename mode starts
  useEffect(() => {
    if (renameState && renameInputRef.current) {
      renameInputRef.current.focus()
      // Select the filename without extension for files
      const name = renameState.name
      const dotIndex = name.lastIndexOf('.')
      if (dotIndex > 0) {
        renameInputRef.current.setSelectionRange(0, dotIndex)
      } else {
        renameInputRef.current.select()
      }
    }
  }, [renameState])

  // Keyboard shortcuts for selected file
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedPath) return
      if (renameState) return // Don't handle shortcuts during rename

      // Find the selected entry
      const findEntry = (entries: FileEntry[]): FileEntry | null => {
        for (const entry of entries) {
          if (entry.path === selectedPath) return entry
          if (entry.children) {
            const found = findEntry(entry.children)
            if (found) return found
          }
        }
        return null
      }

      const selectedEntry = findEntry(files)
      if (!selectedEntry) return

      if (e.key === 'F2') {
        e.preventDefault()
        startRename(selectedEntry)
      } else if (e.key === 'Delete') {
        e.preventDefault()
        setDeleteTarget(selectedEntry)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handleFileClick(selectedEntry)
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault()
        window.electronAPI?.fs.copyPath(selectedPath)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath, files, renameState])

  const handleSelectFolder = async () => {
    if (!window.electronAPI) return
    try {
      const selectedPath = await window.electronAPI.fs.selectFolder()
      if (selectedPath) {
        setWorkspacePath(selectedPath)
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

  const updateFileEntry = (_entries: FileEntry[], filePath: string, updates: Partial<FileEntry>) => {
    setFiles(prevFiles => updateEntryRecursive(prevFiles, filePath, updates))
  }

  const updateEntryRecursive = (entries: FileEntry[], filePath: string, updates: Partial<FileEntry>): FileEntry[] => {
    return entries.map(entry => {
      if (entry.path === filePath) {
        return { ...entry, ...updates }
      }
      if (entry.children) {
        return { ...entry, children: updateEntryRecursive(entry.children, filePath, updates) }
      }
      return entry
    })
  }

  // File extensions that should open in the built-in browser
  const browserOpenableExtensions = new Set(['.html', '.htm', '.svg', '.pdf'])

  const handleFileClick = (entry: FileEntry, e?: React.MouseEvent) => {
    // Don't handle clicks during rename
    if (renameState?.path === entry.path) return

    setSelectedPath(entry.path)

    if (entry.isDirectory) {
      toggleExpand(entry)
    } else {
      const ext = entry.name.toLowerCase().slice(entry.name.lastIndexOf('.'))
      const isBrowserOpenable = browserOpenableExtensions.has(ext)

      // Ctrl+click opens in built-in browser (for any file that browser can render)
      if (e?.ctrlKey || e?.metaKey) {
        if (isBrowserOpenable) {
          openLocalFile(entry.path)
          return
        }
      }

      // For HTML files, default to browser; for others, default to editor
      if (isBrowserOpenable && ext !== '.svg') {
        openLocalFile(entry.path)
      } else {
        // For media files or text files, open in the editor/viewer
        openFile(entry.path)
        // Also switch to editor view to show the file
        setCenterPanelView('editor')
      }
    }
  }

  // Handle right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    console.log('[Bug-Hunter] FileTree handleContextMenu called', { x: e.clientX, y: e.clientY, entry: entry.name })
    e.preventDefault()
    e.stopPropagation()
    setSelectedPath(entry.path)
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      entry
    })
    console.log('[Bug-Hunter] FileTree contextMenu state set')
  }, [])

  // Handle drag start for file/folder entries
  const handleDragStart = useCallback((e: React.DragEvent, entry: FileEntry) => {
    e.dataTransfer.setData('text/plain', entry.path)
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  // Start rename mode
  const startRename = (entry: FileEntry) => {
    setRenameState({ path: entry.path, name: entry.name })
    setRenameValue(entry.name)
    setRenameError('')
  }

  // Complete rename
  const completeRename = async () => {
    if (!renameState || !window.electronAPI) return

    const newName = renameValue.trim()
    if (!newName) {
      setRenameError('Name cannot be empty')
      return
    }

    if (newName === renameState.name) {
      setRenameState(null)
      return
    }

    // Validate name
    const invalidChars = /[<>:"/\\|?*]/
    if (invalidChars.test(newName)) {
      setRenameError('Invalid characters in name')
      return
    }

    const parentDir = path.dirname(renameState.path)
    const newPath = path.join(parentDir, newName)

    const result = await window.electronAPI.fs.rename(renameState.path, newPath)
    if (result.success) {
      // Update the current file if it was renamed
      if (currentFile === renameState.path) {
        openFile(newPath)
      }
      await loadWorkspace()
      setRenameState(null)
    } else {
      setRenameError(result.error || 'Failed to rename')
    }
  }

  // Cancel rename
  const cancelRename = () => {
    setRenameState(null)
    setRenameError('')
  }

  // Handle delete
  const handleDelete = async () => {
    if (!deleteTarget || !window.electronAPI) return

    const result = await window.electronAPI.fs.delete(deleteTarget.path)
    if (result.success) {
      // Close the file if it was open
      if (currentFile === deleteTarget.path) {
        openFile(null as unknown as string)
      }
      await loadWorkspace()
    } else {
      console.error('Failed to delete:', result.error)
    }
    setDeleteTarget(null)
  }

  // Handle new file/folder creation
  const handleCreateNewItem = async (name: string) => {
    if (!newItemState || !window.electronAPI) return

    const newPath = path.join(newItemState.parentPath, name)

    if (newItemState.type === 'folder') {
      const success = await window.electronAPI.fs.createDir(newPath)
      if (success) {
        // Expand parent folder
        setExpandedPaths(prev => new Set([...prev, newItemState.parentPath]))
        await loadWorkspace()
      }
    } else {
      // Create empty file
      const success = await window.electronAPI.fs.writeFile(newPath, '')
      if (success) {
        // Expand parent folder and open new file
        setExpandedPaths(prev => new Set([...prev, newItemState.parentPath]))
        await loadWorkspace()
        openFile(newPath)
        setCenterPanelView('editor')
      }
    }

    setNewItemState(null)
  }

  // Send to chat as @mention (populates input, doesn't auto-send)
  const sendToChat = (entry: FileEntry) => {
    // Get relative path from workspace
    const relativePath = workspacePath
      ? entry.path.replace(workspacePath, '').replace(/^[/\\]/, '')
      : entry.name

    // Add @mention to chat input (user can add their prompt and send manually)
    setPendingChatInput(`@${relativePath} `)
  }

  const renderEntry = (entry: FileEntry, depth: number = 0) => {
    const isExpanded = expandedPaths.has(entry.path)
    const isSelected = selectedPath === entry.path
    const isCurrent = currentFile === entry.path
    const starred = isStarred(entry.path)
    const isRenaming = renameState?.path === entry.path

    return (
      <div key={entry.path}>
        <div
          className={`group flex items-center gap-2 py-1.5 cursor-pointer transition-all rounded-lg mx-2 ${
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
          onClick={(e) => handleFileClick(entry, e)}
          onContextMenu={(e) => handleContextMenu(e, entry)}
          draggable={!isRenaming}
          onDragStart={(e) => handleDragStart(e, entry)}
        >
          {/* Drag handle indicator - shows on hover */}
          <GripVertical className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 cursor-grab" />
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
              {isImageFile(entry.path) ? (
                <Image className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              ) : isVideoFile(entry.path) ? (
                <Film className="w-4 h-4 text-violet-400 flex-shrink-0" />
              ) : isAudioFile(entry.path) ? (
                <Music className="w-4 h-4 text-pink-400 flex-shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
              )}
            </>
          )}

          {/* Inline rename input or name display */}
          {isRenaming ? (
            <div className="flex-1 flex items-center gap-1">
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => {
                  setRenameValue(e.target.value)
                  setRenameError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    completeRename()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelRename()
                  }
                  e.stopPropagation()
                }}
                onBlur={completeRename}
                onClick={(e) => e.stopPropagation()}
                className={`flex-1 text-sm px-1.5 py-0.5 rounded outline-none ${
                  renameError ? 'bg-red-500/20 text-red-300' : 'bg-black/30 text-white'
                }`}
                style={{
                  border: renameError ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(0, 212, 255, 0.3)'
                }}
              />
            </div>
          ) : (
            <span className={`text-sm truncate flex-1 ${isCurrent ? 'text-cyan-400 font-medium' : 'text-slate-300'}`}>
              {entry.name}
            </span>
          )}

          {/* Star button - shows on hover or if starred (hidden during rename) */}
          {!isRenaming && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleStarred(entry.path)
              }}
              className={`p-1 rounded hover:bg-white/10 transition-all flex-shrink-0 ${
                starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              title={starred ? 'Unstar' : 'Star'}
            >
              <Star className={`w-3 h-3 ${starred ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
            </button>
          )}
        </div>

        {/* Rename error tooltip */}
        {isRenaming && renameError && (
          <div
            className="mx-2 mt-1 px-2 py-1 text-xs text-red-400 bg-red-500/10 rounded"
            style={{ marginLeft: `${depth * 12 + 10}px` }}
          >
            {renameError}
          </div>
        )}

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
            onClick={openOrFocusFiles}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            title="Open in Tab"
          >
            <Maximize2 className="w-4 h-4 text-slate-500" />
          </button>
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

      {/* Starred Section */}
      {workspacePath && <StarredSection />}

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

      {/* Context Menu */}
      {contextMenu && (
        <>
          {console.log('[Bug-Hunter] FileTree rendering FileContextMenu', contextMenu)}
          <FileContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            path={contextMenu.entry.path}
            name={contextMenu.entry.name}
            isDirectory={contextMenu.entry.isDirectory}
            onClose={() => setContextMenu(null)}
            onRename={() => startRename(contextMenu.entry)}
            onDelete={() => setDeleteTarget(contextMenu.entry)}
            onSendToChat={() => sendToChat(contextMenu.entry)}
            onNewFile={contextMenu.entry.isDirectory ? () => setNewItemState({ type: 'file', parentPath: contextMenu.entry.path }) : undefined}
            onNewFolder={contextMenu.entry.isDirectory ? () => setNewItemState({ type: 'folder', parentPath: contextMenu.entry.path }) : undefined}
          />
        </>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          name={deleteTarget.name}
          isDirectory={deleteTarget.isDirectory}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* New File/Folder Dialog */}
      {newItemState && (
        <NewItemDialog
          type={newItemState.type}
          parentPath={newItemState.parentPath}
          onConfirm={handleCreateNewItem}
          onCancel={() => setNewItemState(null)}
        />
      )}
    </div>
  )
}
