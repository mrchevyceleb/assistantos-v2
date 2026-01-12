import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight, StickyNote, X, Plus } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'

export function QuickNotesSection() {
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [newNoteText, setNewNoteText] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const quickNotes = useAppStore((state) => state.quickNotes)
  const addQuickNote = useAppStore((state) => state.addQuickNote)
  const deleteQuickNote = useAppStore((state) => state.deleteQuickNote)

  // Focus input when adding mode is enabled
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isAdding])

  const handleAddNote = () => {
    const trimmed = newNoteText.trim()
    if (trimmed) {
      addQuickNote(trimmed)
      setNewNoteText('')
      setIsAdding(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAddNote()
    } else if (e.key === 'Escape') {
      setIsAdding(false)
      setNewNoteText('')
    }
  }

  const handleStartAdding = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsAdding(true)
    // Make sure section is expanded
    if (isCollapsed) {
      setIsCollapsed(false)
    }
  }

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="border-b border-white/5 flex-shrink-0">
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
          <StickyNote className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-medium uppercase tracking-wider">Quick Notes</span>
          {quickNotes.length > 0 && (
            <span className="text-xs text-slate-500">
              ({quickNotes.length})
            </span>
          )}
        </div>

        {/* Add Button */}
        <button
          onClick={handleStartAdding}
          className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-amber-400 transition-colors"
          title="Add note"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Notes Content */}
      {!isCollapsed && (
        <div className="px-3 pb-3">
          {/* New Note Input */}
          {isAdding && (
            <div className="mb-2">
              <textarea
                ref={inputRef}
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  if (!newNoteText.trim()) {
                    setIsAdding(false)
                  }
                }}
                placeholder="Type a quick note..."
                className="
                  w-full px-2 py-1.5 text-xs
                  bg-slate-800/50 border border-slate-700/50
                  rounded text-slate-200 placeholder-slate-500
                  focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20
                  resize-none
                "
                rows={2}
                maxLength={200}
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-slate-600">
                  Press Enter to save, Esc to cancel
                </span>
                <span className="text-[10px] text-slate-600">
                  {newNoteText.length}/200
                </span>
              </div>
            </div>
          )}

          {/* Notes List */}
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {quickNotes.length === 0 && !isAdding ? (
              <div className="text-xs text-slate-500 py-2 px-1">
                No notes yet. Click + to add one.
              </div>
            ) : (
              quickNotes.map((note) => (
                <div
                  key={note.id}
                  className="
                    group relative
                    bg-slate-800/30 border border-slate-700/30
                    rounded px-2 py-1.5
                    hover:border-slate-600/50 transition-colors
                  "
                >
                  {/* Note Text */}
                  <p className="text-xs text-slate-300 pr-5 whitespace-pre-wrap break-words">
                    {note.text}
                  </p>

                  {/* Timestamp */}
                  <span className="text-[10px] text-slate-600 mt-1 block">
                    {formatTimeAgo(note.createdAt)}
                  </span>

                  {/* Delete Button */}
                  <button
                    onClick={() => deleteQuickNote(note.id)}
                    className="
                      absolute top-1 right-1
                      p-0.5 rounded
                      text-slate-600 hover:text-red-400
                      opacity-0 group-hover:opacity-100
                      transition-opacity
                    "
                    title="Delete note"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
