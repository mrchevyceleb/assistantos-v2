import { useEffect, useState, useCallback, useRef } from 'react'
import { Save, X, FileText, Bold, Italic, List, ListOrdered, Quote, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { EditorContextMenu } from './EditorContextMenu'
import { InsertLinkDialog } from './InsertLinkDialog'
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/kit/core'
import { commonmark, toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand, wrapInBulletListCommand, wrapInOrderedListCommand, wrapInBlockquoteCommand } from '@milkdown/kit/preset/commonmark'
import { gfm, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'
import { history, undoCommand, redoCommand } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { callCommand } from '@milkdown/kit/utils'
import { nord } from '@milkdown/theme-nord'

export function MarkdownEditor() {
  const { currentFile, closeFile, editorFontSize, increaseEditorFontSize, decreaseEditorFontSize, setEditorFontSize } = useAppStore()
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const editorRef = useRef<Editor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const hasChanges = content !== originalContent

  const loadFile = useCallback(async () => {
    if (!currentFile || !window.electronAPI) return
    setIsLoading(true)
    setError(null)
    try {
      const fileContent = await window.electronAPI.fs.readFile(currentFile)
      if (fileContent !== null) {
        setContent(fileContent)
        setOriginalContent(fileContent)
      } else {
        setError('Failed to read file')
      }
    } catch (err) {
      console.error('Error loading file:', err)
      setError(err instanceof Error ? err.message : 'Failed to load file')
    } finally {
      setIsLoading(false)
    }
  }, [currentFile])

  useEffect(() => {
    loadFile()
  }, [loadFile])

  // Initialize Milkdown editor
  useEffect(() => {
    if (isLoading || error || !containerRef.current || !currentFile) return

    const initEditor = async () => {
      // Clean up existing editor
      if (editorRef.current) {
        editorRef.current.destroy()
        editorRef.current = null
      }

      // Clear container
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }

      const editor = await Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, containerRef.current)
          ctx.set(defaultValueCtx, content)
          ctx.set(editorViewOptionsCtx, {
            attributes: {
              class: 'milkdown-editor outline-none prose prose-invert max-w-none',
              spellcheck: 'false',
            },
          })
          ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
            setContent(markdown)
          })
        })
        .config(nord)
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(clipboard)
        .create()

      editorRef.current = editor
    }

    initEditor()

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy()
        editorRef.current = null
      }
    }
  }, [currentFile, isLoading, error]) // Don't include content to avoid re-init on every change

  const handleSave = async () => {
    if (!currentFile || !window.electronAPI || !hasChanges) return
    setIsSaving(true)
    const success = await window.electronAPI.fs.writeFile(currentFile, content)
    if (success) {
      setOriginalContent(content)
    }
    setIsSaving(false)
  }

  // Keyboard shortcuts for editor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      // Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        editorRef.current?.action(callCommand(undoCommand.key))
      }
      // Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        editorRef.current?.action(callCommand(redoCommand.key))
      }
      // Bold
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        editorRef.current?.action(callCommand(toggleStrongCommand.key))
      }
      // Italic
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault()
        editorRef.current?.action(callCommand(toggleEmphasisCommand.key))
      }
      // Inline code
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault()
        editorRef.current?.action(callCommand(toggleInlineCodeCommand.key))
      }
      // Strikethrough
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault()
        editorRef.current?.action(callCommand(toggleStrikethroughCommand.key))
      }
      // Insert link
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        const selection = window.getSelection()
        setSelectedText(selection?.toString() || '')
        setShowLinkDialog(true)
      }
      // Font size shortcuts
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        increaseEditorFontSize()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        decreaseEditorFontSize()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        setEditorFontSize(16)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [content, currentFile, hasChanges, increaseEditorFontSize, decreaseEditorFontSize, setEditorFontSize])

  // Handle link clicks to open in native browser
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a')
      if (link && link.href) {
        const url = link.href
        // Only open external URLs (http/https)
        if (url.startsWith('http://') || url.startsWith('https://')) {
          e.preventDefault()
          e.stopPropagation()
          window.electronAPI?.shell.openExternal(url)
        }
      }
    }

    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [currentFile, isLoading, error])

  // Toolbar commands
  const toggleBold = () => editorRef.current?.action(callCommand(toggleStrongCommand.key))
  const toggleItalic = () => editorRef.current?.action(callCommand(toggleEmphasisCommand.key))
  const toggleBulletList = () => editorRef.current?.action(callCommand(wrapInBulletListCommand.key))
  const toggleOrderedList = () => editorRef.current?.action(callCommand(wrapInOrderedListCommand.key))
  const toggleBlockquote = () => editorRef.current?.action(callCommand(wrapInBlockquoteCommand.key))
  const toggleCode = () => editorRef.current?.action(callCommand(toggleInlineCodeCommand.key))
  const toggleStrikethrough = () => editorRef.current?.action(callCommand(toggleStrikethroughCommand.key))

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const selection = window.getSelection()
    const hasSelection = selection && selection.toString().length > 0
    setSelectedText(hasSelection ? selection.toString() : '')
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  // Clipboard handlers for context menu
  const handleCut = useCallback(() => {
    document.execCommand('cut')
  }, [])

  const handleCopy = useCallback(() => {
    document.execCommand('copy')
  }, [])

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      document.execCommand('insertText', false, text)
    } catch {
      document.execCommand('paste')
    }
  }, [])

  const handleSelectAll = useCallback(() => {
    if (containerRef.current) {
      const range = document.createRange()
      range.selectNodeContents(containerRef.current)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }, [])

  // Link insertion handler
  const handleInsertLink = useCallback((url: string, text?: string) => {
    // Insert markdown link format
    const linkText = text || url
    const markdown = `[${linkText}](${url})`
    document.execCommand('insertText', false, markdown)
    setShowLinkDialog(false)
  }, [])

  const fileName = currentFile?.split(/[\\/]/).pop() || ''

  if (!currentFile) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center"
        style={{
          background: 'linear-gradient(180deg, rgba(16, 20, 32, 0.95) 0%, rgba(10, 13, 22, 0.98) 100%)'
        }}
      >
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
          style={{
            background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.6) 0%, rgba(20, 28, 45, 0.7) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}
        >
          <FileText className="w-10 h-10 text-slate-500" />
        </div>
        <p className="text-lg font-medium mb-2 text-slate-300">No file open</p>
        <p className="text-sm text-slate-500">Select a file from the sidebar to edit</p>
      </div>
    )
  }

  return (
    <div
      className="w-full h-full flex flex-col"
      style={{
        background: 'linear-gradient(180deg, rgba(16, 20, 32, 0.95) 0%, rgba(10, 13, 22, 0.98) 100%)'
      }}
    >
      {/* Editor Header */}
      <div
        className="h-12 flex items-center px-4 gap-2"
        style={{
          background: 'linear-gradient(180deg, rgba(20, 27, 45, 0.9) 0%, rgba(12, 15, 26, 0.95) 100%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}
      >
        <div className="flex items-center gap-2 flex-1">
          <FileText className="w-4 h-4 text-cyan-400" />
          <span className="text-sm text-slate-300 font-medium">{fileName}</span>
          {hasChanges && (
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: '#00d4ff',
                boxShadow: '0 0 8px rgba(0, 212, 255, 0.6)'
              }}
              title="Unsaved changes"
            />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`p-2 rounded-lg transition-all ${
              hasChanges ? 'hover:bg-white/5 text-cyan-400' : 'text-slate-600 cursor-not-allowed'
            }`}
            style={{
              boxShadow: hasChanges ? '0 0 10px rgba(0, 212, 255, 0.2)' : 'none'
            }}
            title="Save (Ctrl+S)"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            onClick={closeFile}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-slate-400"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Formatting Toolbar */}
      {!isLoading && !error && (
        <div
          className="h-10 flex items-center px-4 gap-1"
          style={{
            background: 'rgba(15, 20, 35, 0.8)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.04)'
          }}
        >
          <button
            onClick={toggleBold}
            className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200"
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={toggleItalic}
            className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200"
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-white/10 mx-1" />
          <button
            onClick={toggleBulletList}
            className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200"
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={toggleOrderedList}
            className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200"
            title="Numbered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-white/10 mx-1" />
          <button
            onClick={toggleBlockquote}
            className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200"
            title="Quote"
          >
            <Quote className="w-4 h-4" />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Font Size Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={decreaseEditorFontSize}
              disabled={editorFontSize <= 12}
              className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200 disabled:text-slate-600 disabled:hover:bg-transparent"
              title="Decrease text size (min 12px)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-500 min-w-[40px] text-center">
              {editorFontSize}px
            </span>
            <button
              onClick={increaseEditorFontSize}
              disabled={editorFontSize >= 32}
              className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200 disabled:text-slate-600 disabled:hover:bg-transparent"
              title="Increase text size (max 32px)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            {editorFontSize !== 16 && (
              <button
                onClick={() => setEditorFontSize(16)}
                className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200 ml-1"
                title="Reset to default size (16px)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Milkdown Editor */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-pulse text-slate-500">Loading...</div>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center text-red-400">
            <p className="mb-2">Error loading file</p>
            <p className="text-sm text-slate-500">{error}</p>
            <button
              onClick={loadFile}
              className="mt-4 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Dynamic font size style for Milkdown prose content */}
            <style>{`
              .milkdown-container .milkdown-editor {
                font-size: ${editorFontSize}px !important;
              }
              .milkdown-container .milkdown-editor p,
              .milkdown-container .milkdown-editor li,
              .milkdown-container .milkdown-editor blockquote,
              .milkdown-container .milkdown-editor td,
              .milkdown-container .milkdown-editor th {
                font-size: inherit !important;
              }
              .milkdown-container .milkdown-editor h1 { font-size: ${Math.round(editorFontSize * 2.25)}px !important; }
              .milkdown-container .milkdown-editor h2 { font-size: ${Math.round(editorFontSize * 1.5)}px !important; }
              .milkdown-container .milkdown-editor h3 { font-size: ${Math.round(editorFontSize * 1.25)}px !important; }
              .milkdown-container .milkdown-editor h4 { font-size: ${Math.round(editorFontSize * 1.125)}px !important; }
              .milkdown-container .milkdown-editor code { font-size: ${Math.round(editorFontSize * 0.875)}px !important; }
              .milkdown-container .milkdown-editor pre code { font-size: ${Math.round(editorFontSize * 0.875)}px !important; }
            `}</style>
            <div
              ref={containerRef}
              className="milkdown-container h-full p-6"
              onContextMenu={handleContextMenu}
            />
          </>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <EditorContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCut={handleCut}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onSelectAll={handleSelectAll}
          onBold={toggleBold}
          onItalic={toggleItalic}
          onStrikethrough={toggleStrikethrough}
          onCode={toggleCode}
          onInsertLink={() => {
            setContextMenu(null)
            setShowLinkDialog(true)
          }}
          hasSelection={selectedText.length > 0}
        />
      )}

      {/* Insert Link Dialog */}
      {showLinkDialog && (
        <InsertLinkDialog
          initialText={selectedText}
          onConfirm={handleInsertLink}
          onCancel={() => setShowLinkDialog(false)}
        />
      )}
    </div>
  )
}
