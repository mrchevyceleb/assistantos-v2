import { useEffect, useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { Save, X, FileText } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

export function MarkdownEditor() {
  const { currentFile, closeFile } = useAppStore()
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const hasChanges = content !== originalContent

  const loadFile = useCallback(async () => {
    if (!currentFile || !window.electronAPI) return
    setIsLoading(true)
    const fileContent = await window.electronAPI.fs.readFile(currentFile)
    if (fileContent !== null) {
      setContent(fileContent)
      setOriginalContent(fileContent)
    }
    setIsLoading(false)
  }, [currentFile])

  useEffect(() => {
    loadFile()
  }, [loadFile])

  const handleSave = async () => {
    if (!currentFile || !window.electronAPI || !hasChanges) return
    setIsSaving(true)
    const success = await window.electronAPI.fs.writeFile(currentFile, content)
    if (success) {
      setOriginalContent(content)
    }
    setIsSaving(false)
  }

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [content, currentFile, hasChanges])

  const fileName = currentFile?.split(/[\\/]/).pop() || ''

  if (!currentFile) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center"
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
      className="h-full flex flex-col"
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

      {/* Monaco Editor */}
      <div className="flex-1">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-pulse text-slate-500">Loading...</div>
          </div>
        ) : (
          <Editor
            height="100%"
            language={fileName.endsWith('.md') ? 'markdown' : 'plaintext'}
            value={content}
            onChange={(value) => setContent(value || '')}
            theme="assistantos-dark"
            beforeMount={(monaco) => {
              // Define custom theme
              monaco.editor.defineTheme('assistantos-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                  { token: 'comment', foreground: '6b7280' },
                  { token: 'keyword', foreground: '00f0ff' },
                  { token: 'string', foreground: '10b981' },
                ],
                colors: {
                  'editor.background': '#0a0a0f',
                  'editor.foreground': '#e2e8f0',
                  'editor.lineHighlightBackground': '#1e293b',
                  'editor.selectionBackground': '#334155',
                  'editorCursor.foreground': '#00f0ff',
                  'editorLineNumber.foreground': '#475569',
                  'editorLineNumber.activeForeground': '#94a3b8',
                  'editor.inactiveSelectionBackground': '#1e293b',
                },
              })
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: 'JetBrains Mono, Consolas, monospace',
              lineNumbers: 'on',
              wordWrap: 'on',
              padding: { top: 16 },
              scrollBeyondLastLine: false,
              renderLineHighlight: 'line',
              cursorBlinking: 'smooth',
              smoothScrolling: true,
            }}
          />
        )}
      </div>
    </div>
  )
}
